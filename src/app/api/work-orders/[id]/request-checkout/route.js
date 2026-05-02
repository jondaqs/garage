/**
 * POST /api/work-orders/[id]/request-checkout
 * Called by the vehicle owner / company member when an invoice exists but
 * the provider has not yet submitted the checkout form.
 *
 * 1. Verifies the caller owns / has access to the vehicle on this work order.
 * 2. Inserts in-app notifications for the provider owner + all active SPU
 *    admins/managers/accountants + mechanics with can_approve_work.
 * 3. Sends email + SMS to those recipients.
 * 4. Returns { success, notified } so the client can show confirmation.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const BRAND   = 'Motiifix'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request, { params }) {
  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params

    // Auth
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await sc
      .from('user_profiles')
      .select('id, first_name, last_name')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (!callerProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

    // Load work order
    const { data: wo } = await sc
      .from('work_orders')
      .select('id, work_order_number, vehicle_id, service_provider_id')
      .eq('id', workOrderId)
      .maybeSingle()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // Verify caller has access to this vehicle (owner or company member)
    const { data: vo } = await sc
      .from('vehicle_ownership')
      .select('owner_user_id, owner_company_id')
      .eq('vehicle_id', wo.vehicle_id)
      .maybeSingle()

    let hasAccess = vo?.owner_user_id === callerProfile.id
    if (!hasAccess && vo?.owner_company_id) {
      const { data: cu } = await sc
        .from('company_users')
        .select('id')
        .eq('company_id', vo.owner_company_id)
        .eq('user_id', callerProfile.id)
        .eq('is_active', true)
        .maybeSingle()
      if (cu) hasAccess = true
    }
    if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Load provider + vehicle info for notification content
    const { data: sp }  = await sc.from('service_providers').select('name, phone').eq('id', wo.service_provider_id).maybeSingle()
    const { data: veh } = await sc.from('vehicles').select('plate_number, make, model').eq('id', wo.vehicle_id).maybeSingle()

    const callerName  = `${callerProfile.first_name || ''} ${callerProfile.last_name || ''}`.trim() || 'The customer'
    const plate       = veh?.plate_number || 'vehicle'
    const vehicleDesc = [veh?.plate_number, veh?.make, veh?.model].filter(Boolean).join(' ')
    const woUrl       = `${APP_URL()}/provider/work-orders/${workOrderId}`

    // Collect provider recipients: owner + SPU admins/managers/accountants + mechanics with can_approve_work
    const recipients = []
    const seenIds    = new Set()

    const addRecipient = (r) => {
      if (!r?.user_id || seenIds.has(r.user_id)) return
      seenIds.add(r.user_id)
      recipients.push(r)
    }

    // Provider owner
    const { data: spOwner } = await sc
      .from('service_providers')
      .select('owner_user_id, user_profiles!owner_user_id(first_name, last_name, email, phone, auth_user_id)')
      .eq('id', wo.service_provider_id)
      .maybeSingle()
    if (spOwner?.owner_user_id) {
      addRecipient({
        user_id:      spOwner.owner_user_id,
        first_name:   spOwner.user_profiles?.first_name,
        last_name:    spOwner.user_profiles?.last_name,
        email:        spOwner.user_profiles?.email,
        phone:        spOwner.user_profiles?.phone,
        auth_user_id: spOwner.user_profiles?.auth_user_id,
      })
    }

    // SPU staff
    const { data: spuList } = await sc
      .from('service_provider_users')
      .select('user_id, user_profiles!user_id(first_name, last_name, email, phone, auth_user_id)')
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .in('role', ['admin', 'manager', 'accountant'])
    for (const spu of spuList || []) {
      addRecipient({
        user_id:      spu.user_id,
        first_name:   spu.user_profiles?.first_name,
        last_name:    spu.user_profiles?.last_name,
        email:        spu.user_profiles?.email,
        phone:        spu.user_profiles?.phone,
        auth_user_id: spu.user_profiles?.auth_user_id,
      })
    }

    // Mechanics with can_approve_work
    const { data: mechList } = await sc
      .from('mechanics')
      .select('user_id, user_profiles!user_id(first_name, last_name, email, phone, auth_user_id)')
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .eq('can_approve_work', true)
    for (const m of mechList || []) {
      addRecipient({
        user_id:      m.user_id,
        first_name:   m.user_profiles?.first_name,
        last_name:    m.user_profiles?.last_name,
        email:        m.user_profiles?.email,
        phone:        m.user_profiles?.phone,
        auth_user_id: m.user_profiles?.auth_user_id,
      })
    }

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, notified: 0 })
    }

    const title   = `Checkout Requested — ${wo.work_order_number}`
    const message = `${callerName} has received the invoice for work order ${wo.work_order_number} (${vehicleDesc}) and is requesting the checkout form before making payment. Please complete the checkout in the work order.`

    // In-app notifications for all recipients
    await sc.from('notifications').insert(
      recipients.map(r => ({
        user_id:          r.user_id,
        recipient_user_id: r.user_id,
        type:             'checkout_requested',
        notification_type: 'checkout_requested',
        title,
        message,
        reference_table:  'work_orders',
        reference_id:     workOrderId,
        reference_type:   'work_order',
        is_read:          false,
      }))
    )

    // Flag the work order so provider list/detail can surface it without extra queries
    await sc
      .from('work_orders')
      .update({ checkout_requested: true, updated_at: new Date().toISOString() })
      .eq('id', workOrderId)

    // Email + SMS
    const subject  = `Action Needed: ${callerName} is requesting checkout for ${plate} — ${wo.work_order_number}`
    const smsText  = `${BRAND}: ${callerName} has received the invoice for ${plate} (${wo.work_order_number}) and is waiting for the checkout form before payment. Open: ${woUrl}`

    const emailHtml = (recipientName) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Checkout Requested</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Action Required — Checkout Request</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 12px;color:#1e293b;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
      <strong>${callerName}</strong> has received the invoice for work order
      <strong>${wo.work_order_number}</strong> (${vehicleDesc}) and is requesting
      the <strong>checkout form</strong> before making payment.
    </p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      Please open the work order, go to the <strong>Checkout tab</strong>, complete the
      road-test checklist and submit the checkout so the customer can confirm and pay.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${woUrl}"
        style="display:inline-block;background:#0f172a;color:#fff;
          padding:14px 36px;border-radius:10px;text-decoration:none;
          font-weight:700;font-size:15px;">
        Open Work Order
      </a>
    </div>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} ${BRAND} · Kenya</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

    let emailsSent = 0, smsSent = 0
    for (const r of recipients) {
      const rName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Team'
      if (r.email) {
        try {
          await sendAndQueueEmail(sc, {
            to:             [{ Email: r.email, Name: rName }],
            subject,
            html:           emailHtml(rName),
            text:           smsText,
            referenceTable: 'work_orders',
            referenceId:    workOrderId,
          })
          emailsSent++
        } catch (e) { console.error('[request-checkout] email:', e.message) }
      }
      const phone = normalisePhone(r.phone)
      if (phone) {
        try {
          const res = await sendAndQueueSms(sc, {
            to:             phone,
            recipientName:  rName,
            message:        smsText,
            referenceTable: 'work_orders',
            referenceId:    workOrderId,
          })
          if (res?.sent) smsSent++
        } catch (e) { console.error('[request-checkout] sms:', e.message) }
      }
    }

    return NextResponse.json({
      success:      true,
      notified:     recipients.length,
      emails_sent:  emailsSent,
      sms_sent:     smsSent,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/request-checkout error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}