/**
 * Shared subscription receipt HTML builder.
 *
 * Emulates the provider work-order receipt layout (ReceiptContent):
 *   - Dark header with green gradient + receipt number + amount
 *   - Receipt metadata grid (invoice, method, confirmed)
 *   - Amber accent bar
 *   - From / Billed To section
 *   - Line items table (subscription line)
 *   - Totals block with dark AMOUNT PAID pill
 *   - Notes section (if any)
 *   - Footer
 *
 * Pure function. Used by:
 *   - /api/subscription/payment-notify (email)
 *   - SubscriptionManager (client-side download)
 */
console.log('[LOAD] buildSubscriptionReceiptHtml')
const BRAND = 'GariCare'

/**
 * @param {object} args
 * @param {string} args.receiptNumber
 * @param {string} args.invoiceRef
 * @param {string} args.subscriptionNumber
 * @param {string} args.packageName
 * @param {string} args.subscriberName
 * @param {string} [args.subscriberEmail]
 * @param {string} [args.subscriberPhone]
 * @param {number} args.amountPaid
 * @param {number} args.amountDue
 * @param {number} args.taxAmount
 * @param {number} args.totalInvoice
 * @param {string} args.paymentMethod
 * @param {string} [args.transactionRef]
 * @param {string} args.paidAt
 * @param {boolean} args.confirmed
 * @param {string} [args.confirmedAt]
 * @param {string} args.currencySymbol
 * @param {string} [args.notes]
 */
export function buildSubscriptionReceiptHtml({
  receiptNumber,
  invoiceRef,
  subscriptionNumber,
  packageName,
  subscriberName,
  subscriberEmail,
  subscriberPhone,
  amountPaid,
  amountDue,
  taxAmount = 0,
  totalInvoice,
  paymentMethod,
  transactionRef,
  paidAt,
  confirmed = false,
  confirmedAt,
  currencySymbol = '',
  notes,
}) {
  const fmt  = (n) => `${currencySymbol}${Number(n || 0).toLocaleString('en-KE')}`
  const fmtD = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  const fmtDT = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
  const fmtDs = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const method = (paymentMethod || 'payment').replace(/_/g, ' ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Receipt ${receiptNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<div style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:620px;width:100%;
     box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Dark header with green gradient -->
  <div style="background:linear-gradient(135deg,#065f46 0%,#047857 100%);padding:28px 24px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <p style="margin:0 0 2px;font-size:10px;font-weight:700;letter-spacing:0.12em;
          color:#4ade80;text-transform:uppercase;">Payment Receipt</p>
        <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
          ${receiptNumber}</p>
        <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">${fmtDT(paidAt)}</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0 0 2px;font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;">Amount Paid</p>
        <p style="margin:0;font-size:28px;font-weight:900;color:#ffffff;">${fmt(amountPaid)}</p>
        <p style="margin:6px 0 0;">
          <span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;
            background:${confirmed ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'};
            color:${confirmed ? '#4ade80' : '#fbbf24'};">
            ${confirmed ? '✓ Confirmed' : '⏳ Pending'}
          </span>
        </p>
      </div>
    </div>

    <!-- Metadata grid -->
    <div style="display:flex;gap:24px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);">
      <div>
        <p style="margin:0 0 2px;font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;text-transform:uppercase;">Invoice</p>
        <p style="margin:0;font-size:13px;color:#e2e8f0;font-weight:600;">${invoiceRef}</p>
      </div>
      ${subscriptionNumber ? `<div>
        <p style="margin:0 0 2px;font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;text-transform:uppercase;">Subscription</p>
        <p style="margin:0;font-size:13px;color:#e2e8f0;font-weight:600;">${subscriptionNumber}</p>
      </div>` : ''}
      <div>
        <p style="margin:0 0 2px;font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;text-transform:uppercase;">Method</p>
        <p style="margin:0;font-size:13px;color:#e2e8f0;font-weight:600;text-transform:capitalize;">${method}</p>
      </div>
      ${transactionRef ? `<div>
        <p style="margin:0 0 2px;font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;text-transform:uppercase;">Ref</p>
        <p style="margin:0;font-size:13px;color:#e2e8f0;font-weight:600;font-family:monospace;">${transactionRef}</p>
      </div>` : ''}
      ${confirmed && confirmedAt ? `<div>
        <p style="margin:0 0 2px;font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;text-transform:uppercase;">Confirmed</p>
        <p style="margin:0;font-size:13px;color:#4ade80;font-weight:600;">${fmtDs(confirmedAt)}</p>
      </div>` : ''}
    </div>
  </div>

  <!-- Amber accent bar -->
  <div style="height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24,transparent);"></div>

  <!-- From / To row -->
  <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #f1f5f9;">
    <div style="padding:16px 24px;border-right:1px solid #f1f5f9;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">FROM</p>
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#0f172a;">${BRAND}</p>
      <p style="margin:0;font-size:12px;color:#64748b;">Vehicle Service Platform</p>
    </div>
    <div style="padding:16px 24px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">BILLED TO</p>
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#0f172a;">${subscriberName || 'Subscriber'}</p>
      ${subscriberPhone ? `<p style="margin:0 0 2px;font-size:12px;color:#64748b;">${subscriberPhone}</p>` : ''}
      ${subscriberEmail ? `<p style="margin:0;font-size:12px;color:#64748b;">${subscriberEmail}</p>` : ''}
    </div>
  </div>

  <!-- Line items -->
  <div style="padding:0 24px 8px;">
    <div style="margin-top:20px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:1px;">
        SUBSCRIPTION
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:8px 12px;font-weight:600;color:#64748b;font-size:11px;">Description</th>
            <th style="text-align:right;padding:8px 12px;font-weight:600;color:#64748b;font-size:11px;">Qty</th>
            <th style="text-align:right;padding:8px 12px;font-weight:600;color:#64748b;font-size:11px;">Unit</th>
            <th style="text-align:right;padding:8px 12px;font-weight:600;color:#64748b;font-size:11px;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-top:1px solid #f1f5f9;">
            <td style="padding:9px 12px;color:#0f172a;font-weight:500;">${packageName}</td>
            <td style="padding:9px 12px;text-align:right;color:#475569;">1</td>
            <td style="padding:9px 12px;text-align:right;color:#475569;">${fmt(amountDue)}</td>
            <td style="padding:9px 12px;text-align:right;font-weight:700;color:#0f172a;">${fmt(amountDue)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Totals -->
  <div style="margin:8px 24px 0;border-top:1px solid #e2e8f0;padding-top:12px;padding-bottom:8px;">
    <div style="display:flex;justify-content:flex-end;">
      <div style="min-width:240px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#64748b;">
          <span>Subtotal</span><span>${fmt(amountDue)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#64748b;">
          <span>Tax</span><span>${fmt(taxAmount)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 12px;margin-top:6px;background:#0f172a;border-radius:10px;font-size:15px;font-weight:800;">
          <span style="color:#f59e0b;">AMOUNT PAID</span>
          <span style="color:#fff;">${fmt(amountPaid)}</span>
        </div>
      </div>
    </div>
  </div>

  ${notes ? `
  <!-- Notes -->
  <div style="margin:12px 24px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;">
    <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;">Reference / Notes</p>
    <p style="margin:0;font-size:13px;color:#78350f;">${notes}</p>
  </div>` : ''}

  <!-- Footer -->
  <div style="margin:16px 24px 28px;text-align:center;padding-top:16px;border-top:1px solid #f1f5f9;">
    <p style="margin:0 0 2px;font-size:11px;color:#94a3b8;">Thank you for your subscription.</p>
    <p style="margin:0;font-size:10px;color:#cbd5e1;">Powered by ${BRAND} · Kenya</p>
  </div>
</div>
</td></tr>
</table>
</body>
</html>`
}