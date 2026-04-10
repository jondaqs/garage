/**
 * lib/sms/transport.js
 * ────────────────────
 * Africa's Talking SMS gateway wrapper.
 * Kenya's leading SMS API — reliable delivery, supports shortcodes.
 *
 * Env vars required:
 *   AT_API_KEY       — Africa's Talking API key
 *   AT_USERNAME      — Africa's Talking username (use 'sandbox' for testing)
 *   AT_SENDER_ID     — (optional) shortcode/sender name, e.g. 'GARICARE'
 *   AT_SANDBOX       — set to 'true' for sandbox mode (test without real sends)
 *
 * Server-only — never import in client components.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

function getATConfig() {
  const apiKey   = process.env.AT_API_KEY
  const username = process.env.AT_USERNAME
  const sandbox  = process.env.AT_SANDBOX === 'true'

  if (!apiKey || !username) {
    throw new Error(
      'Africa\'s Talking credentials missing. Set AT_API_KEY and AT_USERNAME.'
    )
  }

  const baseUrl = sandbox
    ? 'https://api.sandbox.africastalking.com/version1'
    : 'https://api.africastalking.com/version1'

  return {
    apiKey,
    username,
    senderId: process.env.AT_SENDER_ID || undefined,
    baseUrl,
    sandbox,
  }
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

// ─── Core send ────────────────────────────────────────────────────────────────

/**
 * sendSms({ to, message })
 *
 * @param {string|string[]} to      - E.164 phone number(s)
 * @param {string}          message - SMS body (≤160 chars for single, auto-splits)
 * @returns {Promise<Array<{number, status, messageId, cost}>>}
 * @throws on network error or AT non-2xx response
 */
export async function sendSms({ to, message }) {
  const cfg       = getATConfig()
  const recipients = (Array.isArray(to) ? to : [to])
    .map(normalisePhone)
    .filter(Boolean)

  if (recipients.length === 0) {
    throw new Error('No valid phone numbers to send SMS to')
  }

  const body = new URLSearchParams({
    username: cfg.username,
    to:       recipients.join(','),
    message:  message.slice(0, 1600),   // AT hard limit
  })
  if (cfg.senderId) body.set('from', cfg.senderId)

  const response = await fetch(`${cfg.baseUrl}/messaging`, {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'apiKey':       cfg.apiKey,
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
        recipient_name:  recipientName  || null,
        message,
        status,
        reference_table: referenceTable || null,
        reference_id:    referenceId    || null,
        error_message:   errorMessage   || null,
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
      sent_at:             sentAt       || null,
      error_message:       errorMessage || null,
      provider_message_id: messageId    || null,
      cost:                cost         || null,
    }).eq('id', queueId)
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
 * - Attempts send
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

  // Check if AT is configured — SMS is optional; skip gracefully if not
  if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
    console.warn('⚠️  SMS skipped — AT_API_KEY / AT_USERNAME not configured')
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