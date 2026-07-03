/**
 * lib/email/settingsEmails.js
 * ───────────────────────────
 * Emails sent when a company or service provider submits updated details
 * that require admin re-verification.
 *
 * Two functions:
 *   sendDetailsChangedAdminEmail — amber alert to admin with changes summary
 *   sendDetailsPendingEmail      — green confirmation to the owner
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'
import { escapeHtml } from '@/lib/validation'
const h = (v) => escapeHtml(v ?? '')


const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND_NAME = 'Carfix-Connect'

// ─── 1. Admin alert — details changed, review required ───────────────────────

/**
 * sendDetailsChangedAdminEmail(supabase, {
 *   entityType,      — 'company' | 'provider'
 *   entityName,      — display name of the company / garage
 *   entityId,        — UUID (company_profiles.id or service_providers.id)
 *   ownerName,
 *   ownerEmail,
 *   changesSummary,  — string[] of human-readable changed fields (optional)
 * })
 */
export async function sendDetailsChangedAdminEmail(supabase, {
  entityType,
  entityName,
  entityId,
  ownerName,
  ownerEmail,
  changesSummary = [],
}) {
  // ── HTML-escape user-supplied values ──
  entityName = h(entityName); ownerName = h(ownerName); ownerEmail = h(ownerEmail)
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    console.warn('⚠️  ADMIN_EMAIL not set — skipping details-change admin email')
    return { sent: false, skipped: true }
  }

  const reviewUrl = `${APP_URL()}/admin/${
    entityType === 'company' ? 'companies' : 'providers'
  }/${entityId}`

  const typeLabel  = entityType === 'company' ? 'Company' : 'Service Provider'
  const changeRows = changesSummary.length > 0
    ? changesSummary.map(c => `<li>${c}</li>`).join('')
    : '<li>General profile details updated</li>'

  const bodyHtml = `
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      <strong>${entityName}</strong> (${typeLabel}) has updated their profile details
      and is now <strong style="color:#d97706;">pending re-verification</strong>.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e;">Changes submitted:</p>
      <ul style="margin:0;padding-left:18px;color:#78350f;font-size:14px;">${changeRows}</ul>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:6px 0;color:#6b7280;font-size:14px;width:40%;">${typeLabel}</td>
        <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:500;">${entityName}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6b7280;font-size:14px;">Owner</td>
        <td style="padding:6px 0;color:#111827;font-size:14px;">${ownerName} &lt;${ownerEmail}&gt;</td>
      </tr>
    </table>
    <p style="color:#374151;font-size:14px;margin:0;">
      Please review the submitted details in the admin panel and approve or request changes.
    </p>`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
  <tr>
    <td style="background:linear-gradient(135deg,#d97706,#b45309);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">${BRAND_NAME} Admin</p>
      <p style="margin:0;font-size:14px;color:#fef3c7;">⚠️ ${typeLabel} Details — Re-verification Required</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;">
      ${bodyHtml}
      <div style="text-align:center;margin:28px 0;">
        <a href="${reviewUrl}"
           style="display:inline-block;background:#d97706;color:#ffffff;padding:13px 32px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Review &amp; Approve in Admin Panel
        </a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        © ${new Date().getFullYear()} ${BRAND_NAME} · Admin Notification
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `${BRAND_NAME} Admin Alert

${typeLabel} "${entityName}" has updated their profile details and requires re-verification.

Owner: ${ownerName} <${ownerEmail}>
${changesSummary.length > 0 ? `Changes:\n${changesSummary.map(c => `  - ${c}`).join('\n')}\n` : ''}
Review here: ${reviewUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: adminEmail, Name: `${BRAND_NAME} Admin` }],
    subject:        `⚠️ ${typeLabel} Re-verification Required — ${entityName}`,
    html,
    text,
    referenceTable: entityType === 'company' ? 'company_profiles' : 'service_providers',
    referenceId:    entityId,
  })
}

// ─── 2. Owner confirmation — changes submitted, pending review ────────────────

/**
 * sendDetailsPendingEmail(supabase, {
 *   to,          — owner email address
 *   ownerName,
 *   entityName,  — company / garage name
 *   entityType,  — 'company' | 'provider'
 * })
 */
export async function sendDetailsPendingEmail(supabase, {
  to,
  ownerName,
  entityName,
  entityType,
}) {
  // ── HTML-escape user-supplied values ──
  ownerName = h(ownerName); entityName = h(entityName)
  const typeLabel = entityType === 'company' ? 'company' : 'business'
  const dashUrl   = entityType === 'company'
    ? `${APP_URL()}/company/dashboard`
    : `${APP_URL()}/provider/dashboard`

  const bodyHtml = `
    <p style="color:#374151;font-size:16px;margin:0 0 20px;">Hello ${ownerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 20px;">
      Thank you for updating your ${typeLabel} details. Your changes for
      <strong>${entityName}</strong> have been submitted and are now
      <strong style="color:#d97706;">pending re-verification</strong> by our team.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#92400e;">What happens next?</p>
      <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;">
        <li>Our team will review your updated details within 1–2 business days</li>
        <li>You will receive a notification and email once approved</li>
        <li>Existing bookings and services continue uninterrupted during review</li>
      </ul>
    </div>
    <p style="color:#374151;font-size:14px;margin:0;">
      If you have questions, please contact our support team.
    </p>`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
  <tr>
    <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">${BRAND_NAME}</p>
      <p style="margin:0;font-size:14px;color:#bbf7d0;">Details Submitted for Review</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;">
      ${bodyHtml}
      <div style="text-align:center;margin:28px 0;">
        <a href="${dashUrl}"
           style="display:inline-block;background:#16a34a;color:#ffffff;padding:13px 32px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Go to Dashboard
        </a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND_NAME}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `Hello ${ownerName},

Thank you for updating your ${typeLabel} details. "${entityName}" is now pending re-verification.

Our team will review your changes within 1–2 business days. Existing operations continue uninterrupted.

Go to dashboard: ${dashUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:      [{ Email: to, Name: ownerName }],
    subject: `Your ${typeLabel} details are under review — ${entityName}`,
    html,
    text,
  })
}