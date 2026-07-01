/**
 * lib/validation.js
 * ─────────────────
 * Location: src/lib/validation.js
 *
 * Shared input validation helpers for API routes.
 * Import and call at the top of each handler BEFORE any DB queries.
 *
 * Usage:
 *   import { isUUID, requireUUID, requireUUIDs } from '@/lib/validation'
 *
 *   // Single ID from path param
 *   const id = requireUUID(rawId, 'work order ID')
 *   if (!id) return NextResponse.json({ error: 'Invalid work order ID' }, { status: 400 })
 *
 *   // Multiple IDs from request body
 *   const invalid = requireUUIDs({ vehicleId, providerId, customerUserId })
 *   if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Test whether a string is a valid UUID v1–v5.
 * @param {string} str
 * @returns {boolean}
 */
export function isUUID(str) {
  return typeof str === 'string' && UUID_RE.test(str)
}

/**
 * Validate a single UUID. Returns the trimmed UUID if valid, null if not.
 * @param {string} raw — the raw value from params or body
 * @param {string} [label] — human-readable label for error messages
 * @returns {string|null}
 */
export function requireUUID(raw, label = 'ID') {
  if (!raw) return null
  const trimmed = String(raw).trim()
  return isUUID(trimmed) ? trimmed : null
}

/**
 * Validate multiple UUIDs from a request body.
 * Returns null if all are valid, or an error string naming the first invalid field.
 *
 * Usage:
 *   const invalid = requireUUIDs({ vehicleId, providerId, customerUserId })
 *   if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
 *
 * @param {Record<string, string>} fields — { fieldName: value }
 * @returns {string|null} — error message or null if all valid
 */
export function requireUUIDs(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (value != null && !isUUID(String(value).trim())) {
      return `Invalid ${name}`
    }
  }
  return null
}

/**
 * Sanitise a plain-text string for safe interpolation into HTML.
 * Escapes &, <, >, ", ' to prevent XSS when building email templates.
 *
 * @param {string} str
 * @returns {string}
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
