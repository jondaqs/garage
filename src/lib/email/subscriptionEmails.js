/**
 * lib/email/subscriptionEmails.js
 * ────────────────────────────────
 * Email notifications for subscription lifecycle events.
 *
 *  sendSubscriptionExpiryWarningEmail — 7-day and 1-day expiry warnings
 *  sendSubscriptionExpiredEmail       — post-expiry notification
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'
import { escapeHtml } from '@/lib/validation'
const h = (v) => escapeHtml(v ?? '')

const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND_NAME = 'Carfix-Connect'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : '—'

// ─── Subscription expiry warning email ────────────────────────────────────────

/**
 * Sends a warning email when a subscription is about to expire.
 *
 * @param {object} supabase     - service-role Supabase client
 * @param {object} opts
 * @param {string} opts.to              - recipient email
 * @param {string} opts.subscriberName  - display name
 * @param {string} opts.subscriberType  - 'individual' | 'company' | 'service_provider'
 * @param {string} opts.packageName     - subscription package name
 * @param {string} opts.expiryDate      - ISO date string
 * @param {number} opts.daysRemaining   - days until expiry (7 or 1)
 * @param {string} opts.subscriptionNumber
 * @param {string} opts.subscriptionId  - for reference tracking
 */
export async function sendSubscriptionExpiryWarningEmail(supabase, {
  to,
  subscriberName,
  subscriberType,
  packageName,
  expiryDate,
  daysRemaining,
  subscriptionNumber,
  subscriptionId,
}) {
  if (!to) return { sent: false, skipped: true, reason: 'no email' }

  const renewUrl = subscriberType === 'company'
    ? `${APP_URL()}/company/subscription`
    : subscriberType === 'service_provider'
      ? `${APP_URL()}/provider/subscription`
      : `${APP_URL()}/dashboard/subscription`

  const urgency = daysRemaining <= 1 ? 'tomorrow' : `in ${daysRemaining} days`
  const urgencyColor = daysRemaining <= 1 ? '#dc2626' : '#f59e0b'
  const urgencyBg = daysRemaining <= 1 ? '#fef2f2' : '#fffbeb'
  const urgencyBorder = daysRemaining <= 1 ? '#fecaca' : '#fde68a'

  const subject = daysRemaining <= 1
    ? `⚠️ Your ${packageName} subscription expires tomorrow`
    : `📅 Your ${packageName} subscription expires in ${daysRemaining} days`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #0d9488; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 18px; color: #fff;">${h(BRAND_NAME)}</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 16px; font-size: 15px;">
          Hi ${h(subscriberName || 'there')},
        </p>
        <p style="margin: 0 0 16px; font-size: 15px;">
          Your <strong>${h(packageName)}</strong> subscription is set to expire <strong>${urgency}</strong>.
        </p>

        <div style="background: ${urgencyBg}; border: 1px solid ${urgencyBorder}; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: ${urgencyColor}; font-weight: 600;">
            ${daysRemaining <= 1 ? '⚠️ Expires Tomorrow' : `📅 ${daysRemaining} Days Remaining`}
          </p>
          <p style="margin: 0 0 8px; font-size: 14px;"><strong>Plan:</strong> ${h(packageName)}</p>
          <p style="margin: 0 0 8px; font-size: 14px;"><strong>Expiry date:</strong> ${h(fmtDate(expiryDate))}</p>
          ${subscriptionNumber ? `<p style="margin: 0; font-size: 13px; color: #6b7280;">Ref: ${h(subscriptionNumber)}</p>` : ''}
        </div>

        <p style="margin: 0 0 20px; font-size: 14px; color: #374151;">
          ${daysRemaining <= 1
            ? 'To avoid any interruption in service, please renew your subscription today.'
            : 'Renew now to ensure uninterrupted access to all features.'}
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${renewUrl}" style="display: inline-block; background: #0d9488; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Renew Subscription
          </a>
        </div>

        <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280;">
          If you have already renewed or no longer need this subscription, you can ignore this email.
        </p>
      </div>
    </div>
  `

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: subscriberName || undefined }],
    subject,
    html,
    referenceTable: 'subscriptions',
    referenceId:    subscriptionId,
  })
}

// ─── Subscription expired email ──────────────────────────────────────────────

/**
 * Sends an email after a subscription has officially expired.
 */
export async function sendSubscriptionExpiredEmail(supabase, {
  to,
  subscriberName,
  subscriberType,
  packageName,
  expiryDate,
  subscriptionNumber,
  subscriptionId,
}) {
  if (!to) return { sent: false, skipped: true, reason: 'no email' }

  const renewUrl = subscriberType === 'company'
    ? `${APP_URL()}/company/subscription`
    : subscriberType === 'service_provider'
      ? `${APP_URL()}/provider/subscription`
      : `${APP_URL()}/dashboard/subscription`

  const subject = `Your ${packageName} subscription has expired`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #0d9488; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 18px; color: #fff;">${h(BRAND_NAME)}</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 16px; font-size: 15px;">
          Hi ${h(subscriberName || 'there')},
        </p>
        <p style="margin: 0 0 16px; font-size: 15px;">
          Your <strong>${h(packageName)}</strong> subscription expired on <strong>${h(fmtDate(expiryDate))}</strong>.
        </p>

        <div style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          <p style="margin: 0 0 8px; font-size: 14px;"><strong>Plan:</strong> ${h(packageName)}</p>
          <p style="margin: 0 0 8px; font-size: 14px;"><strong>Expired:</strong> ${h(fmtDate(expiryDate))}</p>
          ${subscriptionNumber ? `<p style="margin: 0; font-size: 13px; color: #6b7280;">Ref: ${h(subscriptionNumber)}</p>` : ''}
        </div>

        <p style="margin: 0 0 20px; font-size: 14px; color: #374151;">
          Some features may now be limited. Subscribe again to restore full access.
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${renewUrl}" style="display: inline-block; background: #0d9488; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Renew Now
          </a>
        </div>
      </div>
    </div>
  `

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: subscriberName || undefined }],
    subject,
    html,
    referenceTable: 'subscriptions',
    referenceId:    subscriptionId,
  })
}