/**
 * In-memory sliding-window rate limiter.
 *
 * Usage in a Next.js API route:
 *
 *   import { rateLimit } from '@/lib/rateLimiter'
 *
 *   const limiter = rateLimit({ windowMs: 60_000, max: 5 })
 *
 *   export async function POST(request) {
 *     const limited = limiter.check(request)
 *     if (limited) return limited          // ← NextResponse 429
 *     // … handle request
 *   }
 *
 * Usage in middleware (for page-level limiting):
 *
 *   import { rateLimit } from '@/lib/rateLimiter'
 *
 *   const authLimiter = rateLimit({ windowMs: 60_000, max: 20 })
 *
 *   // inside middleware handler:
 *   const limited = authLimiter.check(request)
 *   if (limited) return limited
 *
 * Notes:
 *  - This is per-process. In a multi-instance/serverless environment
 *    it won't share state across instances. For distributed limiting,
 *    swap the Map for Upstash Redis or similar.
 *  - The store auto-prunes stale entries every 60 s to prevent leaks.
 */

import { NextResponse } from 'next/server'

/**
 * @param {Object}  opts
 * @param {number}  opts.windowMs   — sliding window in milliseconds (default 60 000)
 * @param {number}  opts.max        — max requests per window (default 10)
 * @param {string}  [opts.message]  — custom error message
 */
export function rateLimit({ windowMs = 60_000, max = 10, message } = {}) {
  /** @type {Map<string, number[]>} */
  const store = new Map()

  // Prune stale entries every 60 s
  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter(t => t > cutoff)
      if (valid.length === 0) store.delete(key)
      else store.set(key, valid)
    }
  }, 60_000)

  // Allow GC if the process unloads (Edge/serverless)
  if (typeof pruneInterval?.unref === 'function') {
    pruneInterval.unref()
  }

  return {
    /**
     * Check whether the request exceeds the rate limit.
     * @param {Request} request
     * @returns {NextResponse|null}  429 response if limited, null if OK
     */
    check(request) {
      const ip = getClientIp(request)
      const now = Date.now()
      const cutoff = now - windowMs

      let timestamps = store.get(ip) || []
      timestamps = timestamps.filter(t => t > cutoff)
      timestamps.push(now)
      store.set(ip, timestamps)

      if (timestamps.length > max) {
        const retryAfter = Math.ceil(windowMs / 1000)
        return NextResponse.json(
          {
            error: message || 'Too many requests. Please try again later.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfter),
              'X-RateLimit-Limit': String(max),
              'X-RateLimit-Remaining': '0',
            },
          },
        )
      }

      return null // not limited
    },
  }
}

/**
 * Extract client IP from standard headers.
 */
function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    '127.0.0.1'
  )
}