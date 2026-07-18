/**
 * lib/sms/subscriptionSms.js
 * ───────────────────────────
 * SMS notifications for subscription lifecycle events.
 *
 *  sendSubscriptionExpiryWarningSms — 7-day and 1-day expiry warnings
 *  sendSubscriptionExpiredSms       — post-expiry notification
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms, normalisePhone } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND   = 'Carfix-Connect'

// ─── Subscription expiry warning SMS ─────────────────────────────────────────

export async function sendSubscriptionExpiryWarningSms(supabase, {
  phone,
  subscriberName,
  packageName,
  daysRemaining,
  subscriptionId,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const name = subscriberName ? `${subscriberName}, y` : 'Y'
  const urgency = daysRemaining <= 1 ? 'tomorrow' : `in ${daysRemaining} days`

  const message = `${BRAND}: ${name}our ${packageName} subscription expires ${urgency}. Renew now to avoid interruption: ${APP_URL()}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'subscriptions',
    referenceId:    subscriptionId,
  })
}

// ─── Subscription expired SMS ────────────────────────────────────────────────

export async function sendSubscriptionExpiredSms(supabase, {
  phone,
  subscriberName,
  packageName,
  subscriptionId,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const name = subscriberName ? `${subscriberName}, y` : 'Y'

  const message = `${BRAND}: ${name}our ${packageName} subscription has expired. Renew to restore full access: ${APP_URL()}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'subscriptions',
    referenceId:    subscriptionId,
  })
}