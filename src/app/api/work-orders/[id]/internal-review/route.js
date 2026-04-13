/**
 * POST /api/work-orders/[id]/internal-review
 * ─────────────────────────────────────────────
 * Transitions WO to internal_review status.
 * If the caller is a mechanic without can_send_estimates:
 *   - inserts in-app notification (via RPC)
 *   - sends email + SMS to the provider owner
 * If the caller IS the owner, no notification needed.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const BRAND   = 'Motiifix'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request, { params }) {
  try {
    const supabase     = await createClient()
    const sc           = getServiceClient()
    const { id: woId } = await params

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Get new status id ─────────────────────────────────────────────────────
    const { data: newStatus } = await supabase
      .from('work_order_statuses')
      .select('id').eq('code', 'internal_review').single()

    if (!newStatus) {
      return NextResponse.json({ error: 'internal_review status not found — run migration first' }, { status: 500 })
    }

    // ── Update WO status ──────────────────────────────────────────────────────
    const { error: upErr } = await supabase
      .from('work_orders')
      .update({ status_id: newStatus.id, updated_at: new Date().toISOString() })
      .eq('id', woId)

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    // ── Call RPC to determine if notification is needed + insert in-app notif ─
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'notify_internal_review_needed',
      { p_work_order_id: woId, p_mechanic_uid: user.id }
    )

    if (rpcErr) {
      console.warn('[internal-review] RPC error (non-fatal):', rpcErr.message)
      return NextResponse.json({ success: true, notified: false })
    }

    if (!rpcResult.notified) {
      // Owner is the one transitioning, or mechanic has can_send_estimates
      return NextResponse.json({ success: true, notified: false, reason: rpcResult.reason })
    }

    const { owner_user_id, wo_number, vehicle_plate, provider_name, mechanic_name } = rpcResult

    // ── Resolve owner contact ─────────────────────────────────────────────────
    const { data: ownerProfile } = await sc
      .from('user_profiles')
      .select('first_name, last_name, phone, email, auth_user_id')
      .eq('id', owner_user_id)
      .maybeSingle()

    let ownerEmail = ownerProfile?.email || null
    if (!ownerEmail && ownerProfile?.auth_user_id) {
      const { data: au } = await sc.auth.admin.getUserById(ownerProfile.auth_user_id)
      ownerEmail = au?.user?.email || null
    }
    const ownerPhone = ownerProfile?.phone || null
    const ownerName  = ownerProfile
      ? `${ownerProfile.first_name || ''} ${ownerProfile.last_name || ''}`.trim() || 'Provider'
      : 'Provider'

    const woUrl = `${APP_URL()}/provider/work-orders/${woId}`

    console.log(`[internal-review] wo=${wo_number} owner=${ownerEmail||'none'} phone=${ownerPhone||'none'}`)

    const comms = []

    // ── Email to owner ────────────────────────────────────────────────────────
    if (ownerEmail) {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">
  <tr>
    <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND}</p>
      <p style="margin:0;font-size:14px;color:#ddd6fe;">📋 Estimate Review Required</p>
    </td>
  </tr>
  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 16px;">Hello ${ownerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      <strong>${mechanic_name || 'Your mechanic'}</strong> has completed the services &amp; parts estimates for work order
      <strong>${wo_number}</strong> and it is ready for your review.
    </p>
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;width:38%;">Work Order</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:700;">${wo_number}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Vehicle</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${vehicle_plate || '—'}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Prepared by</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${mechanic_name || '—'}</td></tr>
      </table>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#1e40af;font-size:13px;">
        Please review the services and parts estimates. Once satisfied, you can send them to the customer for approval.
      </p>
    </div>
    <div style="text-align:center;">
      <a href="${woUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Review Estimates
      </a>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

      const text = `${BRAND} — Estimate Review Required

Hello ${ownerName},

${mechanic_name || 'Your mechanic'} has completed estimates for work order ${wo_number} (${vehicle_plate || '—'}).

Please review and send to customer for approval: ${woUrl}
— ${BRAND}`

      comms.push(
        sendAndQueueEmail(sc, {
          to:      [{ Email: ownerEmail, Name: ownerName }],
          subject: `Estimate Review Required — ${wo_number}`,
          html,
          text,
        })
        .then(() => console.log(`[internal-review] ✓ email → ${ownerEmail}`))
        .catch(e  => console.error('[internal-review] ✗ email:', e.message))
      )
    }

    // ── SMS to owner ──────────────────────────────────────────────────────────
    if (ownerPhone) {
      const phone = normalisePhone(ownerPhone)
      if (phone) {
        const msg = `${BRAND}: ${mechanic_name || 'Mechanic'} has completed estimates for WO ${wo_number} (${vehicle_plate || '—'}). Please review & send to customer: ${woUrl}`
        comms.push(
          sendAndQueueSms(sc, { to: phone, message: msg })
          .then(() => console.log(`[internal-review] ✓ SMS → ${phone}`))
          .catch(e  => console.error('[internal-review] ✗ SMS:', e.message))
        )
      }
    }

    await Promise.allSettled(comms)

    return NextResponse.json({
      success:    true,
      notified:   true,
      email_sent: !!ownerEmail,
      sms_sent:   !!(ownerPhone && normalisePhone(ownerPhone)),
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/internal-review error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}