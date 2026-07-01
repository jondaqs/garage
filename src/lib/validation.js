/**
 * lib/validation.js
 * ─────────────────
 * Location: src/lib/validation.js
 *
 * Shared input validation helpers for API routes.
 * Import and call at the top of each handler BEFORE any DB queries.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Test whether a string is a valid UUID v1–v5.
 */
export function isUUID(str) {
  return typeof str === 'string' && UUID_RE.test(str)
}

/**
 * Validate a single UUID. Returns the trimmed UUID if valid, null if not.
 */
export function requireUUID(raw, label = 'ID') {
  if (!raw) return null
  const trimmed = String(raw).trim()
  return isUUID(trimmed) ? trimmed : null
}

/**
 * Validate multiple UUIDs from a request body.
 * Returns null if all are valid, or an error string naming the first invalid field.
 */
export function requireUUIDs(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (value != null && !isUUID(String(value).trim())) {
      return `Invalid ${name}`
    }
  }
  return null
}

// ── Text validation ──────────────────────────────────────────────────

/**
 * Trim and limit a text string. Returns the sanitised string or '' if falsy.
 * Use on any user-supplied text before passing to the DB.
 *
 * @param {*} str     — raw value from request body
 * @param {number} max — max character length (default 2000)
 * @returns {string}
 */
export function sanitizeText(str, max = 2000) {
  if (str == null) return ''
  return String(str).trim().slice(0, max)
}

/**
 * Validate that a required text field is present and non-empty.
 * Returns the trimmed, length-limited string or null.
 *
 * @param {*} str
 * @param {number} max — max character length
 * @returns {string|null}
 */
export function requireText(str, max = 2000) {
  if (str == null) return null
  const trimmed = String(str).trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : null
}

// ── Email validation ─────────────────────────────────────────────────

/**
 * Basic email format check.
 * NOT exhaustive — just catches obvious non-emails before they hit the DB.
 */
export function isValidEmail(str) {
  return typeof str === 'string' && str.length <= 254 && EMAIL_RE.test(str.trim())
}

// ── Phone validation ─────────────────────────────────────────────────

/**
 * Check that a phone string is plausible (digits, optional +, 7–15 chars).
 * Actual normalisation happens in sms/transport.js — this is a gate check.
 */
export function isValidPhone(str) {
  if (typeof str !== 'string') return false
  const digits = str.replace(/[\s\-()]/g, '')
  return /^\+?\d{7,15}$/.test(digits)
}

// ── Number validation ────────────────────────────────────────────────

/**
 * Coerce to number and validate.
 * Returns the number if valid, null otherwise.
 *
 * @param {*} val         — raw value
 * @param {{ min?: number, max?: number, integer?: boolean }} opts
 * @returns {number|null}
 */
export function requireNumber(val, opts = {}) {
  if (val == null) return null
  const n = Number(val)
  if (!Number.isFinite(n)) return null
  if (opts.integer && !Number.isInteger(n)) return null
  if (opts.min != null && n < opts.min) return null
  if (opts.max != null && n > opts.max) return null
  return n
}

// ── Enum validation ──────────────────────────────────────────────────

/**
 * Check that a value is one of the allowed strings.
 *
 * @param {*} val
 * @param {string[]} allowed
 * @returns {boolean}
 */
export function isOneOf(val, allowed) {
  return typeof val === 'string' && allowed.includes(val)
}

// ── HTML escaping (for email templates — used in Phase 5) ────────────

/**
 * Escape a string for safe interpolation into HTML.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Safe JSON body parsing ───────────────────────────────────────────

/**
 * Parse request body with error handling.
 * Returns { data, error }. If parsing fails, `error` is a NextResponse 400.
 *
 * Usage:
 *   const { data: body, error: parseErr } = await safeJsonParse(request)
 *   if (parseErr) return parseErr
 *
 * @param {Request} request
 * @returns {Promise<{ data: any, error: NextResponse|null }>}
 */
export async function safeJsonParse(request) {
  try {
    const data = await request.json()
    return { data, error: null }
  } catch {
    const { NextResponse } = await import('next/server')
    return {
      data: null,
      error: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }),
    }
  }
}
