/**
 * POST /api/work-orders/[id]/send-invoice
 *
 * Sends the invoice to the relevant customer(s) via:
 *   1. In-app notification
 *   2. Email — invoice rendered inline in body + attached as HTML file
 *   3. SMS
 *
 * Recipient resolution:
 *   - Individual-owned vehicle → vehicle owner (with booking/walk-in fallback).
 *   - Company-owned vehicle    → company owner *and* every active member with
 *       is_admin=true, staff_role in (fleet_manager, accountant), or any of
 *       can_approve_work / can_manage_fleet / can_approve_estimates /
 *       can_approve_payment.
 *
 * Per-recipient CTA URL: company owners receive a link into /company/...
 * (their dedicated portal); everyone else lands on /dashboard/... .
 *
 * Authorised callers: provider owner | SPU admin/accountant | can_send_invoice
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { buildInvoiceHtml }                    from '@/lib/invoice/buildInvoiceHtml'
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


export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── 1. Resolve caller profile ─────────────────────────────────────────
    const { data: profile } = await sc
      .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

    // ── 2. Load work order ────────────────────────────────────────────────
    const { data: wo } = await sc
      .from('work_orders_secure')
      .select('id, work_order_number, service_provider_id, vehicle_id')
      .eq('id', workOrderId).single()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // ── 3. Authorisation ──────────────────────────────────────────────────
    const { data: provRow } = await sc
      .from('service_providers_secure').select('id, name, owner_user_id').eq('id', wo.service_provider_id).maybeSingle()
    const { data: spuRow } = await sc
      .from('service_provider_users').select('role, can_send_invoice')
      .eq('user_id', profile.id).eq('service_provider_id', wo.service_provider_id).eq('is_active', true).maybeSingle()
    const { data: mechRow } = await sc
      .from('mechanics').select('can_send_invoice')
      .eq('user_id', profile.id).eq('service_provider_id', wo.service_provider_id).eq('is_active', true).maybeSingle()

    const isOwner    = provRow?.owner_user_id === profile.id
    const isAdmin    = ['admin', 'accountant'].includes(spuRow?.role)
    const canSend    = !!spuRow?.can_send_invoice || !!mechRow?.can_send_invoice

    if (!isOwner && !isAdmin && !canSend) {
      return NextResponse.json({ error: 'Permission denied — requires owner, admin, accountant, or can_send_invoice.' }, { status: 403 })
    }

    // ── 4. Load invoice + line items ──────────────────────────────────────
    const { data: inv } = await sc
      .from('invoices')
      .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, notes, due_date, issued_at, issued_to_user_id')
      .eq('work_order_id', workOrderId).maybeSingle()
    if (!inv)              return NextResponse.json({ error: 'No invoice found. Generate it first.' }, { status: 400 })
    if (inv.status === 'paid') return NextResponse.json({ error: 'Invoice is already paid.' }, { status: 400 })

    const { data: rawItems } = await sc
      .from('invoice_items')
      .select('id, item_type, item_name, description, quantity, unit_price, total_price')
      .eq('invoice_id', inv.id)
      .order('item_type')
    const lineItems    = rawItems || []
    const serviceItems = lineItems.filter(i => i.item_type === 'service')
    const partItems    = lineItems.filter(i => i.item_type === 'part')

    // ── 5. Resolve vehicle ownership & build recipient list ───────────────
    //
    // Recipients depend on whether the vehicle belongs to an individual or
    // to a company:
    //
    //  • Individual-owned vehicle → one recipient (the owner). If we can't
    //    resolve that, fall through to booking customer, then walk-in info.
    //
    //  • Company-owned vehicle → fan out to:
    //      – The company owner (always)
    //      – Every active member whose role/permissions put them in the
    //        invoice-loop: is_admin, staff_role in (fleet_manager, accountant),
    //        or any of can_approve_work / can_manage_fleet /
    //        can_approve_estimates / can_approve_payment.
    //    The "Bill To" on the attached invoice document uses the company name
    //    (not any one member's personal name), since that's who's billed.
    //
    // Recipient shape: { user_id, name, email, phone, isCompanyOwner }
    //   isCompanyOwner controls the per-recipient CTA route: company owners
    //   land on /company/work-orders/{id}, everyone else on /dashboard/.

    const { data: vo } = await sc
      .from('vehicle_ownership').select('owner_user_id, owner_company_id')
      .eq('vehicle_id', wo.vehicle_id).maybeSingle()

    let billToName     = null                       // shown on the invoice attachment "Bill To"
    let companyId      = null                       // populated if this is a fleet vehicle
    let companyName    = null
    let companyOwnerId = null
    const recipients   = []

    // Helper: hydrate email/phone for a user_profiles row and push as a recipient.
    const addRecipientFromProfileId = async (profileId, { isCompanyOwner = false } = {}) => {
      if (!profileId) return
      // Skip if already added.
      if (recipients.some(r => r.user_id === profileId)) return
      const { data: op } = await sc
        .from('user_profiles_secure')
        .select('first_name, last_name, phone, email, auth_user_id')
        .eq('id', profileId).maybeSingle()
      if (!op) return
      let email = op.email || null
      const phone = op.phone || null
      if (!email && op.auth_user_id) {
        const { data: au } = await sc.auth.admin.getUserById(op.auth_user_id)
        email = au?.user?.email || null
      }
      if (!email && !phone) return  // nothing to deliver to — skip silently
      recipients.push({
        user_id: profileId,
        name:    `${op.first_name || ''} ${op.last_name || ''}`.trim() || 'Customer',
        email,
        phone,
        isCompanyOwner,
      })
    }

    // Determine ownership context. Prefer invoice.issued_to_user_id if set
    // (provider explicitly bound the invoice to a person), else vehicle.
    let primaryOwnerId = inv.issued_to_user_id || vo?.owner_user_id || null

    if (vo?.owner_company_id) {
      // ── Company-owned vehicle ─────────────────────────────────────────
      companyId = vo.owner_company_id
      const { data: co } = await sc
        .from('company_profiles_secure')
        .select('name, owner_user_id')
        .eq('id', companyId).maybeSingle()
      companyName    = co?.name || null
      companyOwnerId = co?.owner_user_id || null
      billToName     = companyName || 'Fleet Customer'

      // 1) Company owner
      if (companyOwnerId) {
        await addRecipientFromProfileId(companyOwnerId, { isCompanyOwner: true })
      }

      // 2) Members in the invoice-loop. The role/permission predicate is
      //    expressed as a Supabase .or() clause: staff_role ∈ {fleet_manager,
      //    accountant} OR is_admin = true OR any of the four can_* booleans.
      const { data: members } = await sc
        .from('company_users')
        .select('user_id, is_admin, staff_role, can_approve_work, can_manage_fleet, can_approve_estimates, can_approve_payment')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .neq('is_suspended', true)
        .or([
          'is_admin.eq.true',
          'staff_role.in.(fleet_manager,accountant)',
          'can_approve_work.eq.true',
          'can_manage_fleet.eq.true',
          'can_approve_estimates.eq.true',
          'can_approve_payment.eq.true',
        ].join(','))

      for (const m of (members || [])) {
        if (!m.user_id) continue
        await addRecipientFromProfileId(m.user_id, { isCompanyOwner: false })
      }
    } else if (primaryOwnerId) {
      // ── Individual-owned vehicle ──────────────────────────────────────
      await addRecipientFromProfileId(primaryOwnerId, { isCompanyOwner: false })
      // "Bill To" uses the resolved recipient's name.
      billToName = recipients[0]?.name || null
    }

    // ── Fallbacks for vehicles with no resolvable owner ──────────────────
    // (Booking customer, then walk-in.) These produce a single recipient.
    if (recipients.length === 0) {
      const { data: booking } = await sc
        .from('bookings_secure')
        .select('customer_user_id, customer_email, customer_phone, customer:user_profiles_secure!customer_user_id(first_name, last_name, phone, email, auth_user_id)')
        .eq('work_order_id', workOrderId).maybeSingle()

      if (booking?.customer_user_id) {
        await addRecipientFromProfileId(booking.customer_user_id, { isCompanyOwner: false })
        billToName = billToName || recipients[0]?.name || null
      }
      if (recipients.length === 0 && booking && (booking.customer_email || booking.customer_phone)) {
        const name = booking.customer
          ? `${booking.customer.first_name || ''} ${booking.customer.last_name || ''}`.trim() || 'Customer'
          : 'Customer'
        recipients.push({
          user_id: null,
          name,
          email:   booking.customer_email || booking.customer?.email || null,
          phone:   booking.customer_phone || booking.customer?.phone || null,
          isCompanyOwner: false,
        })
        billToName = billToName || name
      }
    }

    if (recipients.length === 0) {
      // Walk-in (no booking, no ownership row).
      const { data: woWalkin } = await sc
        .from('work_orders_secure').select('walk_in_owner_name, walk_in_owner_email, walk_in_owner_phone')
        .eq('id', workOrderId).maybeSingle()
      if (woWalkin && (woWalkin.walk_in_owner_email || woWalkin.walk_in_owner_phone)) {
        recipients.push({
          user_id: null,
          name:    woWalkin.walk_in_owner_name || 'Customer',
          email:   woWalkin.walk_in_owner_email || null,
          phone:   woWalkin.walk_in_owner_phone || null,
          isCompanyOwner: false,
        })
        billToName = billToName || woWalkin.walk_in_owner_name || 'Customer'
      }
    }

    if (!billToName) billToName = 'Customer'

    // Resolve vehicle plate (used in both the attachment and notifications).
    const { data: veh } = await sc.from('vehicles_secure').select('plate_number').eq('id', wo.vehicle_id).maybeSingle()
    const vehiclePlate  = veh?.plate_number || ''

    // ── 6. Mark invoice as sent (once, regardless of recipient count) ─────
    await sc.from('invoices').update({ status: 'sent' }).eq('id', inv.id)

    // ── 7. Build invoice HTML (one document, shared across recipients) ────
    // CTA on the *attached* document points at the canonical dashboard route
    // — recipients with their own portal (company owners) get a tailored URL
    // in the email *body* below, which is what they'll actually click.
    const APP        = APP_URL().replace(/\/+$/, '')   // strip trailing slash defensively
    const baseWoUrl  = `${APP}/dashboard/work-orders/${workOrderId}`
    const invoiceHtml = buildInvoiceHtml({
      invoiceNumber: inv.invoice_number,
      workOrderNumber: wo.work_order_number,
      providerName:  provRow?.name || 'Service Provider',
      vehiclePlate,
      ownerName:     billToName,
      issuedAt:      inv.issued_at,
      dueDate:       inv.due_date,
      serviceItems,
      partItems,
      subtotal:      inv.subtotal,
      taxRate:       inv.tax_rate,
      taxAmount:     inv.tax_amount,
      totalAmount:   inv.total_amount,
      notes:         inv.notes,
      woUrl:         baseWoUrl,
    })

    // ── 8. Fan-out: email + SMS + in-app notification per recipient ───────
    // Per-recipient CTA URL. Three categories:
    //   • Company owner   → /company/work-orders/{id}
    //       Their dedicated portal — middleware redirects them away from
    //       /dashboard anyway, so we must give them a /company URL.
    //   • Company member  → /dashboard/company/{companyId}/work-orders/{id}
    //       Members stay on /dashboard, but their fleet work orders live
    //       under the company-scoped subtree (where the action banners,
    //       company sidebar, and member-aware tabs are wired). Sending
    //       them to /dashboard/work-orders/{id} would land them on the
    //       individual-customer view that doesn't know about their fleet.
    //   • Individual customer / walk-in / booking → /dashboard/work-orders/{id}
    //       The default customer route.
    //
    // `companyId` is set above iff this invoice is for a company-owned
    // vehicle, which is exactly when categories 1+2 apply.
    const ctaUrlFor = (rcpt) => {
      if (rcpt.isCompanyOwner) return `${APP}/company/work-orders/${workOrderId}`
      if (companyId)           return `${APP}/dashboard/company/${companyId}/work-orders/${workOrderId}`
      return `${APP}/dashboard/work-orders/${workOrderId}`
    }

    const buildEmailBody = (rcpt) => {
      const woUrl   = ctaUrlFor(rcpt)
      // Strip the wrapping <html>/<body> from the invoice document so we can
      // inline it below the wrapper card.
      const inlineInvoice = invoiceHtml
        .replace('<!DOCTYPE html>', '')
        .replace(/<html[^>]*>.*?<body[^>]*>/s, '')
        .replace(/<\/body>.*?<\/html>/s, '')
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">${companyId ? 'A new fleet invoice is ready' : 'Your invoice is ready'}</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hello ${rcpt.name || 'there'},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      <strong>${provRow?.name || 'The service provider'}</strong> has completed
      work on ${companyId ? `fleet vehicle <strong>${vehiclePlate}</strong>` : `your vehicle <strong>${vehiclePlate}</strong>`}
      and the invoice is ready${companyId ? ` for <strong>${companyName || 'your company'}</strong>` : ''}.
      The full invoice is shown below and also attached for your records.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;width:40%;">Invoice</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:700;">${inv.invoice_number}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Work Order</td>
          <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${wo.work_order_number}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;font-size:13px;">Amount Due</td>
          <td style="padding:4px 0;color:#0f172a;font-size:15px;font-weight:900;">KES ${Number(inv.total_amount).toLocaleString('en-KE')}</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${woUrl}" style="display:inline-block;background:#f59e0b;color:#0f172a;
        padding:13px 36px;border-radius:8px;text-decoration:none;font-weight:800;font-size:14px;">
        View &amp; Pay Invoice
      </a>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
      The full invoice is attached to this email and displayed below.
    </p>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} ${BRAND} · Kenya</p>
  </td></tr>
</table>
</td></tr>
</table>

<!-- Invoice rendered inline below the email -->
<table width="100%" cellpadding="0" cellspacing="0" style="padding:16px;">
<tr><td align="center">
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin:0 0 12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">
    Invoice
  </p>
  ${inlineInvoice}
</td></tr>
</table>
</body></html>`
    }

    // Resolve Mailjet auth once, outside the per-recipient loop.
    const mailjet = (() => {
      const apiKey    = process.env.MAILJET_API_KEY
      const secretKey = process.env.MAILJET_SECRET_KEY
      if (!apiKey || !secretKey) return null
      return {
        auth: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
        from: {
          Email: process.env.MAILJET_FROM_EMAIL || 'noreply@survlinx.com',
          Name:  process.env.MAILJET_FROM_NAME  || BRAND,
        },
      }
    })()

    // Track per-channel deliveries across all recipients so the response
    // can summarise overall success while remaining back-compatible (caller
    // UI just checks the booleans `email_sent` / `sms_sent`).
    let emailDelivered = 0, smsDelivered = 0

    for (const rcpt of recipients) {
      const woUrl = ctaUrlFor(rcpt)

      // a. In-app notification — only when we have a user_id.
      if (rcpt.user_id) {
        try {
          await sc.from('notifications').insert({
            user_id:           rcpt.user_id, recipient_user_id: rcpt.user_id,
            type:              'invoice_issued', notification_type: 'invoice_issued',
            title:             `Invoice ${inv.invoice_number} — KES ${Number(inv.total_amount).toLocaleString('en-KE')}`,
            message:           `${companyId ? `Fleet invoice for ${vehiclePlate}` : `Your invoice for work order ${wo.work_order_number} (${vehiclePlate})`} is ready. Total: KES ${Number(inv.total_amount).toLocaleString('en-KE')}. Please arrange payment.`,
            reference_table:   'invoices', reference_id: workOrderId, reference_type: 'invoice',
            is_read:           false,
          })
        } catch (e) {
          console.error('[send-invoice] notification insert failed (non-fatal):', e.message)
        }
      }

      // b. Email.
      if (rcpt.email && mailjet) {
        try {
          const message = {
            From:     mailjet.from,
            To:       [{ Email: rcpt.email, Name: rcpt.name || 'Customer' }],
            Subject:  `Invoice ${inv.invoice_number} — KES ${Number(inv.total_amount).toLocaleString('en-KE')} · ${provRow?.name || BRAND}`,
            HTMLPart: buildEmailBody(rcpt),
            TextPart: `${BRAND}: Invoice ${inv.invoice_number} from ${provRow?.name}.\nVehicle: ${vehiclePlate}\nAmount Due: KES ${Number(inv.total_amount).toLocaleString('en-KE')}\n\nView & Pay: ${woUrl}`,
            Attachments: [{
              ContentType:   'text/html',
              Filename:      `invoice-${inv.invoice_number}.html`,
              Base64Content: Buffer.from(invoiceHtml).toString('base64'),
            }],
          }
          const resp = await fetch('https://api.mailjet.com/v3.1/send', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: mailjet.auth },
            body:    JSON.stringify({ Messages: [message] }),
          })
          if (resp.ok) emailDelivered++
          else console.error('[send-invoice] Mailjet error:', await resp.text())
        } catch (e) {
          console.error(`[send-invoice] email to ${rcpt.email} failed (non-fatal):`, e.message)
        }
      }

      // c. SMS.
      const phone = normalisePhone(rcpt.phone)
      if (phone) {
        try {
          const r = await sendAndQueueSms(sc, {
            to:      phone,
            message: `${BRAND}: Invoice ${inv.invoice_number} from ${provRow?.name || 'your garage'} is ready. Amount: KES ${Number(inv.total_amount).toLocaleString('en-KE')}. View & pay: ${woUrl}`,
          })
          if (r?.sent) smsDelivered++
        } catch (e) {
          console.error(`[send-invoice] SMS to ${phone} failed (non-fatal):`, e.message)
        }
      }
    }

    return NextResponse.json({
      success:           true,
      invoice_number:    inv.invoice_number,
      // Back-compat booleans for the caller UI.
      email_sent:        emailDelivered > 0,
      sms_sent:          smsDelivered   > 0,
      // Additional breakdown for diagnostics — useful for fleet invoices
      // where one button click can result in many notifications.
      recipient_count:   recipients.length,
      email_delivered:   emailDelivered,
      sms_delivered:     smsDelivered,
      owner_has_email:   recipients.some(r => !!r.email),
      owner_has_phone:   recipients.some(r => !!r.phone),
      is_fleet_invoice:  !!companyId,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/send-invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}