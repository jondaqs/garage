/**
 * POST /api/work-orders/[id]/payment-notify
 * Called client-side after process_payment RPC succeeds.
 * Sends email + SMS to:
 *   - Provider owner
 *   - SPU members with role admin or accountant
 *   - Mechanics with can_send_invoice = true
 *
 * In-app notifications are handled by process_payment (DB function).
 * This route is non-blocking — partial failures are logged but don't
 * cause the overall request to fail.
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

function buildPaymentEmailHtml({ providerName, invoiceNumber, receiptNumber,
  amount, paymentMethod, vehiclePlate, payerName, woUrl }) {
  const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`
  const method = paymentMethod?.replace('_', ' ') || 'payment'

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Received</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Payment Received</p>
  </td></tr>

  <tr><td style="height:3px;background:linear-gradient(90deg,#22c55e,#16a34a,transparent);"></td></tr>

  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${providerName} team,</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      A payment has been received for invoice <strong>${invoiceNumber}</strong>.
      ${vehiclePlate ? `Vehicle: <strong>${vehiclePlate}</strong>.` : ''}
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;width:40%;">Receipt No.</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:700;">${receiptNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Invoice</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Amount</td>
          <td style="padding:4px 0;color:#16a34a;font-size:15px;font-weight:900;">${fmt(amount)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Method</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;text-transform:capitalize;">${method}</td>
        </tr>
        ${payerName ? `<tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Paid by</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${payerName}</td>
        </tr>` : ''}
      </table>
    </div>

    <div style="text-align:center;margin:0 0 24px;">
      <a href="${woUrl}"
        style="display:inline-block;background:#0f172a;color:#fff;
          padding:12px 32px;border-radius:8px;text-decoration:none;
          font-weight:700;font-size:14px;">
        View Work Order
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
}

export async function POST(request, { params }) {
  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params

    // Verify caller is authenticated
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse body — receipt details passed from client after process_payment
    const body = await request.json().catch(() => ({}))
    const { receipt_number, amount_paid, payment_method, invoice_number } = body

    // Load work order and invoice
    const { data: wo } = await sc
      .from('work_orders_secure')
      .select('id, work_order_number, service_provider_id, vehicle_id')
      .eq('id', workOrderId).maybeSingle()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    const { data: inv } = await sc
      .from('invoices')
      .select('id, invoice_number, total_amount')
      .eq('work_order_id', workOrderId).maybeSingle()

    // Vehicle plate
    const { data: veh } = await sc
      .from('vehicles_secure').select('plate_number').eq('id', wo.vehicle_id).maybeSingle()
    const vehiclePlate = veh?.plate_number || ''

    // Payer name
    const { data: payerProfile } = await sc
      .from('user_profiles_secure').select('first_name, last_name')
      .eq('auth_user_id', user.id).maybeSingle()
    const payerName = payerProfile
      ? `${payerProfile.first_name || ''} ${payerProfile.last_name || ''}`.trim() || null
      : null

    // Provider info
    const { data: provider } = await sc
      .from('service_providers_secure')
      .select('id, name, owner_user_id, email, phone')
      .eq('id', wo.service_provider_id).maybeSingle()
    if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

    const woUrl           = `${APP_URL()}/provider/work-orders/${workOrderId}`
    const finalAmount     = amount_paid     || inv?.total_amount   || 0
    const finalInvNumber  = invoice_number  || inv?.invoice_number || 'N/A'
    const finalRctNumber  = receipt_number  || 'N/A'
    const finalMethod     = payment_method  || 'payment'

    const emailHtml = buildPaymentEmailHtml({
      providerName:  provider.name,
      invoiceNumber: finalInvNumber,
      receiptNumber: finalRctNumber,
      amount:        finalAmount,
      paymentMethod: finalMethod,
      vehiclePlate,
      payerName,
      woUrl,
    })

    const emailSubject = `Payment Received — ${finalRctNumber} · KES ${Number(finalAmount).toLocaleString('en-KE')}`
    const smsBody      = `${BRAND}: Payment of KES ${Number(finalAmount).toLocaleString('en-KE')} received via ${finalMethod} for invoice ${finalInvNumber} (${vehiclePlate}). Receipt: ${finalRctNumber}. View: ${woUrl}`

    // ── Build recipient list: owner + SPU admin/accountant + mechanic with can_send_invoice ──

    const recipientUserIds = new Set()

    // Provider owner
    if (provider.owner_user_id) recipientUserIds.add(provider.owner_user_id)

    // SPU admins and accountants
    const { data: spuStaff } = await sc
      .from('service_provider_users')
      .select('user_id')
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .in('role', ['admin', 'accountant'])
    ;(spuStaff || []).forEach(r => recipientUserIds.add(r.user_id))

    // Mechanics with can_send_invoice
    const { data: mechs } = await sc
      .from('mechanics')
      .select('user_id')
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .eq('can_send_invoice', true)
    ;(mechs || []).forEach(r => { if (r.user_id) recipientUserIds.add(r.user_id) })

    if (recipientUserIds.size === 0) {
      return NextResponse.json({ success: true, recipients: 0 })
    }

    // Load contact details for all recipients
    const { data: profiles } = await sc
      .from('user_profiles_secure')
      .select('id, first_name, last_name, email, phone, auth_user_id')
      .in('id', [...recipientUserIds])

    const results = { emails_sent: 0, sms_sent: 0, errors: [] }

    for (const profile of profiles || []) {
      // ── Email ──────────────────────────────────────────────────────────────
      const email = profile.email || null
      if (email) {
        try {
          await sendAndQueueEmail(sc, {
            to:            [{ Email: email, Name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Team' }],
            subject:       emailSubject,
            html:          emailHtml,
            text:          `${BRAND}: Payment of KES ${Number(finalAmount).toLocaleString('en-KE')} received via ${finalMethod} for invoice ${finalInvNumber}. Receipt: ${finalRctNumber}. View: ${woUrl}`,
            referenceTable: 'receipts',
            referenceId:   workOrderId,
          })
          results.emails_sent++
        } catch (e) {
          results.errors.push(`email:${email}: ${e.message}`)
          console.error('[payment-notify] email failed:', e.message)
        }
      }

      // ── SMS ────────────────────────────────────────────────────────────────
      const phone = normalisePhone(profile.phone)
      if (phone) {
        try {
          const r = await sendAndQueueSms(sc, {
            to:            phone,
            recipientName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || undefined,
            message:       smsBody,
            referenceTable: 'receipts',
            referenceId:   workOrderId,
          })
          if (r?.sent) results.sms_sent++
        } catch (e) {
          results.errors.push(`sms:${phone}: ${e.message}`)
          console.error('[payment-notify] sms failed:', e.message)
        }
      }
    }

    return NextResponse.json({ success: true, ...results })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/payment-notify error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}