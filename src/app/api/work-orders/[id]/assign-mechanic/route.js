/**
 * POST /api/work-orders/[id]/assign-mechanic
 * Assigns a mechanic to a work order, sends in-app notification (via RPC),
 * then fires email + SMS to the mechanic.
 *
 * Body: { mechanicId }  — mechanics.id (not user_profiles.id)
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const BRAND   = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  : '—'

export async function POST(request, { params }) {
  try {
    const supabase     = await createClient()
    const sc           = getServiceClient()
    const { id: woId } = await params
    const { mechanicId } = await request.json()

    if (!mechanicId) {
      return NextResponse.json({ error: 'mechanicId is required' }, { status: 400 })
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Call RPC: updates WO + inserts in-app notification ───────────────────
    console.log(`[assign-mechanic] wo=${woId} mechanic=${mechanicId}`)
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'assign_mechanic_to_work_order',
      {
        p_work_order_id: woId,
        p_mechanic_id:   mechanicId,
        p_assigner_uid:  user.id,
      }
    )
    if (rpcErr) {
      console.error('[assign-mechanic] RPC error:', rpcErr.message)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }
    if (!rpcResult.success) {
      return NextResponse.json({ error: rpcResult.error }, { status: 400 })
    }

    const { mechanic_user_id, wo_number, vehicle_plate, provider_name } = rpcResult
    console.log(`[assign-mechanic] RPC ok: wo=${wo_number} mechanic_user_id=${mechanic_user_id}`)

    // ── Resolve mechanic contact details via service client (bypasses RLS) ────
    const { data: mechProfile } = await sc
      .from('user_profiles_secure')
      .select('first_name, last_name, phone, email, auth_user_id')
      .eq('id', mechanic_user_id)
      .maybeSingle()

    let mechEmail = mechProfile?.email || null
    if (!mechEmail && mechProfile?.auth_user_id) {
      const { data: au } = await sc.auth.admin.getUserById(mechProfile.auth_user_id)
      mechEmail = au?.user?.email || null
    }
    const mechPhone = mechProfile?.phone || null
    const mechName  = mechProfile
      ? `${mechProfile.first_name || ''} ${mechProfile.last_name || ''}`.trim() || 'Mechanic'
      : 'Mechanic'

    // Get scheduled date from WO
    const { data: wo } = await supabase
      .from('work_orders_secure')
      .select('scheduled_start, problem_description')
      .eq('id', woId).single()

    const woUrl = `${APP_URL()}/dashboard/my-teams/work-order/${woId}`

    console.log(`[assign-mechanic] mechanic: name=${mechName} email=${mechEmail||'NONE'} phone=${mechPhone||'NONE'}`)

    const comms = []

    // ── Email to mechanic ─────────────────────────────────────────────────────
    if (mechEmail) {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">
  <tr>
    <td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND}</p>
      <p style="margin:0;font-size:14px;color:#bfdbfe;">🔧 Work Order Assigned — Action Required</p>
    </td>
  </tr>
  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 16px;">Hello ${mechName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      You have been assigned to a work order at <strong>${provider_name || 'your garage'}</strong>.
      Please log in to <strong>acknowledge</strong> or <strong>decline</strong> this assignment.
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;width:38%;">Work Order</td>
            <td style="padding:5px 0;color:#1d4ed8;font-size:13px;font-weight:700;">${wo_number}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Vehicle</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${vehicle_plate || '—'}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Garage</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${provider_name || '—'}</td></tr>
        ${wo?.scheduled_start ? `<tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Scheduled</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${fmtDate(wo.scheduled_start)}</td></tr>` : ''}
        ${wo?.problem_description ? `<tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Problem</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${wo.problem_description}</td></tr>` : ''}
      </table>
    </div>
    <div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#713f12;font-size:13px;">
        ⚠️ Please respond to this assignment — acknowledge to accept or decline if unavailable.
        The garage manager will be notified of your response.
      </p>
    </div>
    <div style="text-align:center;">
      <a href="${woUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        View &amp; Respond to Assignment
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

      const text = `${BRAND} — Work Order Assigned

Hello ${mechName},

You have been assigned to work order ${wo_number} for vehicle ${vehicle_plate || '—'} at ${provider_name || 'your garage'}.

Please acknowledge or decline this assignment:
${woUrl}
— ${BRAND}`

      comms.push(
        sendAndQueueEmail(sc, {
          to:      [{ Email: mechEmail, Name: mechName }],
          subject: `Work Order Assigned — ${wo_number} · Action Required`,
          html,
          text,
        })
        .then(() => console.log(`[assign-mechanic] ✓ email → ${mechEmail}`))
        .catch(e  => console.error('[assign-mechanic] ✗ email:', e.message))
      )
    } else {
      console.warn('[assign-mechanic] no mechanic email — skipped')
    }

    // ── SMS to mechanic ───────────────────────────────────────────────────────
    if (mechPhone) {
      const phone = normalisePhone(mechPhone)
      if (phone) {
        const msg = `${BRAND}: You have been assigned to WO ${wo_number} for ${vehicle_plate || 'a vehicle'} at ${provider_name || 'your garage'}. Please acknowledge or decline: ${woUrl}`
        comms.push(
          sendAndQueueSms(sc, { to: phone, message: msg })
          .then(() => console.log(`[assign-mechanic] ✓ SMS → ${phone}`))
          .catch(e  => console.error('[assign-mechanic] ✗ SMS:', e.message))
        )
      }
    } else {
      console.warn('[assign-mechanic] no mechanic phone — skipped')
    }

    await Promise.allSettled(comms)

    return NextResponse.json({
      success:     true,
      wo_number,
      mechanic:    mechName,
      email_sent:  !!mechEmail,
      sms_sent:    !!(mechPhone && normalisePhone(mechPhone)),
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/assign-mechanic error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}