/**
 * lib/rateLimiters.js
 * ───────────────────
 * Location: src/lib/rateLimiters.js
 *
 * Pre-configured rate limiters for every API route tier.
 * Import the appropriate limiter and call .check(request) at the
 * top of each handler — returns a 429 NextResponse if exceeded, null if OK.
 *
 * Tiers (from tightest to most generous):
 *
 *   authLimiter   — auth/security actions (password change, registration)
 *   commsLimiter  — routes that trigger email/SMS (costs real money)
 *   writeLimiter  — data-mutating routes (create, update, delete)
 *   adminLimiter  — admin-only operations
 *   readLimiter   — read-only data fetches
 *
 * Usage:
 *   import { commsLimiter } from '@/lib/rateLimiters'
 *
 *   export async function POST(request) {
 *     const limited = commsLimiter.check(request)
 *     if (limited) return limited
 *     // ... handle request
 *   }
 *
 * Note: in-memory per-process. For distributed limiting across
 * Vercel serverless instances, swap the Map in rateLimiter.js
 * for Upstash Redis (@upstash/ratelimit).
 */

import { rateLimit } from './rateLimiter'

// ── Tier 1: Auth & security ──────────────────────────────────────────
// Password changes, registration, avatar uploads.
// Very tight: 5 requests per 15 minutes per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many attempts. Please try again later.',
})

// ── Tier 2: Comms-triggering ─────────────────────────────────────────
// Routes that fire email/SMS (Mailjet, Africa's Talking, Celcom).
// Each call costs money. 10 requests per minute per IP.
export const commsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many requests. Please slow down.',
})

// ── Tier 3: Write operations ─────────────────────────────────────────
// Creates, updates, deletes that don't trigger external comms.
// 20 requests per minute per IP.
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many requests. Please slow down.',
})

// ── Tier 4: Admin operations ─────────────────────────────────────────
// Admin-only routes. Admins are trusted but still limited.
// 30 requests per minute per IP.
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests.',
})

// ── Tier 5: Read operations ──────────────────────────────────────────
// GET-only data fetches. Most generous.
// 60 requests per minute per IP.
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests. Please slow down.',
})

// ── Tier 6: Payment initiation ───────────────────────────────────────
// STK push, Paystack initialize — tight to prevent abuse.
// 3 requests per minute per IP.
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: 'Too many payment attempts. Please wait before trying again.',
})
