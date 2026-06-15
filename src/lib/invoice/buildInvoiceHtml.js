/**
 * Shared invoice HTML builder.
 *
 * Produces the standalone, self-contained HTML document that:
 *   - is attached to the customer email by /api/work-orders/[id]/send-invoice
 *   - is returned by /api/work-orders/[id]/invoice/html for client-side PDF download
 *
 * Both surfaces must emit the *same* document so the PDF the user
 * downloads from the app is identical to the HTML attached to their email.
 *
 * Pure function: no Node-specific or Supabase-specific imports here so it can
 * be reused from any route handler.
 *
 * Uses only hex colours and inline styles so it renders reliably in email
 * clients AND in html2canvas without any colour-stripping shim.
 */

const BRAND = 'Motiifix'

/**
 * @param {object} args
 * @param {string} args.invoiceNumber
 * @param {string} args.workOrderNumber
 * @param {string} args.providerName
 * @param {string} args.vehiclePlate
 * @param {string} args.ownerName
 * @param {string|Date} args.issuedAt
 * @param {string|Date|null} args.dueDate
 * @param {Array<{item_name:string, quantity:number, unit_price:number, total_price:number}>} args.serviceItems
 * @param {Array<{item_name:string, quantity:number, unit_price:number, total_price:number}>} args.partItems
 * @param {number} args.subtotal
 * @param {number} args.taxRate     - fractional, e.g. 0.16 for 16%
 * @param {number} args.taxAmount
 * @param {number} args.totalAmount
 * @param {string|null} [args.notes]
 * @param {string} args.woUrl
 */
export function buildInvoiceHtml({
  invoiceNumber,
  workOrderNumber,
  providerName,
  vehiclePlate,
  ownerName,
  issuedAt,
  dueDate,
  serviceItems = [],
  partItems = [],
  subtotal,
  taxRate,
  taxAmount,
  totalAmount,
  notes,
  woUrl,
}) {
  const fmt  = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`
  const fmtD = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
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