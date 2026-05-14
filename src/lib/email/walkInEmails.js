/**
 * lib/email/walkInEmails.js
 * ─────────────────────────
 * Email notifications related to walk-in work orders.
 *
 *  sendWalkInCreatedEmail  — to the provider owner + admins (excluding initiator)
 *                            when a member with can_approve_work creates a
 *                            walk-in work order.
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'

const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND_NAME = 'Motiifix'

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—'

/**
 * sendWalkInCreatedEmail(supabase, {
 *   to, recipientName, recipientRole,        — who's being notified
 *   workOrderNumber, workOrderId,
 *   vehiclePlate, vehicleMake, vehicleModel,
 *   ownerInfo,                                — string e.g. "Registered: Jane Mwangi" or "Walk-in: 0712 000 000"
 *   initiatorName, initiatorRole,             — who created the WO
 *   priority, problemDescription,
 *   shopName, shopTown,
 *   createdAt,
 *   recipientIsOwner,                         — boolean for header copy
 * })
 */
export async function sendWalkInCreatedEmail(supabase, {
  to,
  recipientName,
  recipientRole,
  workOrderNumber,
  workOrderId,
  vehiclePlate,
  vehicleMake,
  vehicleModel,
  ownerInfo,
  initiatorName,
  initiatorRole,
  priority,
  problemDescription,
  shopName,
  shopTown,
  createdAt,
  recipientIsOwner = false,
}) {
  const workOrderUrl = `${APP_URL()}/provider/work-orders/${workOrderId}`
  const priorityLabel = priority && priority !== 'normal'
    ? priority.charAt(0).toUpperCase() + priority.slice(1)
    : null

  const heading = recipientIsOwner
    ? '🔧 New Walk-In Work Order Created'
    : '🔧 Walk-In Work Order Created'

  const intro = recipientIsOwner
    ? `A member of your team has created a new walk-in work order. Here are the details:`
    : `A new walk-in work order has been created by ${initiatorName}. Here are the details:`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">

  <!-- Header (green — same family as the new-booking provider email) -->
  <tr>
    <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND_NAME}</p>
      <p style="margin:0;font-size:14px;color:#bbf7d0;">${heading}</p>
    </td>
  </tr>

  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 20px;">Hello ${recipientName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">${intro}</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%;">Work Order</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${workOrderNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Created</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${fmtDateTime(createdAt)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Created by</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">
            ${initiatorName}${initiatorRole ? ` <span style="color:#6b7280;">(${initiatorRole})</span>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Vehicle</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">
            ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Owner</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${ownerInfo || 'Unknown / unregistered'}</td>
        </tr>
        ${shopName ? `<tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Shop</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${shopName}${shopTown ? `, ${shopTown}` : ''}</td>
        </tr>` : ''}
        ${priorityLabel ? `<tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Priority</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${priorityLabel}</td>
        </tr>` : ''}
      </table>
    </div>

    ${problemDescription ? `
    <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">Problem description</p>
    <p style="color:#374151;font-size:13px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:0 0 24px;">${problemDescription}</p>
    ` : ''}

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#1e40af;font-size:13px;">
        The work order is in <strong>Intake</strong> status. Review it to assign a mechanic, add diagnostic notes,
        or prepare an estimate.
      </p>
    </div>

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${workOrderUrl}"
         style="display:inline-block;background:#16a34a;color:#fff;padding:13px 32px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Open Work Order
      </a>
    </div>
  </td></tr>

  <tr>
    <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND_NAME}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `${BRAND_NAME} — ${heading.replace(/[🔧]/g, '').trim()}

Hello ${recipientName},

${intro}

Work Order: ${workOrderNumber}
Created:    ${fmtDateTime(createdAt)}
Created by: ${initiatorName}${initiatorRole ? ` (${initiatorRole})` : ''}
Vehicle:    ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}
Owner:      ${ownerInfo || 'Unknown / unregistered'}${shopName ? `
Shop:       ${shopName}${shopTown ? `, ${shopTown}` : ''}` : ''}${priorityLabel ? `
Priority:   ${priorityLabel}` : ''}
${problemDescription ? `\nProblem: ${problemDescription}\n` : ''}
The work order is in Intake status. Open it to assign a mechanic or add notes.

Open work order: ${workOrderUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: recipientName }],
    subject:        `Walk-In WO Created — ${workOrderNumber} · ${vehiclePlate}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}