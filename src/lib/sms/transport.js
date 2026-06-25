/**
 * lib/sms/transport.js
 * ────────────────────
 * Multi-provider SMS gateway — supports Africa's Talking and Celcom Africa.
 * Admin can switch providers via Settings → SMS Setup without redeployment.
 *
 * Provider configs are read from `platform_settings.sms_config` (preferred)
 * with fallback to env vars for backward compatibility.
 *
 * Env vars (fallback):
 *   AT_API_KEY / AT_USERNAME / AT_SENDER_ID / AT_SANDBOX     — Africa's Talking
 *   CELCOM_API_KEY / CELCOM_PARTNER_ID / CELCOM_SENDER_ID    — Celcom Africa
 *
 * Server-only — never import in client components.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'

// ─── Config cache ────────────────────────────────────────────────────────────

let _configCache = null
let _configFetchedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getInternalServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

/**
 * getSmsConfig()
 * Reads sms_config from platform_settings with a 5-minute in-memory cache.
 * Falls back to env vars if database config is unavailable.
 */
export async function getSmsConfig() {
  const now = Date.now()
  if (_configCache && (now - _configFetchedAt) < CACHE_TTL_MS) {
    return _configCache
  }

  try {
    const sc = getInternalServiceClient()
    if (sc) {
      const { data: row } = await sc
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'sms_config')
        .maybeSingle()

      if (row?.setting_value) {
        _configCache = row.setting_value
        _configFetchedAt = now
        return _configCache
      }
    }
  } catch (err) {
    console.warn('⚠️  SMS config read failed (falling back to env vars):', err.message)
  }

  // Fallback: build config from env vars
  const fallback = {
    active_provider: process.env.AT_API_KEY ? 'africastalking' : (process.env.CELCOM_API_KEY ? 'celcom' : 'none'),
    africastalking: {
      api_key:   process.env.AT_API_KEY   || '',
      username:  process.env.AT_USERNAME  || '',
      sender_id: process.env.AT_SENDER_ID || '',
      sandbox:   process.env.AT_SANDBOX === 'true',
    },
    celcom: {
      api_key:    process.env.CELCOM_API_KEY    || '',
      partner_id: process.env.CELCOM_PARTNER_ID || '',
      sender_id:  process.env.CELCOM_SENDER_ID  || '',
    },
  }
  _configCache = fallback
  _configFetchedAt = now
  return fallback
}

/** Force-clear cache (used after admin saves new config) */
export function clearSmsConfigCache() {
  _configCache = null
  _configFetchedAt = 0
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

async function sendViaAfricasTalking({ to, message, config }) {
  const { api_key, username, sender_id, sandbox } = config

  if (!api_key || !username) {
    throw new Error("Africa's Talking credentials missing (api_key / username)")
  }

  const baseUrl = sandbox
    ? 'https://api.sandbox.africastalking.com/version1'
    : 'https://api.africastalking.com/version1'

  const body = new URLSearchParams({
    username,
    to:      Array.isArray(to) ? to.join(',') : to,
    message: message.slice(0, 1600),
  })
  if (sender_id) body.set('from', sender_id)

  const response = await fetch(`${baseUrl}/messaging`, {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'apiKey':       api_key,
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Africa's Talking HTTP ${response.status}: ${errText}`)
  }

  const data = await response.json()
  const results = data?.SMSMessageData?.Recipients ?? []

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

async function sendViaCelcom({ to, message, config }) {
  const { api_key, partner_id, sender_id } = config

  if (!api_key || !partner_id) {
    throw new Error('Celcom Africa credentials missing (api_key / partner_id)')
  }

  // Celcom expects a single number per request (comma-separated for bulk)
  const recipients = Array.isArray(to) ? to.join(',') : to

  const payload = {
    apikey:    api_key,
    partnerID: partner_id,
    message:   message.slice(0, 1600),
    shortcode: sender_id || 'Motiifix',
    mobile:    recipients,
  }

  const response = await fetch('https://isms.celcomafrica.com/api/services/sendsms/', {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Celcom Africa HTTP ${response.status}: ${errText}`)
  }

  const data = await response.json()
  const responses = data?.responses || []

  // Celcom returns { "respose-code": 200, "response-description": "Success", "mobile": ..., "messageid": ... }
  // Note: AT has typo "respose-code" in their API
  return responses.map(r => ({
    number:    String(r.mobile || ''),
    status:    (r['response-description'] === 'Success' || r['respose-code'] === 200) ? 'Success' : (r['response-description'] || 'Failed'),
    messageId: String(r.messageid || ''),
    cost:      r.cost || '',
  }))
}

// ─── Core send (routes to active provider) ────────────────────────────────────

/**
 * sendSms({ to, message })
 *
 * @param {string|string[]} to      - E.164 phone number(s)
 * @param {string}          message - SMS body
 * @returns {Promise<Array<{number, status, messageId, cost}>>}
 */
export async function sendSms({ to, message }) {
  const smsConfig = await getSmsConfig()
  const provider = smsConfig.active_provider

  const recipients = (Array.isArray(to) ? to : [to])
    .map(normalisePhone)
    .filter(Boolean)

  if (recipients.length === 0) {
    throw new Error('No valid phone numbers to send SMS to')
  }

  if (provider === 'celcom') {
    return sendViaCelcom({ to: recipients, message, config: smsConfig.celcom || {} })
  }

  if (provider === 'africastalking') {
    return sendViaAfricasTalking({ to: recipients, message, config: smsConfig.africastalking || {} })
  }

  throw new Error(`SMS provider "${provider}" is not configured. Set up a provider in Admin → Settings → SMS Setup.`)
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
  let smsConfig
  try {
    smsConfig = await getSmsConfig()
  } catch {
    smsConfig = { active_provider: 'none' }
  }

  if (!smsConfig.active_provider || smsConfig.active_provider === 'none') {
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