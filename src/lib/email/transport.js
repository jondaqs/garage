/**
 * lib/email/transport.js
 * ──────────────────────
 * Thin Mailjet wrapper used by every outgoing email in the app.
 * Never call Mailjet directly from a page or API route — always go through here.
 *
 * All functions are server-only (they read process.env and call external APIs).
 * Import only in:  API routes, Server Actions, lib/email/*.js helpers.
 * Never import in: client components or pages.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

function getMailjetConfig() {
  const apiKey    = process.env.MAILJET_API_KEY
  const secretKey = process.env.MAILJET_SECRET_KEY

  if (!apiKey || !secretKey) {
    throw new Error(
      'Mailjet credentials missing. Set MAILJET_API_KEY and MAILJET_SECRET_KEY.'
    )
  }

  return {
    auth: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
    from: {
      Email: process.env.MAILJET_FROM_EMAIL || 'noreply@survlinx.com',
      Name:  process.env.MAILJET_FROM_NAME  || 'Motiifix',
    },
  }
}

// ─── Core send ────────────────────────────────────────────────────────────────

/**
 * sendEmail({ to, subject, html, text?, replyTo? })
 *
 * @param {Object} options
 * @param {Array<{Email:string, Name?:string}>} options.to
 * @param {string}  options.subject
 * @param {string}  options.html
 * @param {string?} options.text   - plain-text fallback
 * @param {string?} options.replyTo
 * @returns {Promise<{messageId: string}>}
 * @throws on network error or Mailjet non-2xx response
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
    console.log('sendEmail called with args:', { to, subject, replyTo }) // Debug log
  const { auth, from } = getMailjetConfig()

  const message = {
    From:     from,
    To:       to,
    Subject:  subject,
    HTMLPart: html,
  }
  if (text)    message.TextPart   = text
  if (replyTo) message.ReplyTo    = { Email: replyTo }

  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body:    JSON.stringify({ Messages: [message] }),
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}))
    console.error('sendEmail: Mailjet request failed:', { status: response.status, body: errBody })
    throw new Error(
      `Mailjet HTTP ${response.status}: ${JSON.stringify(errBody)}`
    )
  }

  const data      = await response.json()
  const messageId = data.Messages?.[0]?.To?.[0]?.MessageID ?? null
  return { messageId }
}

// ─── Queue helper (uses supabase client passed in to avoid circular imports) ──

/**
 * queueEmailRecord(supabase, { recipientEmail, subject, bodyHtml, bodyText, status, errorMessage })
 *
 * Records the email attempt in email_queue for admin visibility and retry.
 * Non-fatal — logs a warning on failure but never throws.
 */
export async function queueEmailRecord(supabase, {
  recipientEmail,
  subject,
  bodyHtml,
  bodyText,
  status = 'pending',
  errorMessage,
  referenceTable,
  referenceId,
}) {
  try {
    const { data, error } = await supabase
      .from('email_queue')
      .insert({
        recipient_email: recipientEmail,
        subject,
        body_html:       bodyHtml,
        body_text:       bodyText,
        status,
        error_message:   errorMessage || null,
        reference_table: referenceTable || null,
        reference_id:    referenceId   || null,
      })
      .select('id')
      .single()

    if (error) {
      console.warn('⚠️  email_queue insert failed (non-fatal):', error.message)
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.warn('⚠️  email_queue insert threw (non-fatal):', err.message)
    return null
  }
}

/**
 * markEmailQueued(supabase, queueId, { status, sentAt, errorMessage, messageId })
 * Updates a queued email record after send attempt.
 */
export async function markEmailQueued(supabase, queueId, { status, sentAt, errorMessage, messageId }) {
  if (!queueId) return
  try {
    await supabase
      .from('email_queue')
      .update({
        status,
        sent_at:       sentAt       || null,
        error_message: errorMessage || null,
        provider_message_id: messageId || null,
      })
      .eq('id', queueId)
  } catch (err) {
    console.warn('⚠️  email_queue update failed (non-fatal):', err.message)
  }
}

// ─── Convenience: send + queue in one call ────────────────────────────────────

/**
 * sendAndQueueEmail(supabase, { to, subject, html, text, referenceTable, referenceId })
 *
 * Queues the email first, attempts send, then updates queue record.
 * On Mailjet misconfiguration: queues as 'failed' and throws so callers can warn.
 * On successful send: marks queue record as 'sent'.
 */
export async function sendAndQueueEmail(supabase, {
  to,
  subject,
  html,
  text,
  replyTo,
  referenceTable,
  referenceId,
}) {
  const recipientEmail = Array.isArray(to) ? to[0].Email : to

  // Queue first (so there's always a record, even if send throws)
  let queueId = await queueEmailRecord(supabase, {
    recipientEmail,
    subject,
    bodyHtml: html,
    bodyText: text,
    status:   'pending',
    referenceTable,
    referenceId,
  })

  try {
    console.log('SendAndQueueEmail: Attempting to send email with args:', { to, subject, referenceTable, referenceId }) // Debug log
    const { messageId } = await sendEmail({ to: Array.isArray(to) ? to : [{ Email: to }], subject, html, text, replyTo })

    await markEmailQueued(supabase, queueId, {
      status:    'sent',
      sentAt:    new Date().toISOString(),
      messageId,
    })

    return { sent: true, messageId, queueId }
  } catch (err) {
    console.error('SendAndQueueEmail: Email send failed:', err.message)
    await markEmailQueued(supabase, queueId, {
      status:       'failed',
      errorMessage: err.message,
    })
    throw err   // re-throw so caller can decide whether to warn user
  }
}