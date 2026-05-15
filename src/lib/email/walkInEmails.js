/**
 * lib/email/walkInEmails.js
 * ─────────────────────────
 * Email notifications related to walk-in work orders.
 *
 *  sendWalkInCreatedEmail  — to the provider owner + admins (excluding initiator)
 *                            when a member with can_approve_work creates a
 *                            walk-in work order. Internal team alert.
 *
 *  sendWalkInOwnerEmail    — to the REGISTERED customer who already has an
 *                            account. Sent in addition to the in-app push
 *                            because the owner may have sent a chauffeur to
 *                            the garage and is not near the app.
 *
 * NOTE: the UNREGISTERED-customer invite email (with signup token) lives in
 * src/app/api/provider/work-orders/route.js because it uses Mailjet's raw
 * API + the email_queue table directly. Don't fold those two into one helper
 * without auditing the queueing semantics.
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

// ─── 1. Provider owner + admin alert email ───────────────────────────────────

/**
 * sendWalkInCreatedEmail(supabase, {
 *   to, recipientName, recipientRole,
 *   workOrderNumber, workOrderId,
 *   vehiclePlate, vehicleMake, vehicleModel,
 *   ownerInfo,
 *   initiatorName, initiatorRole,
 *   priority, problemDescription,
 *   shopName, shopTown,
 *   createdAt,
 *   recipientIsOwner,
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
    subject:        `Walk-In Work Order Created — ${workOrderNumber} · ${vehiclePlate}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 2. Registered customer email ────────────────────────────────────────────

/**
 * sendWalkInOwnerEmail(supabase, {
 *   to, customerName,
 *   workOrderNumber, workOrderId,
 *   vehiclePlate, vehicleMake, vehicleModel,
 *   providerName,
 *   shopName, shopTown,
 *   problemDescription, priority,
 *   createdAt,
 * })
 *
 * Sent to the REGISTERED owner of a walk-in vehicle. Goes alongside the SMS
 * + in-app notification because the owner may have sent a chauffeur — they
 * may not be holding their phone or looking at the app when the WO opens.
 */
export async function sendWalkInOwnerEmail(supabase, {
  to,
  customerName,
  workOrderNumber,
  workOrderId,
  vehiclePlate,
  vehicleMake,
  vehicleModel,
  providerName,
  shopName,
  shopTown,
  problemDescription,
  priority,
  createdAt,
}) {
  const workOrderUrl  = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const priorityLabel = priority && priority !== 'normal'
    ? priority.charAt(0).toUpperCase() + priority.slice(1)
    : null

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">

  <!-- Header (green to match the walk-in family) -->
  <tr>
    <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND_NAME}</p>
      <p style="margin:0;font-size:14px;color:#bbf7d0;">🔧 Your Vehicle is at the Garage</p>
    </td>
  </tr>

  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 20px;">Hello ${customerName || 'there'},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      Your vehicle <strong>${vehiclePlate}</strong> has been brought in to
      <strong>${providerName || 'the garage'}</strong>${shopName ? ` (${shopName}${shopTown ? `, ${shopTown}` : ''})` : ''}
      and a work order has been opened.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%;">Work Order</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${workOrderNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Vehicle</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">
            ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Opened</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${fmtDateTime(createdAt)}</td>
        </tr>
        ${priorityLabel ? `<tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Priority</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${priorityLabel}</td>
        </tr>` : ''}
      </table>
    </div>

    ${problemDescription ? `
    <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">Reported issue</p>
    <p style="color:#374151;font-size:13px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:0 0 24px;">${problemDescription}</p>
    ` : ''}

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#1e40af;font-size:13px;">
        Wasn't expecting this? If someone else dropped your vehicle off (chauffeur, family member, etc.),
        this is normal — you can track everything from your dashboard. If you didn't authorise this service,
        please contact the provider immediately.
      </p>
    </div>

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${workOrderUrl}"
         style="display:inline-block;background:#16a34a;color:#fff;padding:13px 32px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Track Service Progress
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

  const text = `${BRAND_NAME} — Your Vehicle is at the Garage

Hello ${customerName || 'there'},

Your vehicle ${vehiclePlate} has been brought in to ${providerName || 'the garage'}${shopName ? ` (${shopName}${shopTown ? `, ${shopTown}` : ''})` : ''}
and a work order has been opened.

Work Order: ${workOrderNumber}
Vehicle:    ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}
Opened:     ${fmtDateTime(createdAt)}${priorityLabel ? `
Priority:   ${priorityLabel}` : ''}
${problemDescription ? `\nReported issue: ${problemDescription}\n` : ''}
If someone else dropped your vehicle off (chauffeur, family member, etc.), this is normal — you can track everything from your dashboard. If you didn't authorise this service, please contact the provider immediately.

Track service progress: ${workOrderUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: customerName || 'Customer' }],
    subject:        `Your vehicle ${vehiclePlate} is at the garage — ${workOrderNumber}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 3. Company fleet recipient email ────────────────────────────────────────

/**
 * sendWalkInFleetEmail(supabase, {
 *   to, recipientName, recipientRole,        — recipient (owner or fleet manager)
 *   companyName,
 *   workOrderNumber, workOrderId,
 *   vehiclePlate, vehicleMake, vehicleModel,
 *   providerName,
 *   shopName, shopTown,
 *   problemDescription, priority,
 *   createdAt,
 * })
 *
 * Sent to the company owner + every active fleet manager / admin of the
 * company that owns the walked-in vehicle. As with the individual flow, the
 * chauffeur who delivered the vehicle to the garage is often not one of these
 * people — so all three channels (email + SMS + in-app) are used.
 */
export async function sendWalkInFleetEmail(supabase, {
  to,
  recipientName,
  recipientRole,
  companyName,
  workOrderNumber,
  workOrderId,
  vehiclePlate,
  vehicleMake,
  vehicleModel,
  providerName,
  shopName,
  shopTown,
  problemDescription,
  priority,
  createdAt,
}) {
  const workOrderUrl  = `${APP_URL()}/company/work-orders/${workOrderId}`
  const priorityLabel = priority && priority !== 'normal'
    ? priority.charAt(0).toUpperCase() + priority.slice(1)
    : null

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">

  <tr>
    <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND_NAME}</p>
      <p style="margin:0;font-size:14px;color:#bbf7d0;">🚗 Fleet Vehicle at the Garage</p>
    </td>
  </tr>

  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 20px;">Hello ${recipientName || 'there'},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      A vehicle from <strong>${companyName || 'your fleet'}</strong> &mdash;
      <strong>${vehiclePlate}</strong> &mdash; has been brought in to
      <strong>${providerName || 'a service provider'}</strong>${shopName ? ` (${shopName}${shopTown ? `, ${shopTown}` : ''})` : ''}
      and a work order has been opened.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%;">Work Order</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${workOrderNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Fleet Vehicle</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">
            ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Opened</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${fmtDateTime(createdAt)}</td>
        </tr>
        ${priorityLabel ? `<tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Priority</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${priorityLabel}</td>
        </tr>` : ''}
      </table>
    </div>

    ${problemDescription ? `
    <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">Reported issue</p>
    <p style="color:#374151;font-size:13px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:0 0 24px;">${problemDescription}</p>
    ` : ''}

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#1e40af;font-size:13px;">
        If a driver delivered this vehicle without prior notice, this is normal &mdash; you can
        track everything from your company dashboard. If this drop-off was not authorised,
        please contact the provider immediately.
      </p>
    </div>

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${workOrderUrl}"
         style="display:inline-block;background:#16a34a;color:#fff;padding:13px 32px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Track Service Progress
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

  const text = `${BRAND_NAME} — Fleet Vehicle at the Garage

Hello ${recipientName || 'there'},

A vehicle from ${companyName || 'your fleet'} — ${vehiclePlate} — has been brought in to ${providerName || 'a service provider'}${shopName ? ` (${shopName}${shopTown ? `, ${shopTown}` : ''})` : ''} and a work order has been opened.

Work Order:     ${workOrderNumber}
Fleet Vehicle:  ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}
Opened:         ${fmtDateTime(createdAt)}${priorityLabel ? `
Priority:       ${priorityLabel}` : ''}
${problemDescription ? `\nReported issue: ${problemDescription}\n` : ''}
If a driver delivered this vehicle without prior notice, this is normal — you can track everything from your company dashboard. If this drop-off was not authorised, please contact the provider immediately.

Track service progress: ${workOrderUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: recipientName || 'Fleet Manager' }],
    subject:        `Fleet vehicle ${vehiclePlate} at the garage — ${workOrderNumber}`,
    html,
    text,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}