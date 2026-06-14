/**
 * Shared subscription invoice HTML builder.
 *
 * Emulates the provider work-order invoice layout:
 *   - Dark #0f172a header with invoice ref + dates
 *   - Blue accent bar (subscription = blue, work order = gold)
 *   - From / Bill To section
 *   - Line items table
 *   - Totals block
 *   - Dark CTA footer
 *
 * Pure function: no imports needed. Used by:
 *   - /api/subscription/send-invoice (email attachment)
 *   - SubscriptionManager (client-side download)
 */

const BRAND = 'GariCare'

/**
 * @param {object} args
 * @param {string} args.invoiceRef
 * @param {string} args.subscriptionNumber
 * @param {string} args.packageName
 * @param {string} args.subscriberName
 * @param {string} [args.subscriberEmail]
 * @param {string} [args.subscriberPhone]
 * @param {string} args.billingPeriod     - e.g. "Monthly", "Annual"
 * @param {string} args.billingStart
 * @param {string} args.billingEnd
 * @param {string} args.issuedAt
 * @param {string} args.dueDate
 * @param {number} args.amountDue
 * @param {number} args.taxAmount
 * @param {number} args.totalAmount
 * @param {string} args.currencySymbol
 * @param {string} args.currencyCode
 * @param {string} [args.status]          - 'unpaid' | 'paid' | 'overdue'
 * @param {number} [args.grossAmount]     - full price before credit
 * @param {number} [args.upgradeCredit]   - credit from previous subscription
 * @param {string} [args.upgradeNotes]    - explanation of the credit
 * @param {boolean} [args.forPdf]         - if true, removes clickable buttons (PDF is raster)
 * @param {number} [args.shopCount]       - number of shops in subscription
 * @param {number} [args.shopAddonAmount] - shop addon total for the period
 * @param {string} [args.ctaUrl]
 */
export function buildSubscriptionInvoiceHtml({
  invoiceRef,
  subscriptionNumber,
  packageName,
  subscriberName,
  subscriberEmail,
  subscriberPhone,
  billingPeriod,
  billingStart,
  billingEnd,
  issuedAt,
  dueDate,
  amountDue,
  taxAmount = 0,
  totalAmount,
  currencySymbol = '',
  currencyCode = '',
  status = 'unpaid',
  grossAmount,
  upgradeCredit = 0,
  upgradeNotes,
  forPdf = false,
  shopCount = 0,
  shopAddonAmount = 0,
  ctaUrl = '#',
}) {
  const fmt  = (n) => `${currencySymbol}${Number(n || 0).toLocaleString('en-KE')}`
  const fmtD = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const statusColor = status === 'paid' ? '#22c55e' : status === 'overdue' ? '#ef4444' : '#f59e0b'
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1)
  const hasShopAddon = shopCount > 1 && shopAddonAmount > 0
  const baseAmount = hasShopAddon ? (grossAmount || amountDue) - shopAddonAmount : (grossAmount || amountDue)
  const lineItemAmount = fmt(baseAmount)

  // Shop addon line item
  const shopLineItemHtml = hasShopAddon ? `
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:10px 24px;color:#1e293b;font-size:13px;font-weight:500;">
            Shop Addon
            <span style="display:block;font-size:11px;color:#64748b;margin-top:1px;">${shopCount} shops (1 free + ${shopCount - 1} paid)</span>
          </td>
          <td style="padding:10px 8px;color:#64748b;font-size:13px;text-align:center;">
            ${shopCount - 1} extra
          </td>
          <td style="padding:10px 24px;color:#3b82f6;font-size:13px;font-weight:600;text-align:right;">${fmt(shopAddonAmount)}</td>
        </tr>` : ''
  // CTA section based on payment status + PDF mode
  const isPaid = status === 'paid'
  let ctaSection = ''
  if (forPdf) {
    // PDF: no clickable buttons, just a thank-you or payment reminder
    ctaSection = isPaid
      ? `<td style="padding:24px 32px;text-align:center;background:#0f172a;">
          <p style="margin:0;font-size:14px;color:#4ade80;">✓ This invoice has been paid in full. Thank you!</p>
        </td>`
      : `<td style="padding:24px 32px;text-align:center;background:#0f172a;">
          <p style="margin:0 0 8px;font-size:14px;color:#94a3b8;">Please log in to your ${BRAND} dashboard to arrange payment.</p>
          <p style="margin:0;font-size:12px;color:#64748b;font-family:monospace;word-break:break-all;">${ctaUrl}</p>
        </td>`
  } else {
    // HTML: clickable buttons
    ctaSection = isPaid
      ? `<td style="padding:24px 32px;text-align:center;background:#0f172a;">
          <p style="margin:0 0 16px;font-size:14px;color:#4ade80;">✓ This invoice has been paid in full. Thank you!</p>
          <a href="${ctaUrl}" style="display:inline-block;background:#22c55e;color:#ffffff;
            padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:0.02em;">
            View Subscription
          </a>
        </td>`
      : `<td style="padding:24px 32px;text-align:center;background:#0f172a;">
          <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">
            Please review and arrange payment at your earliest convenience.
          </p>
          <a href="${ctaUrl}" style="display:inline-block;background:#3b82f6;color:#ffffff;
            padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:0.02em;">
            View &amp; Pay Invoice
          </a>
        </td>`
  }

  const hasCredit = upgradeCredit > 0

  // Build credit line item row (or empty string)
  const creditLineItemHtml = hasCredit ? `
        <tr style="border-top:1px solid #f1f5f9;background:#f0fdf4;">
          <td colspan="2" style="padding:10px 24px;color:#16a34a;font-size:13px;font-weight:600;">
            ↗ Upgrade Credit
            <span style="display:block;font-size:11px;font-weight:400;color:#64748b;margin-top:2px;">${upgradeNotes || 'Pro-rata credit from previous subscription'}</span>
          </td>
          <td style="padding:10px 24px;color:#16a34a;font-size:13px;font-weight:700;text-align:right;">−${fmt(upgradeCredit)}</td>
        </tr>` : ''

  // Build credit totals row (or empty string)
  const creditTotalHtml = hasCredit ? `
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#16a34a;">Upgrade Credit</td>
                <td style="padding:5px 0;font-size:13px;color:#16a34a;font-weight:600;text-align:right;">−${fmt(upgradeCredit)}</td>
              </tr>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Invoice ${invoiceRef}</title>
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
              color:#3b82f6;text-transform:uppercase;">Subscription Invoice</p>
            <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
              ${invoiceRef}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;">
              ${subscriptionNumber ? `Subscription · ${subscriptionNumber}` : packageName}</p>
          </td>
          <td align="right" style="vertical-align:top;">
            <p style="margin:0 0 2px;font-size:11px;color:#64748b;">Issued</p>
            <p style="margin:0;font-size:13px;font-weight:600;color:#e2e8f0;">${fmtD(issuedAt)}</p>
            ${dueDate ? `<p style="margin:6px 0 2px;font-size:11px;color:#64748b;">Due</p>
            <p style="margin:0;font-size:13px;font-weight:600;color:#fbbf24;">${fmtD(dueDate)}</p>` : ''}
            <p style="margin:8px 0 0;">
              <span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;
                background:${statusColor}22;color:${statusColor};">${statusLabel}</span>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Blue accent line -->
  <tr>
    <td style="height:3px;background:linear-gradient(90deg,#3b82f6,#60a5fa,transparent);"></td>
  </tr>

  <!-- From / To -->
  <tr>
    <td style="padding:24px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="vertical-align:top;padding-right:16px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;
              color:#94a3b8;text-transform:uppercase;">From</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${BRAND}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Vehicle Service Platform</p>
          </td>
          <td width="50%" style="vertical-align:top;padding-left:16px;border-left:1px solid #e2e8f0;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;
              color:#94a3b8;text-transform:uppercase;">Bill To</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${subscriberName || 'Subscriber'}</p>
            ${subscriberEmail ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${subscriberEmail}</p>` : ''}
            ${subscriberPhone ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${subscriberPhone}</p>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Line items -->
  <tr>
    <td style="padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:10px 24px;font-size:11px;font-weight:700;letter-spacing:0.06em;
            color:#64748b;text-align:left;text-transform:uppercase;">Description</th>
          <th style="padding:10px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;
            color:#64748b;text-align:center;text-transform:uppercase;">Period</th>
          <th style="padding:10px 24px;font-size:11px;font-weight:700;letter-spacing:0.06em;
            color:#64748b;text-align:right;text-transform:uppercase;">Amount</th>
        </tr>
        <tr>
          <td colspan="3" style="padding:14px 24px 6px;font-size:11px;font-weight:700;
            letter-spacing:0.08em;text-transform:uppercase;color:#3b82f6;">
            SUBSCRIPTION
          </td>
        </tr>
        <tr style="border-top:1px solid #f1f5f9;">
          <td style="padding:10px 24px;color:#1e293b;font-size:13px;font-weight:500;">${packageName}</td>
          <td style="padding:10px 8px;color:#64748b;font-size:13px;text-align:center;">
            ${fmtD(billingStart)} – ${fmtD(billingEnd)}
          </td>
          <td style="padding:10px 24px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;">${lineItemAmount}</td>
        </tr>
        ${shopLineItemHtml}
        ${creditLineItemHtml}
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
                <td style="padding:5px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;">${fmt(grossAmount || amountDue)}</td>
              </tr>
              ${hasShopAddon ? `<tr>
                <td style="padding:3px 0;font-size:11px;color:#94a3b8;padding-left:12px;">Base package</td>
                <td style="padding:3px 0;font-size:11px;color:#94a3b8;text-align:right;">${lineItemAmount}</td>
              </tr>
              <tr>
                <td style="padding:3px 0;font-size:11px;color:#3b82f6;padding-left:12px;">Shop addon (${shopCount - 1} extra)</td>
                <td style="padding:3px 0;font-size:11px;color:#3b82f6;text-align:right;">${fmt(shopAddonAmount)}</td>
              </tr>` : ''}
              ${creditTotalHtml}
              <tr>
                <td style="padding:5px 0;font-size:13px;color:#64748b;">Tax</td>
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

  <!-- CTA -->
  <tr>
    ${ctaSection}
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;text-align:center;border-top:1px solid #1e293b;background:#0f172a;">
      <p style="margin:0;font-size:11px;color:#475569;">
        ${BRAND} · Vehicle Service Platform · Kenya<br>
        &copy; ${new Date().getFullYear()} ${BRAND}. This is an official subscription invoice.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`
}