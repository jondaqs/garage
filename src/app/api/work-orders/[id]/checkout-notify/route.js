/**
 * POST /api/work-orders/[id]/checkout-notify
 * Sends email + SMS to the vehicle owner after provider submits checkout.
 * Called non-blocking from CheckoutTab after confirm_checkout RPC succeeds.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { sendAndQueueEmail }                   from '@/lib/email/transport'

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

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Load WO
    const { data: wo } = await sc
      .from('work_orders')
      .select('id, work_order_number, vehicle_id, service_provider_id')
      .eq('id', workOrderId).maybeSingle()
    if (!wo) return NextResponse.json({ error: 'WO not found' }, { status: 404 })

    const { data: sp }  = await sc.from('service_providers').select('name, phone').eq('id', wo.service_provider_id).maybeSingle()
    const { data: veh } = await sc.from('vehicles').select('plate_number').eq('id', wo.vehicle_id).maybeSingle()

    // Find owner
    const { data: vo } = await sc
      .from('vehicle_ownership')
      .select('owner_user_id, owner_company_id')
      .eq('vehicle_id', wo.vehicle_id).maybeSingle()

    let ownerProfileId = vo?.owner_user_id
    if (!ownerProfileId && vo?.owner_company_id) {
      // Company fleet — resolve the actual company owner, not an arbitrary member
      const { data: companyRow } = await sc
        .from('company_profiles').select('owner_user_id')
        .eq('id', vo.owner_company_id).maybeSingle()
      ownerProfileId = companyRow?.owner_user_id || null
    }
    if (!ownerProfileId) return NextResponse.json({ success: true, skipped: 'no owner' })

    const { data: profile } = await sc
      .from('user_profiles').select('first_name, last_name, email, phone, auth_user_id').eq('id', ownerProfileId).maybeSingle()
    if (!profile) return NextResponse.json({ success: true, skipped: 'no profile' })

    // Resolve email — fall back to auth.users if not on profile
    let ownerEmail = profile.email || null
    if (!ownerEmail && profile.auth_user_id) {
      try {
        const { data: au } = await sc.auth.admin.getUserById(profile.auth_user_id)
        ownerEmail = au?.user?.email || null
      } catch {}
    }

    const ownerName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Customer'
    const woUrl     = `${APP_URL()}/dashboard/work-orders/${workOrderId}/invoice`
    // Company members see work orders at a different path
    const companyWoUrl = vo?.owner_company_id
      ? `${APP_URL()}/dashboard/company/${vo.owner_company_id}/work-orders/${workOrderId}`
      : woUrl
    const plate     = veh?.plate_number || ''
    const provider  = sp?.name || 'Your garage'

    const subject = `Action Required: Review Checkout for ${plate} — ${wo.work_order_number}`
    const smsBody  = `${BRAND}: ${provider} has submitted the checkout for your vehicle ${plate} (${wo.work_order_number}). Please review and confirm: ${woUrl}`

    // Parameterised email builder so we can personalise per recipient
    const buildEmailHtml = (recipientName, reviewUrl) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Checkout Review</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Vehicle Checkout Review</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 12px;color:#1e293b;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
      <strong>${provider}</strong> has completed the checkout process for your vehicle
      <strong>${plate}</strong> (Work Order ${wo.work_order_number}).
    </p>
    <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
      Please review the road test results and vehicle handover checklist, then
      <strong>accept or decline</strong> the checkout. Once accepted, your work order will be officially closed.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${reviewUrl}"
        style="display:inline-block;background:#0f172a;color:#fff;
          padding:14px 36px;border-radius:10px;text-decoration:none;
          font-weight:700;font-size:15px;">
        Review Checkout
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

    let emailSent = false, smsSent = false

    // Send to the primary owner
    if (ownerEmail) {
      try {
        await sendAndQueueEmail(sc, {
          to:             [{ Email: ownerEmail, Name: ownerName }],
          subject,
          html:           buildEmailHtml(ownerName, woUrl),
          text:           smsBody,
          referenceTable: 'work_orders',
          referenceId:    workOrderId,
        })
        emailSent = true
      } catch (e) { console.error('[checkout-notify] email:', e.message) }
    }

    const phone = normalisePhone(profile.phone)
    if (phone) {
      try {
        const r = await sendAndQueueSms(sc, {
          to:            phone,
          recipientName: ownerName,
          message:       smsBody,
          referenceTable:'work_orders',
          referenceId:   workOrderId,
        })
        smsSent = r?.sent
      } catch (e) { console.error('[checkout-notify] sms:', e.message) }
    }

    // ── Notify company members with can_approve_checkout (non-fatal) ──────
    let companyMembersNotified = 0
    if (vo?.owner_company_id) {
      try {
        const companyId = vo.owner_company_id
        const seenIds = new Set()
        // Skip the company owner — already notified above
        if (ownerProfileId) seenIds.add(ownerProfileId)

        const { data: checkoutApprovers } = await sc
          .from('company_users')
          .select(`
            user_id,
            user:user_profiles(id, first_name, last_name, phone, email, auth_user_id)
          `)
          .eq('company_id', companyId)
          .eq('is_active', true)
          .eq('can_approve_checkout', true)

        for (const row of checkoutApprovers || []) {
          const u = row.user
          if (!u || seenIds.has(u.id)) continue
          seenIds.add(u.id)

          const memberName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Team Member'

          // Resolve email
          let memberEmail = u.email || null
          if (!memberEmail && u.auth_user_id) {
            try {
              const { data: au } = await sc.auth.admin.getUserById(u.auth_user_id)
              memberEmail = au?.user?.email || null
            } catch {}
          }

          const memberSmsBody = `${BRAND}: ${provider} has submitted the checkout for fleet vehicle ${plate} (${wo.work_order_number}). Please review and confirm: ${companyWoUrl}`

          if (memberEmail) {
            try {
              await sendAndQueueEmail(sc, {
                to:             [{ Email: memberEmail, Name: memberName }],
                subject,
                html:           buildEmailHtml(memberName, companyWoUrl),
                text:           memberSmsBody,
                referenceTable: 'work_orders',
                referenceId:    workOrderId,
              })
              companyMembersNotified++
            } catch (e) { console.error(`[checkout-notify] company member ${u.id} email:`, e.message) }
          }

          const memberPhone = normalisePhone(u.phone)
          if (memberPhone) {
            try {
              await sendAndQueueSms(sc, {
                to:            memberPhone,
                recipientName: memberName,
                message:       memberSmsBody,
                referenceTable:'work_orders',
                referenceId:   workOrderId,
              })
            } catch (e) { console.error(`[checkout-notify] company member ${u.id} sms:`, e.message) }
          }
        }
      } catch (e) {
        console.error('[checkout-notify] company members notification (non-fatal):', e.message)
      }
    }

    return NextResponse.json({ success: true, email_sent: emailSent, sms_sent: smsSent, company_members_notified: companyMembersNotified })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/checkout-notify error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}