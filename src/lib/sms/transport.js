/**
 * lib/sms/transport.js
 * ────────────────────
 * Multi-provider SMS gateway — supports Africa's Talking and Celcom Africa.
 *
 * ALL credentials come from Vercel env vars — nothing from the database.
 * Only `active_provider` (which provider to use) is read from platform_settings
 * so the admin can switch providers without redeploying.
 *
 * Africa's Talking env vars:
 *   AT_API_KEY       — API key
 *   AT_USERNAME      — app username (use 'sandbox' for testing)
 *   AT_SENDER_ID     — (optional) shortcode/alphanumeric sender
 *   AT_SANDBOX       — set to 'true' for sandbox mode
 *
 * Celcom Africa env vars:
 *   CELCOM_API_KEY    — API key
 *   CELCOM_PARTNER_ID — partner ID
 *   CELCOM_SENDER_ID  — (optional) sender name
 *
 * Server-only — never import in client components.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'

// ─── Active provider cache ───────────────────────────────────────────────────
// Only the provider choice is cached from the database. All secrets come from env.

let _activeProvider = null
let _providerFetchedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getInternalServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

/**
 * getActiveProvider()
 * Reads which provider is active from platform_settings (cached 5 min).
 * Falls back to whichever env var is set.
 */
async function getActiveProvider() {
  const now = Date.now()
  if (_activeProvider && (now - _providerFetchedAt) < CACHE_TTL_MS) {
    return _activeProvider
  }

  try {
    const sc = getInternalServiceClient()
    if (sc) {
      const { data: row } = await sc
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'sms_config')
        .maybeSingle()

      if (row?.setting_value?.active_provider) {
        _activeProvider = row.setting_value.active_provider
        _providerFetchedAt = now
        return _activeProvider
      }
    }
  } catch (err) {
    console.warn('⚠️  SMS provider read failed (falling back to env):', err.message)
  }

  // Fallback: auto-detect from env vars
  _activeProvider = process.env.AT_API_KEY ? 'africastalking'
    : process.env.CELCOM_API_KEY ? 'celcom'
    : 'none'
  _providerFetchedAt = now
  return _activeProvider
}

/** Force-clear cache (called after admin saves new config) */
export function clearSmsConfigCache() {
  _activeProvider = null
  _providerFetchedAt = 0
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

/**
 * normalisePhone(phone)
 * Converts Kenyan phone numbers to E.164 (+2547XXXXXXXX).
 * Passes through numbers that are already E.164.
 * Returns null for blank/unrecognised inputs.
 */
export function normalisePhone(phone) {
  if (!phone) return null

  // Strip whitespace, dashes, parentheses
  const raw = String(phone).replace(/[\s\-().]/g, '')

  // Already E.164
  if (/^\+\d{10,15}$/.test(raw)) return raw

  // 07XXXXXXXX  →  +2547XXXXXXXX
  if (/^07\d{8}$/.test(raw)) return '+254' + raw.slice(1)

  // 01XXXXXXXX  →  +2541XXXXXXXX  (Airtel Kenya landlines)
  if (/^01\d{8}$/.test(raw)) return '+254' + raw.slice(1)

  // 2547XXXXXXXX  (country code without +)
  if (/^2547\d{8}$/.test(raw)) return '+' + raw
  if (/^2541\d{8}$/.test(raw)) return '+' + raw

  // International numbers without + (10+ digits)
  if (/^\d{11,15}$/.test(raw)) return '+' + raw

  console.warn(`⚠️  SMS: could not normalise phone "${phone}" — skipping`)
  return null
}

// ─── Provider: Africa's Talking ───────────────────────────────────────────────

async function sendViaAfricasTalking({ to, message }) {
  const apiKey   = process.env.AT_API_KEY
  const username = process.env.AT_USERNAME
  const senderId = process.env.AT_SENDER_ID || undefined
  const sandbox  = process.env.AT_SANDBOX === 'true'

  if (!apiKey || !username) {
    throw new Error(
      "Africa's Talking credentials missing. Set AT_API_KEY and AT_USERNAME in Vercel env vars."
    )
  }

  const baseUrl = sandbox
    ? 'https://api.sandbox.africastalking.com/version1'
    : 'https://api.africastalking.com/version1'

  const body = new URLSearchParams({
    username,
    to:      Array.isArray(to) ? to.join(',') : to,
    message: message.slice(0, 1600),
  })
  if (senderId) body.set('from', senderId)

  const response = await fetch(`${baseUrl}/messaging`, {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'apiKey':       apiKey,
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Africa's Talking HTTP ${response.status}: ${errText}`)
  }

  const data = await response.json()
  const results = data?.SMSMessageData?.Recipients ?? []

  // Log failures without throwing (partial success is valid)
  results.forEach(r => {
    if (r.status !== 'Success') {
      console.warn(`⚠️  SMS to ${r.number} failed: ${r.status}`)
    }
  })

  return results.map(r => ({
    number:    r.number,
    status:    r.status,
    messageId: r.messageId,
    cost:      r.cost,
  }))
}

// ─── Provider: Celcom Africa ──────────────────────────────────────────────────

async function sendViaCelcom({ to, message }) {
  const apiKey    = process.env.CELCOM_API_KEY
  const partnerId = process.env.CELCOM_PARTNER_ID
  const senderId  = process.env.CELCOM_SENDER_ID || 'Motiifix'

  if (!apiKey || !partnerId) {
    throw new Error(
      'Celcom Africa credentials missing. Set CELCOM_API_KEY and CELCOM_PARTNER_ID in Vercel env vars.'
    )
  }

  const recipients = Array.isArray(to) ? to.join(',') : to

  const response = await fetch('https://isms.celcomafrica.com/api/services/sendsms/', {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey:    apiKey,
      partnerID: partnerId,
      message:   message.slice(0, 1600),
      shortcode: senderId,
      mobile:    recipients,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Celcom Africa HTTP ${response.status}: ${errText}`)
  }

  const data = await response.json()
  const responses = data?.responses || []

  return responses.map(r => ({
    number:    String(r.mobile || ''),
    status:    (r['response-description'] === 'Success' || r['respose-code'] === 200)
      ? 'Success' : (r['response-description'] || 'Failed'),
    messageId: String(r.messageid || ''),
    cost:      r.cost || '',
  }))
}

// ─── Core send (routes to active provider) ────────────────────────────────────

/**
 * sendSms({ to, message })
 *
 * @param {string|string[]} to      - E.164 phone number(s)
 * @param {string}          message - SMS body (≤160 chars for single, auto-splits)
 * @returns {Promise<Array<{number, status, messageId, cost}>>}
 * @throws on network error or provider non-2xx response
 */
export async function sendSms({ to, message }) {
  const provider = await getActiveProvider()

  const recipients = (Array.isArray(to) ? to : [to])
    .map(normalisePhone)
    .filter(Boolean)

  if (recipients.length === 0) {
    throw new Error('No valid phone numbers to send SMS to')
  }

  if (provider === 'celcom') {
    return sendViaCelcom({ to: recipients, message })
  }

  if (provider === 'africastalking') {
    return sendViaAfricasTalking({ to: recipients, message })
  }

  throw new Error(
    `SMS provider "${provider}" is not configured. Set up a provider in Admin → Settings → SMS Setup.`
  )
}

// ─── Queue helpers ────────────────────────────────────────────────────────────

/**
 * queueSmsRecord(supabase, { recipientPhone, recipientName, message, referenceTable, referenceId })
 * Inserts a pending record into sms_queue. Non-fatal on failure.
 */
export async function queueSmsRecord(supabase, {
  recipientPhone,
  recipientName,
  message,
  referenceTable,
  referenceId,
  status = 'pending',
  errorMessage,
}) {
  try {
    const { data, error } = await supabase
      .from('sms_queue')
      .insert({
        recipient_phone: recipientPhone,
        // recipient_name, reference_table, reference_id not on this table
        message,
        status,
        error_message:   errorMessage || null,
      })
      .select('id')
      .single()

    if (error) {
      console.warn('⚠️  sms_queue insert failed (non-fatal):', error.message)
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.warn('⚠️  sms_queue insert threw (non-fatal):', err.message)
    return null
  }
}

export async function markSmsQueued(supabase, queueId, { status, sentAt, errorMessage, messageId, cost }) {
  if (!queueId) return
  try {
    await supabase.from('sms_queue').update({
      status,
      sent_at:       sentAt       || null,
      error_message: errorMessage || null,
      // provider_message_id, cost not on this table
    }).eq('id', queueId)
    if (messageId) console.log(`[sms_queue] messageId=${messageId}`)
  } catch (err) {
    console.warn('⚠️  sms_queue update failed (non-fatal):', err.message)
  }
}

// ─── Convenience: send + queue ────────────────────────────────────────────────

/**
 * sendAndQueueSms(supabase, { to, recipientName, message, referenceTable, referenceId })
 *
 * - Normalises phone
 * - Queues record first
 * - Attempts send (routes to active provider)
 * - Updates queue record with result
 * - On config missing: queues as 'skipped', does NOT throw (SMS is optional)
 * - On send failure: queues as 'failed', does NOT throw
 * Returns { sent: boolean, skipped: boolean }
 */
export async function sendAndQueueSms(supabase, {
  to,
  recipientName,
  message,
  referenceTable,
  referenceId,
}) {
  const phone = normalisePhone(to)

  if (!phone) {
    console.warn(`⚠️  SMS skipped — invalid phone: "${to}"`)
    return { sent: false, skipped: true }
  }

  // Check if any provider is configured
  let provider
  try {
    provider = await getActiveProvider()
  } catch {
    provider = 'none'
  }

  if (!provider || provider === 'none') {
    console.warn('⚠️  SMS skipped — no SMS provider configured')
    await queueSmsRecord(supabase, {
      recipientPhone: phone,
      recipientName,
      message,
      status:       'skipped',
      errorMessage: 'SMS provider not configured',
      referenceTable,
      referenceId,
    })
    return { sent: false, skipped: true }
  }

  const queueId = await queueSmsRecord(supabase, {
    recipientPhone: phone,
    recipientName,
    message,
    referenceTable,
    referenceId,
  })

  try {
    const results = await sendSms({ to: phone, message })
    const first   = results[0] || {}

    await markSmsQueued(supabase, queueId, {
      status:    first.status === 'Success' ? 'sent' : 'failed',
      sentAt:    first.status === 'Success' ? new Date().toISOString() : null,
      messageId: first.messageId,
      cost:      first.cost,
      errorMessage: first.status !== 'Success' ? first.status : null,
    })

    return { sent: first.status === 'Success', skipped: false }
  } catch (err) {
    console.error('❌ SMS send failed (non-fatal):', err.message)
    await markSmsQueued(supabase, queueId, {
      status:       'failed',
      errorMessage: err.message,
    })
    return { sent: false, skipped: false }
  }
}