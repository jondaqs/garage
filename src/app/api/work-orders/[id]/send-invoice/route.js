/**
 * POST /api/work-orders/[id]/send-invoice
 * Sends the invoice to the customer as:
 *   1. In-app notification
 *   2. Email — invoice rendered inline in body + attached as HTML file
 *   3. SMS
 *
 * Authorised: provider owner | SPU admin/accountant | can_send_invoice
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
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

function buildInvoiceHtml({ invoiceNumber, workOrderNumber, providerName, vehiclePlate,
  ownerName, issuedAt, dueDate, serviceItems, partItems,
  subtotal, taxRate, taxAmount, totalAmount, notes, woUrl }) {

  const fmt  = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
  const tax  = Math.round((taxRate || 0.16) * 100)

  const renderItems = (items, label, color) => items.length === 0 ? '' : `
    <tr>
      <td colspan="4" style="padding:14px 24px 6px; font-size:11px; font-weight:700;
        letter-spacing:0.08em; text-transform:uppercase; color:${color};">
        ${label}
      </td>
    </tr>
    ${items.map(item => `
    <tr style="border-top:1px solid #f1f5f9;">
      <td style="padding:10px 24px; color:#1e293b; font-size:13px; font-weight:500;">${item.item_name}</td>
      <td style="padding:10px 8px; color:#64748b; font-size:13px; text-align:center;">${item.quantity}</td>
      <td style="padding:10px 8px; color:#64748b; font-size:13px; text-align:right;">${fmt(item.unit_price)}</td>
      <td style="padding:10px 24px; color:#1e293b; font-size:13px; font-weight:600; text-align:right;">${fmt(item.total_price)}</td>
    </tr>`).join('')}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0"
  style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:620px;width:100%;
         box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Dark header -->
  <tr>
    <td style="background:#0f172a;padding:28px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:0.12em;
              color:#f59e0b;text-transform:uppercase;">Tax Invoice</p>
            <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
              ${invoiceNumber}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;">
              Work Order · ${workOrderNumber}</p>
          </td>
          <td align="right" style="vertical-align:top;">
            <p style="margin:0 0 2px;font-size:11px;color:#64748b;">Issued</p>
            <p style="margin:0;font-size:13px;font-weight:600;color:#e2e8f0;">${fmtD(issuedAt)}</p>
            ${dueDate ? `<p style="margin:6px 0 2px;font-size:11px;color:#64748b;">Due</p>
            <p style="margin:0;font-size:13px;font-weight:600;color:#fbbf24;">${fmtD(dueDate)}</p>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Gold accent line -->
  <tr>
    <td style="height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,transparent);"></td>
  </tr>

  <!-- From / To -->
  <tr>
    <td style="padding:24px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="vertical-align:top;padding-right:16px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;
              color:#94a3b8;text-transform:uppercase;">From</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${providerName}</p>
          </td>
          <td width="50%" style="vertical-align:top;padding-left:16px;border-left:1px solid #e2e8f0;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;
              color:#94a3b8;text-transform:uppercase;">Bill To</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${ownerName || 'Customer'}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Vehicle: ${vehiclePlate || '—'}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Line items table -->
  <tr>
    <td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <!-- Column headers -->
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:10px 24px;font-size:11px;font-weight:700;letter-spacing:0.06em;
            color:#64748b;text-align:left;text-transform:uppercase;">Description</th>
          <th style="padding:10px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;
            color:#64748b;text-align:center;text-transform:uppercase;">Qty</th>
          <th style="padding:10px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;
            color:#64748b;text-align:right;text-transform:uppercase;">Unit</th>
          <th style="padding:10px 24px;font-size:11px;font-weight:700;letter-spacing:0.06em;
            color:#64748b;text-align:right;text-transform:uppercase;">Amount</th>
        </tr>
        ${renderItems(serviceItems, 'Services', '#3b82f6')}
        ${renderItems(partItems,    'Parts & Materials', '#f97316')}
      </table>
    </td>
  </tr>

  <!-- Totals -->
  <tr>
    <td style="padding:20px 32px;background:#f8fafc;border-top:2px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td></td>
          <td width="240">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#64748b;">Subtotal</td>
                <td style="padding:5px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;">${fmt(subtotal)}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#64748b;">VAT (${tax}%)</td>
                <td style="padding:5px 0;font-size:13px;color:#1e293b;text-align:right;">${fmt(taxAmount)}</td>
              </tr>
              <tr>
                <td colspan="2" style="padding:8px 0 2px;">
                  <div style="height:1px;background:#e2e8f0;"></div>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:15px;font-weight:800;color:#0f172a;">Total Due</td>
                <td style="padding:8px 0;font-size:20px;font-weight:900;color:#0f172a;text-align:right;">${fmt(totalAmount)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${notes ? `<!-- Notes -->
  <tr>
    <td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#64748b;font-style:italic;">${notes}</p>
    </td>
  </tr>` : ''}

  <!-- CTA -->
  <tr>
    <td style="padding:24px 32px;text-align:center;background:#0f172a;">
      <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">
        Please review and arrange payment at your earliest convenience.
      </p>
      <a href="${woUrl}"
        style="display:inline-block;background:#f59e0b;color:#0f172a;
          padding:12px 32px;border-radius:8px;text-decoration:none;
          font-weight:800;font-size:14px;letter-spacing:0.02em;">
        View &amp; Pay Invoice
      </a>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;text-align:center;border-top:1px solid #1e293b;background:#0f172a;">
      <p style="margin:0;font-size:11px;color:#475569;">
        ${BRAND} · Vehicle Service Platform · Kenya<br>
        © ${new Date().getFullYear()} ${BRAND}. This is an official tax invoice.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

export async function POST(request, { params }) {
  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── 1. Resolve caller profile ─────────────────────────────────────────
    const { data: profile } = await sc
      .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

    // ── 2. Load work order ────────────────────────────────────────────────
    const { data: wo } = await sc
      .from('work_orders')
      .select('id, work_order_number, service_provider_id, vehicle_id')
      .eq('id', workOrderId).single()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // ── 3. Authorisation ──────────────────────────────────────────────────
    const { data: provRow } = await sc
      .from('service_providers').select('id, name, owner_user_id').eq('id', wo.service_provider_id).maybeSingle()
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

    // ── 5. Resolve customer contact ───────────────────────────────────────
    let ownerEmail = null, ownerPhone = null, ownerName = null, ownerId = null

    // From invoice issued_to, or vehicle ownership
    ownerId = inv.issued_to_user_id
    if (!ownerId) {
      const { data: vo } = await sc
        .from('vehicle_ownership').select('owner_user_id, owner_company_id')
        .eq('vehicle_id', wo.vehicle_id).maybeSingle()
      if (vo?.owner_user_id) {
        ownerId = vo.owner_user_id
      } else if (vo?.owner_company_id) {
        const { data: co } = await sc
          .from('company_profiles').select('owner_user_id').eq('id', vo.owner_company_id).maybeSingle()
        ownerId = co?.owner_user_id || null
      }
    }

    if (ownerId) {
      const { data: op } = await sc
        .from('user_profiles').select('first_name, last_name, phone, email, auth_user_id')
        .eq('id', ownerId).maybeSingle()
      if (op) {
        ownerName  = `${op.first_name || ''} ${op.last_name || ''}`.trim() || 'Customer'
        ownerPhone = op.phone || null
        ownerEmail = op.email || null
        if (!ownerEmail && op.auth_user_id) {
          const { data: au } = await sc.auth.admin.getUserById(op.auth_user_id)
          ownerEmail = au?.user?.email || null
        }
      }
    }

    // Fallback: booking customer
    if (!ownerEmail && !ownerPhone) {
      const { data: booking } = await sc
        .from('bookings')
        .select('customer_email, customer_phone, customer:user_profiles!customer_user_id(first_name, last_name, phone, email, auth_user_id)')
        .eq('work_order_id', workOrderId).maybeSingle()
      if (booking) {
        ownerEmail = booking.customer_email || booking.customer?.email || null
        ownerPhone = booking.customer_phone || booking.customer?.phone || null
        if (!ownerName && booking.customer)
          ownerName = `${booking.customer.first_name || ''} ${booking.customer.last_name || ''}`.trim() || 'Customer'
        if (!ownerEmail && booking.customer?.auth_user_id) {
          const { data: au } = await sc.auth.admin.getUserById(booking.customer.auth_user_id)
          ownerEmail = au?.user?.email || null
        }
      }
    }

    // Walk-in
    if (!ownerEmail && !ownerPhone) {
      const { data: woWalkin } = await sc
        .from('work_orders').select('walk_in_owner_name, walk_in_owner_email, walk_in_owner_phone')
        .eq('id', workOrderId).maybeSingle()
      ownerEmail = woWalkin?.walk_in_owner_email || null
      ownerPhone = woWalkin?.walk_in_owner_phone || null
      ownerName  = ownerName || woWalkin?.walk_in_owner_name || 'Customer'
    }

    // Resolve vehicle plate
    const { data: veh } = await sc.from('vehicles').select('plate_number').eq('id', wo.vehicle_id).maybeSingle()
    const vehiclePlate  = veh?.plate_number || ''

    // ── 6. Mark invoice as sent ───────────────────────────────────────────
    await sc.from('invoices').update({ sent_at: new Date().toISOString() }).eq('id', inv.id)

    // ── 7. In-app notification ────────────────────────────────────────────
    if (ownerId) {
      const woUrl = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
      try {
        await sc.from('notifications').insert({
          user_id:           ownerId, recipient_user_id: ownerId,
          type:              'invoice_issued', notification_type: 'invoice_issued',
          title:             `Invoice ${inv.invoice_number} — KES ${Number(inv.total_amount).toLocaleString('en-KE')}`,
          message:           `Your invoice for work order ${wo.work_order_number} (${vehiclePlate}) is ready. Total: KES ${Number(inv.total_amount).toLocaleString('en-KE')}. Please arrange payment.`,
          reference_table:   'invoices', reference_id: inv.id, reference_type: 'invoice',
          is_read:           false,
        })
      } catch (_) {}
    }

    // ── 8. Build invoice HTML ─────────────────────────────────────────────
    const woUrl      = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
    const invoiceHtml = buildInvoiceHtml({
      invoiceNumber: inv.invoice_number,
      workOrderNumber: wo.work_order_number,
      providerName:  provRow?.name || 'Service Provider',
      vehiclePlate,
      ownerName:     ownerName || 'Customer',
      issuedAt:      inv.issued_at,
      dueDate:       inv.due_date,
      serviceItems,
      partItems,
      subtotal:      inv.subtotal,
      taxRate:       inv.tax_rate,
      taxAmount:     inv.tax_amount,
      totalAmount:   inv.total_amount,
      notes:         inv.notes,
      woUrl,
    })

    // Wrapper email that references the invoice (shorter version for the body)
    const emailBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">Your invoice is ready</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hello ${ownerName || 'there'},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      <strong>${provRow?.name || 'Your service provider'}</strong> has completed
      the work on your vehicle <strong>${vehiclePlate}</strong> and your invoice is ready.
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
    Your Invoice
  </p>
  ${invoiceHtml.replace('<!DOCTYPE html>', '').replace(/<html[^>]*>.*?<body[^>]*>/s, '').replace(/<\/body>.*?<\/html>/s, '')}
</td></tr>
</table>
</body></html>`

    // ── 9. Send email with invoice inline + attached ──────────────────────
    let emailSent = false
    if (ownerEmail) {
      try {
        const { auth, from } = (() => {
          const apiKey    = process.env.MAILJET_API_KEY
          const secretKey = process.env.MAILJET_SECRET_KEY
          if (!apiKey || !secretKey) throw new Error('Mailjet not configured')
          return {
            auth: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
            from: {
              Email: process.env.MAILJET_FROM_EMAIL || 'noreply@survlinx.com',
              Name:  process.env.MAILJET_FROM_NAME  || BRAND,
            }
          }
        })()

        const message = {
          From:     from,
          To:       [{ Email: ownerEmail, Name: ownerName || 'Customer' }],
          Subject:  `Invoice ${inv.invoice_number} — KES ${Number(inv.total_amount).toLocaleString('en-KE')} · ${provRow?.name || BRAND}`,
          HTMLPart: emailBody,
          TextPart: `${BRAND}: Invoice ${inv.invoice_number} from ${provRow?.name}.\nVehicle: ${vehiclePlate}\nAmount Due: KES ${Number(inv.total_amount).toLocaleString('en-KE')}\n\nView & Pay: ${woUrl}`,
          Attachments: [{
            ContentType:   'text/html',
            Filename:      `invoice-${inv.invoice_number}.html`,
            Base64Content: Buffer.from(invoiceHtml).toString('base64'),
          }],
        }

        const resp = await fetch('https://api.mailjet.com/v3.1/send', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body:    JSON.stringify({ Messages: [message] }),
        })
        if (resp.ok) emailSent = true
        else console.error('[send-invoice] Mailjet error:', await resp.text())
      } catch (e) { console.error('[send-invoice] email failed (non-fatal):', e.message) }
    }

    // ── 10. SMS ───────────────────────────────────────────────────────────
    let smsSent = false
    const phone = normalisePhone(ownerPhone)
    if (phone) {
      try {
        const r = await sendAndQueueSms(sc, {
          to:      phone,
          message: `${BRAND}: Invoice ${inv.invoice_number} from ${provRow?.name || 'your garage'} is ready. Amount: KES ${Number(inv.total_amount).toLocaleString('en-KE')}. View & pay: ${woUrl}`,
        })
        smsSent = r?.sent || false
      } catch (e) { console.error('[send-invoice] SMS failed (non-fatal):', e.message) }
    }

    return NextResponse.json({
      success:         true,
      invoice_number:  inv.invoice_number,
      email_sent:      emailSent,
      sms_sent:        smsSent,
      owner_has_email: !!ownerEmail,
      owner_has_phone: !!ownerPhone,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/send-invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}