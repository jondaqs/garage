/**
 * POST /api/work-orders/[id]/internal-review
 * Transitions WO to internal_review status.
 * Notifies all owner + admin + accountant members via in-app + email + SMS.
 * (The RPC handles in-app; this route handles email + SMS for each recipient.)
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { commsLimiter } from '@/lib/rateLimiters'

const BRAND   = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildEmailHtml({ recipientName, mechanicName, woNumber, vehiclePlate, providerName, woUrl }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:26px 32px 22px;text-align:center;">
    <p style="margin:0 0 4px;font-size:21px;font-weight:700;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#ddd6fe;">📋 Estimate Review Required</p>
  </td></tr>
  <tr><td style="padding:28px;">
    <p style="color:#111827;font-size:15px;margin:0 0 14px;">Hello ${recipientName},</p>
    <p style="color:#374151;font-size:14px;margin:0 0 20px;">
      <strong>${mechanicName || 'A team member'}</strong> has completed the services &amp; parts estimates
      for work order <strong>${woNumber}</strong> and it is ready for your review.
    </p>
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:16px;margin:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:36%;">Work Order</td>
            <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:700;">${woNumber}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Vehicle</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;">${vehiclePlate || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Prepared by</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;">${mechanicName || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Provider</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;">${providerName || '—'}</td></tr>
      </table>
    </div>
    <div style="text-align:center;">
      <a href="${woUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Review Estimates
      </a>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND}</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase     = await createClient()
    const sc           = getServiceClient()
    const { id: woId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Transition WO status ──────────────────────────────────────────────────
    const { data: newStatus } = await supabase
      .from('work_order_statuses')
      .select('id').eq('code', 'internal_review').single()

    if (!newStatus) {
      return NextResponse.json(
        { error: 'internal_review status not found — run migration first' },
        { status: 500 }
      )
    }

    const { error: upErr } = await supabase
      .from('work_orders')
      .update({ status_id: newStatus.id, updated_at: new Date().toISOString() })
      .eq('id', woId)

    if (upErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

    // ── Call RPC: inserts in-app notifications + returns recipient list ───────
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'notify_internal_review_needed',
      { p_work_order_id: woId, p_mechanic_uid: user.id }
    )

    if (rpcErr) {
      console.warn('[internal-review] RPC error (non-fatal):', rpcErr.message)
      return NextResponse.json({ success: true, notified: false })
    }

    if (!rpcResult.notified) {
      return NextResponse.json({ success: true, notified: false, reason: rpcResult.reason })
    }

    const { recipients = [], wo_number, vehicle_plate, provider_name, mechanic_name } = rpcResult
    const woUrl = `${APP_URL()}/provider/work-orders/${woId}`

    console.log(`[internal-review] wo=${wo_number} recipients=${recipients.length}`)

    // ── Send email + SMS to each recipient ───────────────────────────────────
    const comms = []
    let emailCount = 0
    let smsCount   = 0

    for (const recipient of recipients) {
      // Resolve email if not in profile
      let email = recipient.email || null
      if (!email && recipient.auth_user_id) {
        const { data: au } = await sc.auth.admin.getUserById(recipient.auth_user_id)
        email = au?.user?.email || null
      }
      if (!email) {
        // Try auth lookup via user_profiles
        const { data: up } = await sc
          .from('user_profiles_secure')
          .select('email, auth_user_id')
          .eq('id', recipient.user_id)
          .maybeSingle()
        email = up?.email || null
        if (!email && up?.auth_user_id) {
          const { data: au } = await sc.auth.admin.getUserById(up.auth_user_id)
          email = au?.user?.email || null
        }
      }

      const recipientName = recipient.name || 'Team Member'
      const html = buildEmailHtml({
        recipientName, mechanicName: mechanic_name, woNumber: wo_number,
        vehiclePlate: vehicle_plate, providerName: provider_name, woUrl
      })

      if (email) {
        emailCount++
        comms.push(
          sendAndQueueEmail(sc, {
            to:      [{ Email: email, Name: recipientName }],
            subject: `Estimate Review Required — ${wo_number}`,
            html,
            text: `${BRAND}: ${mechanic_name || 'A mechanic'} completed estimates for WO ${wo_number} (${vehicle_plate || '—'}). Review: ${woUrl}`,
          })
          .then(() => console.log(`[internal-review] ✓ email → ${email}`))
          .catch(e  => console.error('[internal-review] ✗ email:', e.message))
        )
      }

      const phone = normalisePhone(recipient.phone)
      if (phone) {
        smsCount++
        comms.push(
          sendAndQueueSms(sc, {
            to:      phone,
            message: `${BRAND}: ${mechanic_name || 'Mechanic'} completed estimates for WO ${wo_number} (${vehicle_plate || '—'}). Review: ${woUrl}`,
          })
          .then(() => console.log(`[internal-review] ✓ SMS → ${phone}`))
          .catch(e  => console.error('[internal-review] ✗ SMS:', e.message))
        )
      }
    }

    await Promise.allSettled(comms)

    return NextResponse.json({
      success:         true,
      notified:        true,
      recipient_count: recipients.length,
      email_count:     emailCount,
      sms_count:       smsCount,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/internal-review error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}