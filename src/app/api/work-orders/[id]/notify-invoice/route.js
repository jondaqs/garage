/**
 * POST /api/work-orders/[id]/notify-invoice
 * Called after work order completion.
 * 1. Calls notify_invoice_ready() RPC — inserts in-app notifications,
 *    returns recipient list (owner, admin, accountant, can_send_invoice)
 * 2. Sends email + SMS to each recipient via service client
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

function buildEmailHtml({ recipientName, woNumber, vehiclePlate, providerName, totalAmount, woUrl }) {
  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:560px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#059669,#047857);padding:26px 32px 22px;text-align:center;">
    <p style="margin:0 0 4px;font-size:21px;font-weight:700;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#a7f3d0;">🧾 Invoice Ready to Generate</p>
  </td></tr>
  <tr><td style="padding:28px;">
    <p style="color:#111827;font-size:15px;margin:0 0 14px;">Hello ${recipientName},</p>
    <p style="color:#374151;font-size:14px;margin:0 0 20px;">
      Work order <strong>${woNumber}</strong> has been completed and is ready for invoicing.
      Please generate and send the invoice to the customer.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:36%;">Work Order</td>
            <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:700;">${woNumber}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Vehicle</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;">${vehiclePlate || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Provider</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;">${providerName || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Total</td>
            <td style="padding:4px 0;color:#059669;font-size:14px;font-weight:700;">${fmt(totalAmount)}</td></tr>
      </table>
    </div>
    <div style="text-align:center;">
      <a href="${woUrl}" style="display:inline-block;background:#059669;color:#fff;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Generate &amp; Send Invoice
      </a>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND}</p>
  </td></tr>
</table></td></tr></table></body></html>`
}

export async function POST(request, { params }) {
  try {
    const supabase     = await createClient()
    const sc           = getServiceClient()
    const { id: woId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. RPC: in-app notifications + recipient list ─────────────────────
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'notify_invoice_ready',
      { p_work_order_id: woId, p_caller_uid: user.id }
    )

    if (rpcErr) {
      console.warn('[notify-invoice] RPC error (non-fatal):', rpcErr.message)
      return NextResponse.json({ success: true, notified: false, error: rpcErr.message })
    }

    if (!rpcResult?.success) {
      return NextResponse.json({ success: true, notified: false, reason: rpcResult?.error })
    }

    if (!rpcResult.notified) {
      return NextResponse.json({ success: true, notified: false, reason: 'no_recipients' })
    }

    const { recipients = [], wo_number, vehicle_plate, provider_name, total_amount } = rpcResult
    const woUrl = `${APP_URL()}/provider/work-orders/${woId}`

    // ── 2. Email + SMS each recipient ─────────────────────────────────────
    const comms      = []
    let   emailCount = 0
    let   smsCount   = 0

    for (const recipient of recipients) {
      let email = recipient.email || null
      if (!email && recipient.auth_user_id) {
        const { data: au } = await sc.auth.admin.getUserById(recipient.auth_user_id)
        email = au?.user?.email || null
      }
      if (!email) {
        const { data: up } = await sc
          .from('user_profiles_secure').select('email, auth_user_id').eq('id', recipient.user_id).maybeSingle()
        email = up?.email || null
        if (!email && up?.auth_user_id) {
          const { data: au } = await sc.auth.admin.getUserById(up.auth_user_id)
          email = au?.user?.email || null
        }
      }

      const recipientName = recipient.name || 'Team Member'

      if (email) {
        emailCount++
        comms.push(
          sendAndQueueEmail(sc, {
            to:      [{ Email: email, Name: recipientName }],
            subject: `Invoice Ready — ${wo_number}`,
            html:    buildEmailHtml({ recipientName, woNumber: wo_number, vehiclePlate: vehicle_plate, providerName: provider_name, totalAmount: total_amount, woUrl }),
            text:    `${BRAND}: Work order ${wo_number} (${vehicle_plate || '—'}) is complete. Total: KES ${Number(total_amount || 0).toLocaleString()}. Generate invoice: ${woUrl}`,
          })
          .then(() => console.log(`[notify-invoice] ✓ email → ${email}`))
          .catch(e  => console.error(`[notify-invoice] ✗ email:`, e.message))
        )
      }

      const phone = normalisePhone(recipient.phone)
      if (phone) {
        smsCount++
        comms.push(
          sendAndQueueSms(sc, {
            to:      phone,
            message: `${BRAND}: WO ${wo_number} complete. Total KES ${Number(total_amount || 0).toLocaleString()}. Generate & send invoice: ${woUrl}`,
          })
          .then(() => console.log(`[notify-invoice] ✓ SMS → ${phone}`))
          .catch(e  => console.error(`[notify-invoice] ✗ SMS:`, e.message))
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
    console.error('POST /api/work-orders/[id]/notify-invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}