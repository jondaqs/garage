/**
 * lib/sms/providerSms.js
 * ──────────────────────
 * Provider registration-related SMS notifications.
 *
 *  sendProviderRejectionSms — to the provider owner when their application is rejected
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms, normalisePhone } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND   = 'Carfix-Connect'

// ─── Provider rejection SMS ──────────────────────────────────────────────────

export async function sendProviderRejectionSms(supabase, {
  phone,
  ownerName,
  providerName,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const name = ownerName ? `${ownerName}, ` : ''
  const provider = providerName || 'your provider'

  const message = `${BRAND}: ${name}your application for ${provider} was not approved. Please check your email for details or log in to ${APP_URL()} for more info.`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'service_providers',
  })
}