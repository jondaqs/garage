/**
 * POST /api/subscription/send-invoice
 *
 * Called client-side after create_subscription RPC succeeds.
 * Sends the subscription invoice to the subscriber via:
 *   1. In-app notification
 *   2. Email (Mailjet)
 *   3. SMS (Africa's Talking)
 *
 * Body: { subscription_id }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { buildSubscriptionInvoiceHtml }        from '@/lib/subscription/buildSubscriptionInvoiceHtml'

const BRAND   = 'GariCare'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildInvoiceEmailHtml({ subscriberName, invoiceRef, packageName,
  amount, currencySymbol, dueDate, billingStart, billingEnd, ctaUrl }) {
  const fmt = (n) => `${currencySymbol}${Number(n || 0).toLocaleString('en-KE')}`
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Subscription Invoice</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Your subscription invoice is ready</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#3b82f6,#60a5fa,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${subscriberName || 'there'},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      Your subscription invoice for <strong>${packageName}</strong> is ready.
      Please arrange payment before the due date.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;width:40%;">Invoice</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:700;">${invoiceRef}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Package</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${packageName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Period</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;">${billingStart} – ${billingEnd}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Due Date</td>
          <td style="padding:4px 0;color:#ef4444;font-size:13px;font-weight:600;">${dueDate}</td>
        </tr>
        <tr>
          <td style="padding:8px 0 4px;color:#64748b;font-size:13px;border-top:2px solid #0f172a;">Amount Due</td>
          <td style="padding:8px 0 4px;color:#0f172a;font-size:18px;font-weight:900;border-top:2px solid #0f172a;">${fmt(amount)}</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#3b82f6;color:#fff;
        padding:13px 36px;border-radius:8px;text-decoration:none;font-weight:800;font-size:14px;">
        View &amp; Pay Invoice
      </a>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
      Log in to your ${BRAND} dashboard to make a payment.
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
    const { subscription_id } = body
    if (!subscription_id) return NextResponse.json({ error: 'subscription_id required' }, { status: 400 })

    // Load subscription + package + invoice
    const { data: sub } = await sc
      .from('subscriptions')
      .select('id, subscription_number, user_id, company_id, service_provider_id, package_id, start_date, expiry_date, subscribed_by')
      .eq('id', subscription_id).single()
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

    const { data: pkg } = await sc
      .from('subscription_packages')
      .select('name, cost, currency_id')
      .eq('id', sub.package_id).single()

    const { data: inv } = await sc
      .from('subscription_invoices')
      .select('id, invoice_ref_no, amount_due, total_amount, due_date, billing_period_start, billing_period_end')
      .eq('subscription_id', subscription_id)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()

    if (!inv) return NextResponse.json({ success: true, skipped: true, reason: 'No invoice (free package)' })

    const { data: cur } = await sc
      .from('currencies').select('symbol, code').eq('id', pkg?.currency_id).maybeSingle()
    const currencySymbol = cur?.symbol || 'KES '

    // Resolve subscriber user
    const subscriberUserId = sub.user_id || sub.subscribed_by
    let entityOwnerId = null
    if (sub.company_id) {
      const { data: co } = await sc.from('company_profiles').select('owner_user_id').eq('id', sub.company_id).maybeSingle()
      entityOwnerId = co?.owner_user_id
    }
    if (sub.service_provider_id) {
      const { data: sp } = await sc.from('service_providers').select('owner_user_id').eq('id', sub.service_provider_id).maybeSingle()
      entityOwnerId = sp?.owner_user_id
    }
    const recipientUserId = subscriberUserId || entityOwnerId
    if (!recipientUserId) return NextResponse.json({ success: true, skipped: true, reason: 'No recipient' })

    // Get decrypted profile from user_profiles_secure
    const { data: profile } = await sc
      .from('user_profiles_secure')
      .select('id, first_name, last_name, email, phone')
      .eq('id', recipientUserId).maybeSingle()
    if (!profile) return NextResponse.json({ success: true, skipped: true, reason: 'Profile not found' })

    const email = profile.email || null
    const subscriberName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'there'
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    const ctaUrl = `${APP_URL()}/dashboard/subscription?view=invoices&invoice=${inv.id}`

    const results = { notification: false, email_sent: false, sms_sent: false }

    // 1. In-app notification
    try {
      await sc.from('notifications').insert({
        user_id: recipientUserId, recipient_user_id: recipientUserId,
        type: 'subscription_invoice', notification_type: 'subscription_invoice',
        title: `Subscription Invoice — ${inv.invoice_ref_no}`,
        message: `Your invoice of ${currencySymbol}${Number(inv.total_amount || inv.amount_due).toLocaleString('en-KE')} for ${pkg?.name || 'subscription'} is ready. Due by ${fmtDate(inv.due_date)}.`,
        reference_table: 'subscription_invoices', reference_id: inv.id, reference_type: 'subscription_invoice',
        is_read: false,
      })
      results.notification = true
    } catch (e) {
      console.error('[sub/send-invoice] notification failed:', e.message)
    }

    // 2. Email
    if (email) {
      try {
        await sendAndQueueEmail(sc, {
          to: [{ Email: email, Name: subscriberName }],
          subject: `Subscription Invoice ${inv.invoice_ref_no} — ${currencySymbol}${Number(inv.total_amount || inv.amount_due).toLocaleString('en-KE')}`,
          html: buildInvoiceEmailHtml({
            subscriberName, invoiceRef: inv.invoice_ref_no,
            packageName: pkg?.name || 'Subscription',
            amount: inv.total_amount || inv.amount_due,
            currencySymbol, dueDate: fmtDate(inv.due_date),
            billingStart: fmtDate(inv.billing_period_start),
            billingEnd: fmtDate(inv.billing_period_end),
            ctaUrl,
          }),
          text: `${BRAND}: Invoice ${inv.invoice_ref_no} for ${currencySymbol}${Number(inv.total_amount || inv.amount_due).toLocaleString('en-KE')} (${pkg?.name}). Due by ${fmtDate(inv.due_date)}. Pay at: ${ctaUrl}`,
          referenceTable: 'subscription_invoices',
          referenceId: inv.id,
        })
        results.email_sent = true
      } catch (e) {
        console.error('[sub/send-invoice] email failed:', e.message)
      }
    }

    // 3. SMS
    const phone = normalisePhone(profile.phone)
    if (phone) {
      try {
        const r = await sendAndQueueSms(sc, {
          to: phone,
          recipientName: subscriberName,
          message: `${BRAND}: Invoice ${inv.invoice_ref_no} for ${currencySymbol}${Number(inv.total_amount || inv.amount_due).toLocaleString('en-KE')} (${pkg?.name}) is ready. Due ${fmtDate(inv.due_date)}. Pay at: ${ctaUrl}`,
          referenceTable: 'subscription_invoices',
          referenceId: inv.id,
        })
        if (r?.sent) results.sms_sent = true
      } catch (e) {
        console.error('[sub/send-invoice] SMS failed:', e.message)
      }
    }

    return NextResponse.json({ success: true, invoice_ref: inv.invoice_ref_no, ...results })
  } catch (err) {
    console.error('POST /api/subscription/send-invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}