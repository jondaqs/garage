/**
 * POST /api/subscription/payment-notify
 *
 * Called client-side after record_subscription_payment RPC succeeds.
 * Sends the payment receipt to the subscriber via:
 *   1. In-app notification
 *   2. Email (Mailjet)
 *   3. SMS (Africa's Talking)
 *
 * Body: { invoice_id, receipt_number, amount_paid, payment_method, transaction_ref }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const BRAND   = 'GariCare'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildReceiptEmailHtml({ subscriberName, receiptNumber, invoiceRef,
  amount, currencySymbol, paymentMethod, transactionRef, date, ctaUrl }) {
  const fmt = (n) => `${currencySymbol}${Number(n || 0).toLocaleString('en-KE')}`
  const method = (paymentMethod || 'payment').replace(/_/g, ' ')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Receipt</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Payment Received</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#22c55e,#16a34a,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${subscriberName || 'there'},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      We have received your subscription payment. Here are the details:
    </p>
    <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <p style="margin:0;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.08em;">Amount Received</p>
      <p style="margin:8px 0 0;font-size:32px;font-weight:800;color:#065f46;">${fmt(amount)}</p>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;width:40%;">Receipt No.</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:700;">${receiptNumber}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Invoice</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${invoiceRef}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Payment Method</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;text-transform:capitalize;">${method}</td>
        </tr>
        ${transactionRef ? `<tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Transaction Ref</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-family:monospace;">${transactionRef}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Date</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;">${date}</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#0f172a;color:#fff;
        padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
        View Subscription
      </a>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
      Thank you for your payment. Your subscription is now active.
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} ${BRAND} · Kenya</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const sc       = getServiceClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { invoice_id, receipt_number, amount_paid, payment_method, transaction_ref } = body
    if (!invoice_id) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })

    // Load invoice + subscription
    const { data: inv } = await sc
      .from('subscription_invoices')
      .select('id, invoice_ref_no, subscription_id, total_amount, currency_id')
      .eq('id', invoice_id).maybeSingle()
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const { data: sub } = await sc
      .from('subscriptions')
      .select('id, user_id, company_id, service_provider_id, subscribed_by, package_id')
      .eq('id', inv.subscription_id).maybeSingle()

    const { data: pkg } = await sc
      .from('subscription_packages').select('name').eq('id', sub?.package_id).maybeSingle()

    const { data: cur } = await sc
      .from('currencies').select('symbol').eq('id', inv.currency_id).maybeSingle()
    const currencySymbol = cur?.symbol || 'KES '

    // Resolve subscriber
    const subscriberUserId = sub?.user_id || sub?.subscribed_by
    let recipientUserId = subscriberUserId
    if (!recipientUserId && sub?.company_id) {
      const { data: co } = await sc.from('company_profiles').select('owner_user_id').eq('id', sub.company_id).maybeSingle()
      recipientUserId = co?.owner_user_id
    }
    if (!recipientUserId && sub?.service_provider_id) {
      const { data: sp } = await sc.from('service_providers').select('owner_user_id').eq('id', sub.service_provider_id).maybeSingle()
      recipientUserId = sp?.owner_user_id
    }
    if (!recipientUserId) return NextResponse.json({ success: true, skipped: true, reason: 'No recipient' })

    const { data: profile } = await sc
      .from('user_profiles_secure')
      .select('id, first_name, last_name, email, phone, auth_user_id')
      .eq('id', recipientUserId).maybeSingle()
    if (!profile) return NextResponse.json({ success: true, skipped: true, reason: 'Profile not found' })

    let email = profile.email || null
    if (!email && profile.auth_user_id) {
      const { data: au } = await sc.auth.admin.getUserById(profile.auth_user_id)
      email = au?.user?.email || null
    }

    const subscriberName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'there'
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
    const ctaUrl = `${APP_URL()}/dashboard/subscription`
    const finalAmount = amount_paid || inv.total_amount || 0
    const finalReceipt = receipt_number || 'N/A'
    const finalMethod = payment_method || 'payment'

    const results = { notification: false, email_sent: false, sms_sent: false }

    // 1. In-app notification
    try {
      await sc.from('notifications').insert({
        user_id: recipientUserId, recipient_user_id: recipientUserId,
        type: 'subscription_payment', notification_type: 'subscription_payment',
        title: `Payment Received — ${finalReceipt}`,
        message: `Your payment of ${currencySymbol}${Number(finalAmount).toLocaleString('en-KE')} via ${finalMethod.replace(/_/g, ' ')} has been received. Receipt: ${finalReceipt}.`,
        reference_table: 'subscription_receipts', reference_id: inv.subscription_id, reference_type: 'subscription_receipt',
        is_read: false,
      })
      results.notification = true
    } catch (e) {
      console.error('[sub/payment-notify] notification failed:', e.message)
    }

    // 2. Email
    if (email) {
      try {
        await sendAndQueueEmail(sc, {
          to: [{ Email: email, Name: subscriberName }],
          subject: `Payment Receipt ${finalReceipt} — ${currencySymbol}${Number(finalAmount).toLocaleString('en-KE')}`,
          html: buildReceiptEmailHtml({
            subscriberName, receiptNumber: finalReceipt,
            invoiceRef: inv.invoice_ref_no,
            amount: finalAmount, currencySymbol,
            paymentMethod: finalMethod,
            transactionRef: transaction_ref,
            date: fmtDate(new Date()), ctaUrl,
          }),
          text: `${BRAND}: Payment of ${currencySymbol}${Number(finalAmount).toLocaleString('en-KE')} received via ${finalMethod}. Receipt: ${finalReceipt}. View: ${ctaUrl}`,
          referenceTable: 'subscription_receipts',
          referenceId: inv.subscription_id,
        })
        results.email_sent = true
      } catch (e) {
        console.error('[sub/payment-notify] email failed:', e.message)
      }
    }

    // 3. SMS
    const phone = normalisePhone(profile.phone)
    if (phone) {
      try {
        const r = await sendAndQueueSms(sc, {
          to: phone,
          recipientName: subscriberName,
          message: `${BRAND}: Payment of ${currencySymbol}${Number(finalAmount).toLocaleString('en-KE')} received via ${finalMethod.replace(/_/g, ' ')}. Receipt: ${finalReceipt}. Thank you!`,
          referenceTable: 'subscription_receipts',
          referenceId: inv.subscription_id,
        })
        if (r?.sent) results.sms_sent = true
      } catch (e) {
        console.error('[sub/payment-notify] SMS failed:', e.message)
      }
    }

    return NextResponse.json({ success: true, receipt_number: finalReceipt, ...results })
  } catch (err) {
    console.error('POST /api/subscription/payment-notify error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}