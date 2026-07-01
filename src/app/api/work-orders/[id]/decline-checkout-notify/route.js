/**
 * POST /api/work-orders/[id]/decline-checkout-notify
 * Called non-blocking from CheckoutAcceptanceCard after a successful decline_checkout RPC.
 * Sends email + SMS to provider owner + all active SPU admins/managers/accountants
 * + mechanics with can_approve_work.
 *
 * Body: { reason?: string }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { commsLimiter } from '@/lib/rateLimiters'

const BRAND   = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Read optional reason from body
    let reason = null
    try { const body = await request.json(); reason = body?.reason || null } catch (_) {}

    // Load work order
    const { data: wo } = await sc
      .from('work_orders_secure')
      .select('id, work_order_number, vehicle_id, service_provider_id')
      .eq('id', workOrderId)
      .maybeSingle()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // Load vehicle + provider names
    const { data: veh } = await sc.from('vehicles_secure').select('plate_number, make, model').eq('id', wo.vehicle_id).maybeSingle()
    const { data: sp }  = await sc.from('service_providers_secure').select('name').eq('id', wo.service_provider_id).maybeSingle()

    const plate       = veh?.plate_number || 'vehicle'
    const vehicleDesc = [veh?.plate_number, veh?.make, veh?.model].filter(Boolean).join(' ')
    const woUrl       = `${APP_URL()}/provider/work-orders/${workOrderId}`

    // Collect all provider recipients
    const recipients = []
    const seenIds    = new Set()

    const addRecipient = (r) => {
      if (!r?.user_id || seenIds.has(r.user_id)) return
      seenIds.add(r.user_id)
      recipients.push(r)
    }

    // Provider owner
    const { data: spOwner } = await sc
      .from('service_providers_secure')
      .select('owner_user_id, user_profiles_secure!owner_user_id(first_name, last_name, email, phone)')
      .eq('id', wo.service_provider_id)
      .maybeSingle()
    if (spOwner?.owner_user_id) {
      addRecipient({
        user_id:    spOwner.owner_user_id,
        first_name: spOwner.user_profiles?.first_name,
        last_name:  spOwner.user_profiles?.last_name,
        email:      spOwner.user_profiles?.email,
        phone:      spOwner.user_profiles?.phone,
      })
    }

    // SPU staff
    const { data: spuList } = await sc
      .from('service_provider_users')
      .select('user_id, user_profiles_secure!user_id(first_name, last_name, email, phone)')
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .in('role', ['admin', 'manager', 'accountant'])
    for (const spu of spuList || []) {
      addRecipient({
        user_id:    spu.user_id,
        first_name: spu.user_profiles?.first_name,
        last_name:  spu.user_profiles?.last_name,
        email:      spu.user_profiles?.email,
        phone:      spu.user_profiles?.phone,
      })
    }

    // Mechanics with can_approve_work
    const { data: mechList } = await sc
      .from('mechanics')
      .select('user_id, user_profiles_secure!user_id(first_name, last_name, email, phone)')
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .eq('can_approve_work', true)
    for (const m of mechList || []) {
      addRecipient({
        user_id:    m.user_id,
        first_name: m.user_profiles?.first_name,
        last_name:  m.user_profiles?.last_name,
        email:      m.user_profiles?.email,
        phone:      m.user_profiles?.phone,
      })
    }

    if (recipients.length === 0) return NextResponse.json({ success: true, notified: 0 })

    const subject = `Checkout Declined — Action Required · ${wo.work_order_number}`
    const smsText = `${BRAND}: The customer has declined the checkout for ${plate} (${wo.work_order_number}).${reason ? ` Reason: ${reason}.` : ''} Please review and resubmit: ${woUrl}`

    const buildEmail = (recipientName) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Checkout Declined</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Action Required — Checkout Declined</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#ef4444,#f87171,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 12px;color:#1e293b;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
      The customer has <strong style="color:#dc2626;">declined the checkout</strong> for work order
      <strong>${wo.work_order_number}</strong> (${vehicleDesc}).
    </p>
    ${reason ? `
    <div style="margin:0 0 20px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em;">Reason given</p>
      <p style="margin:0;font-size:14px;color:#7f1d1d;">${reason}</p>
    </div>` : ''}
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      Please open the work order, go to the <strong>Checkout tab</strong>, review the customer's concerns,
      and <strong>resubmit the checkout form</strong> once the issues have been addressed.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${woUrl}"
        style="display:inline-block;background:#dc2626;color:#fff;
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
            html:           buildEmail(rName),
            text:           smsText,
            referenceTable: 'work_orders',
            referenceId:    workOrderId,
          })
          emailsSent++
        } catch (e) { console.error('[decline-checkout-notify] email:', e.message) }
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
        } catch (e) { console.error('[decline-checkout-notify] sms:', e.message) }
      }
    }

    return NextResponse.json({
      success:     true,
      notified:    recipients.length,
      emails_sent: emailsSent,
      sms_sent:    smsSent,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/decline-checkout-notify error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}