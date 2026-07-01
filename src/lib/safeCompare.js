/**
 * lib/safeCompare.js
 * ──────────────────
 * Location: src/lib/safeCompare.js
 *
 * Timing-safe string comparison for secret headers (cron secrets,
 * reminder scan secrets, webhook signatures).
 *
 * Regular `===` leaks information through timing: the comparison
 * short-circuits at the first mismatched character, so an attacker
 * can guess a secret one character at a time by measuring response
 * latency. crypto.timingSafeEqual always takes the same time
 * regardless of where the mismatch occurs.
 *
 * Usage:
 *   import { safeCompare } from '@/lib/safeCompare'
 *
 *   const isValid = safeCompare(
 *     request.headers.get('x-reminder-secret'),
 *     process.env.REMINDER_SCAN_SECRET
 *   )
 */

import { timingSafeEqual, createHmac } from 'crypto'

/**
 * Compare two strings in constant time.
 *
 * Hashes both values before comparing so that even length differences
 * don't leak timing information.
 *
 * @param {string|null|undefined} supplied — the value from the request
 * @param {string|null|undefined} expected — the value from the environment
 * @returns {boolean}
 */
export function safeCompare(supplied, expected) {
  if (!supplied || !expected) return false

  // HMAC both values to fixed-length digests — prevents length-based timing leaks
  const key = 'timing-safe-compare'
  const a = createHmac('sha256', key).update(String(supplied)).digest()
  const b = createHmac('sha256', key).update(String(expected)).digest()

  return timingSafeEqual(a, b)
}
