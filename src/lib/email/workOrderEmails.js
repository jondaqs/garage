/**
 * lib/email/workOrderEmails.js
 * ────────────────────────────
 * All work-order-related outgoing emails.
 * Each exported function:
 *   1. Builds the HTML template
 *   2. Calls sendAndQueueEmail (queues + sends + updates record)
 *   3. Returns { sent: boolean }
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'

const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND_NAME = 'Motiifix'

// ─── Shared HTML wrapper ─────────────────────────────────────────────────────

function emailWrapper({ title, previewText, bodyHtml, ctaHref, ctaLabel, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">${previewText || title}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px 32px 24px;text-align:center;">
          <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">${BRAND_NAME}</p>
          <p style="margin:0;font-size:15px;color:#bbf7d0;">${title}</p>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:32px;">
          ${bodyHtml}
          ${ctaHref ? `
          <div style="text-align:center;margin:32px 0;">
            <a href="${ctaHref}"
               style="display:inline-block;background:#16a34a;color:#ffffff;padding:14px 36px;
                      border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
              ${ctaLabel || 'View Details'}
            </a>
          </div>` : ''}
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          ${footerNote ? `<p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${footerNote}</p>` : ''}
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            © ${new Date().getFullYear()} ${BRAND_NAME} · Vehicle Service Platform · Kenya
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

function infoRow(label, value) {
  return `<tr>
    <td style="padding:8px 0;color:#6b7280;font-size:14px;width:40%;">${label}</td>
    <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${value}</td>
  </tr>`
}

function estimateTable({ servicesTotal, partsTotal, tax, total, currency = 'KES' }) {
  const fmt = (n) => `${currency} ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`
  return `
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:20px 0;">
    <tr>
      <td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;color:#374151;font-size:14px;">Services</td>
            <td style="padding:6px 0;color:#374151;font-size:14px;text-align:right;">${fmt(servicesTotal)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#374151;font-size:14px;">Parts &amp; Materials</td>
            <td style="padding:6px 0;color:#374151;font-size:14px;text-align:right;">${fmt(partsTotal)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#374151;font-size:14px;border-top:1px solid #d1fae5;">VAT (16%)</td>
            <td style="padding:6px 0;color:#374151;font-size:14px;text-align:right;border-top:1px solid #d1fae5;">${fmt(tax)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 0;color:#166534;font-size:16px;font-weight:700;">Total</td>
            <td style="padding:10px 0 0;color:#166534;font-size:16px;font-weight:700;text-align:right;">${fmt(total)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

// ─── 1. Estimate ready for customer approval ─────────────────────────────────

/**
 * sendEstimateApprovalEmail(supabase, { to, ownerName, workOrderNumber, providerName,
 *   vehiclePlate, estimate: { services_total, parts_total, tax, total }, workOrderId })
 */
export async function sendEstimateApprovalEmail(supabase, {
  to, ownerName, workOrderNumber, providerName,
  vehiclePlate, estimate, workOrderId,
}) {
  const approveUrl = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const greeting   = ownerName ? `Hello ${ownerName},` : 'Hello,'

  const bodyHtml = `
    <p style="color:#374151;font-size:16px;margin:0 0 20px;">${greeting}</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      <strong>${providerName}</strong> has completed diagnostics on your vehicle and
      prepared a service estimate for your review and approval.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${infoRow('Work Order', `<strong>${workOrderNumber}</strong>`)}
      ${infoRow('Vehicle', vehiclePlate)}
      ${infoRow('Service Provider', providerName)}
    </table>
    ${estimateTable(estimate)}
    <p style="color:#374151;font-size:14px;margin:0 0 12px;">
      Please review the estimate breakdown and either <strong>approve</strong> to authorise
      the work, <strong>reject</strong> to cancel, or <strong>request changes</strong> if
      you need adjustments.
    </p>
    <p style="color:#dc2626;font-size:13px;font-weight:500;margin:0;">
      ⏰ Please respond within 24 hours to avoid delays to your service.
    </p>`

  const html = emailWrapper({
    title:       'Service Estimate Ready for Approval',
    previewText: `${providerName} has sent an estimate of KES ${Number(estimate?.total||0).toLocaleString()} for your vehicle`,
    bodyHtml,
    ctaHref:     approveUrl,
    ctaLabel:    'Review &amp; Approve Estimate',
    footerNote:  `You can approve, reject, or request changes from your GariCare dashboard.`,
  })

  const text = `${greeting}

${providerName} has prepared a service estimate for work order ${workOrderNumber} on your vehicle (${vehiclePlate}).

Services: KES ${Number(estimate?.services_total||0).toLocaleString()}
Parts:    KES ${Number(estimate?.parts_total||0).toLocaleString()}
VAT 16%:  KES ${Number(estimate?.tax||0).toLocaleString()}
TOTAL:    KES ${Number(estimate?.total||0).toLocaleString()}

Review and approve here: ${approveUrl}

Please respond within 24 hours.
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: ownerName || to }],
    subject:        `Service Estimate Ready — ${workOrderNumber} (KES ${Number(estimate?.total||0).toLocaleString()})`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 2. Estimate approved — notify provider ───────────────────────────────────

export async function sendEstimateApprovedEmail(supabase, {
  to, providerName, workOrderNumber, customerName, vehiclePlate,
  estimateTotal, workOrderId,
}) {
  const woUrl = `${APP_URL()}/provider/work-orders/${workOrderId}`

  const bodyHtml = `
    <p style="color:#374151;font-size:16px;margin:0 0 20px;">Great news, ${providerName}!</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      The customer has <strong style="color:#16a34a;">approved</strong> your service estimate.
      You are now authorised to proceed with the work.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${infoRow('Work Order', `<strong>${workOrderNumber}</strong>`)}
      ${infoRow('Vehicle', vehiclePlate)}
      ${infoRow('Customer', customerName || 'Customer')}
      ${infoRow('Approved Amount', `<strong style="color:#16a34a;">KES ${Number(estimateTotal||0).toLocaleString()}</strong>`)}
    </table>
    <p style="color:#374151;font-size:14px;margin:0;">
      Please begin the service at your earliest convenience and keep the customer updated on progress.
    </p>`

  const html = emailWrapper({
    title:       'Estimate Approved — Start Work',
    previewText: `${customerName} approved the estimate for ${workOrderNumber}`,
    bodyHtml,
    ctaHref:     woUrl,
    ctaLabel:    'Open Work Order',
  })

  const text = `Great news, ${providerName}!

The customer has approved your estimate for work order ${workOrderNumber} (${vehiclePlate}).
Approved amount: KES ${Number(estimateTotal||0).toLocaleString()}

Open work order: ${woUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: providerName }],
    subject:        `✅ Estimate Approved — ${workOrderNumber}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 3. Estimate rejected — notify provider ───────────────────────────────────

export async function sendEstimateRejectedEmail(supabase, {
  to, providerName, workOrderNumber, vehiclePlate, reason, workOrderId,
}) {
  const woUrl = `${APP_URL()}/provider/work-orders/${workOrderId}`

  const bodyHtml = `
    <p style="color:#374151;font-size:16px;margin:0 0 20px;">Hello ${providerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      Unfortunately, the customer has <strong style="color:#dc2626;">rejected</strong> the
      service estimate for work order <strong>${workOrderNumber}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${infoRow('Work Order', workOrderNumber)}
      ${infoRow('Vehicle', vehiclePlate)}
      ${reason ? infoRow('Reason given', `<em>${reason}</em>`) : ''}
    </table>
    <p style="color:#374151;font-size:14px;margin:0;">
      The work order has been cancelled. Please contact the customer if you would like to
      discuss alternative options.
    </p>`

  const html = emailWrapper({
    title:       'Estimate Rejected by Customer',
    previewText: `Customer rejected the estimate for ${workOrderNumber}`,
    bodyHtml,
    ctaHref:     woUrl,
    ctaLabel:    'View Work Order',
  })

  const text = `Hello ${providerName},

The customer has rejected the estimate for work order ${workOrderNumber} (${vehiclePlate}).
${reason ? `Reason: ${reason}\n` : ''}
The work order has been cancelled. Please contact the customer if needed.

View: ${woUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: providerName }],
    subject:        `❌ Estimate Rejected — ${workOrderNumber}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 4. Changes requested — notify provider ───────────────────────────────────

export async function sendEstimateChangesRequestedEmail(supabase, {
  to, providerName, workOrderNumber, vehiclePlate, changes, workOrderId,
}) {
  const woUrl = `${APP_URL()}/provider/work-orders/${workOrderId}`

  const bodyHtml = `
    <p style="color:#374151;font-size:16px;margin:0 0 20px;">Hello ${providerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      The customer has reviewed your estimate for work order <strong>${workOrderNumber}</strong>
      and requested some changes before they can approve.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#92400e;">Customer's requested changes:</p>
      <p style="margin:0;font-size:14px;color:#78350f;">"${changes}"</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${infoRow('Vehicle', vehiclePlate)}
    </table>
    <p style="color:#374151;font-size:14px;margin:0;">
      Please revise the services or parts list in the work order and re-submit the estimate
      when ready.
    </p>`

  const html = emailWrapper({
    title:       'Customer Requested Estimate Changes',
    previewText: `Changes requested on estimate for ${workOrderNumber}`,
    bodyHtml,
    ctaHref:     woUrl,
    ctaLabel:    'Revise Estimate',
  })

  const text = `Hello ${providerName},

The customer has requested changes to the estimate for work order ${workOrderNumber} (${vehiclePlate}).

Customer's requested changes:
"${changes}"

Please revise and re-submit: ${woUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: providerName }],
    subject:        `⚠️ Estimate Changes Requested — ${workOrderNumber}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 5. Service completed — notify vehicle owner ──────────────────────────────

/**
 * sendWorkOrderCompletedEmail(supabase, { to, ownerName, workOrderNumber,
 *   providerName, vehiclePlate, workOrderId, providerPhone? })
 */
export async function sendWorkOrderCompletedEmail(supabase, {
  to, ownerName, workOrderNumber, providerName,
  vehiclePlate, workOrderId, providerPhone,
}) {
  const detailUrl = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const greeting  = ownerName ? `Hello ${ownerName},` : 'Hello,'

  const bodyHtml = `
    <p style="color:#374151;font-size:16px;margin:0 0 20px;">${greeting}</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      <p style="font-size:32px;margin:0 0 8px;">✅</p>
      <p style="color:#166534;font-size:18px;font-weight:700;margin:0 0 4px;">
        Your vehicle is ready for pickup!
      </p>
      <p style="color:#15803d;font-size:14px;margin:0;">${vehiclePlate}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${infoRow('Work Order',       `<strong>${workOrderNumber}</strong>`)}
      ${infoRow('Vehicle',          vehiclePlate)}
      ${infoRow('Service Provider', providerName)}
      ${providerPhone ? infoRow('Contact', providerPhone) : ''}
    </table>
    <p style="color:#374151;font-size:14px;margin:0;">
      Please collect your vehicle at your earliest convenience. If you have any
      questions about the work performed, do not hesitate to contact ${providerName} directly.
    </p>`

  const html = emailWrapper({
    title:       'Vehicle Ready for Pickup',
    previewText: `Your vehicle ${vehiclePlate} is ready at ${providerName}`,
    bodyHtml,
    ctaHref:     detailUrl,
    ctaLabel:    'View Service Details',
    footerNote:  'You can view the full service record and invoice in your GariCare dashboard.',
  })

  const text = `${greeting}

Your vehicle ${vehiclePlate} is ready for pickup at ${providerName}!

Work Order: ${workOrderNumber}
${providerPhone ? `Contact: ${providerPhone}\n` : ''}
View full details: ${detailUrl}

— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: ownerName || to }],
    subject:        `✅ Your vehicle is ready — ${workOrderNumber}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}
/**
 * sendInvoiceEmail(supabase, { to, ownerName, workOrderNumber,
 *   providerName, invoiceNumber, totalAmount, workOrderId })
 */
export async function sendInvoiceEmail(supabase, {
  to, ownerName, workOrderNumber, providerName,
  invoiceNumber, totalAmount, workOrderId,
}) {
  const detailUrl = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const greeting  = ownerName ? `Hello ${ownerName},` : 'Hello,'
  const amount    = `KES ${Number(totalAmount || 0).toLocaleString()}`

  const bodyHtml = `
    <p style="color:#374151;font-size:16px;margin:0 0 20px;">${greeting}</p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
      <p style="font-size:32px;margin:0 0 8px;">🧾</p>
      <p style="color:#92400e;font-size:18px;font-weight:700;margin:0 0 4px;">Your invoice is ready</p>
      <p style="color:#b45309;font-size:24px;font-weight:800;margin:0;">${amount}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${infoRow('Invoice Number', `<strong>${invoiceNumber}</strong>`)}
      ${infoRow('Work Order',     workOrderNumber)}
      ${infoRow('Service Provider', providerName)}
      ${infoRow('Amount Due',     `<strong style="color:#16a34a;">${amount}</strong>`)}
    </table>
    <p style="color:#374151;font-size:14px;margin:0;">
      Please arrange payment at your earliest convenience. You can view your full invoice
      and service breakdown in your GariCare dashboard.
    </p>`

  const html = emailWrapper({
    title:       'Invoice Ready for Payment',
    previewText: `Invoice ${invoiceNumber} — ${amount} due`,
    bodyHtml,
    ctaHref:     detailUrl,
    ctaLabel:    'View Invoice',
    footerNote:  'Contact the service provider if you have any questions about this invoice.',
  })

  const text = `${greeting}\n\nYour invoice is ready.\n\nInvoice: ${invoiceNumber}\nWork Order: ${workOrderNumber}\nProvider: ${providerName}\nAmount Due: ${amount}\n\nView invoice: ${detailUrl}\n\n— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: ownerName || to }],
    subject:        `🧾 Invoice Ready — ${invoiceNumber} (${amount})`,
    html,
    text,
    referenceTable: 'invoices',
    referenceId:    workOrderId,
  })
}
