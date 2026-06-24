// src/lib/mpesa/security.js

import crypto from 'crypto'
import { MPESA_CONFIG } from './config'

// Known Safaricom callback IP addresses (production)
const SAFARICOM_IPS = new Set([
  '196.201.214.200', '196.201.214.206',
  '196.201.213.114', '196.201.214.207',
  '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.138',
  '196.201.212.129', '196.201.212.74',
  '196.201.212.136', '196.201.212.69',
])

// Known CDN/proxy IPs that might forward Safaricom callbacks
// (Vercel, Cloudflare, etc. — these replace the original source IP)
const KNOWN_PROXY_PATTERNS = [
  /^76\.76\.21\./, /^64\.71\./, // Vercel edge
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Docker/internal
  /^10\./, // Internal
  /^127\./, // Localhost
]

/**
 * Extract client IP from request headers.
 * Checks multiple headers for proxy environments.
 */
export function getClientIp(request) {
  // x-forwarded-for can have multiple IPs: client, proxy1, proxy2
  // The LAST entry before the edge is most reliable on Vercel
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const ips = xff.split(',').map(ip => ip.trim())
    // Return the first (original client) IP
    return ips[0] || '0.0.0.0'
  }
  return (
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

/**
 * Extract ALL IPs from the forwarding chain (for logging).
 */
function getAllForwardedIps(request) {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',').map(ip => ip.trim())
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return [realIp]
  return []
}

/**
 * Check if an IP looks like a known CDN/proxy IP.
 */
function isKnownProxyIp(ip) {
  return KNOWN_PROXY_PATTERNS.some(pattern => pattern.test(ip))
}

/**
 * Verify the callback comes from a valid Safaricom IP.
 *
 * On platforms like Vercel, the original Safaricom IP may be replaced
 * by the edge proxy IP. When this happens and the request has a valid
 * HMAC signature, we still process it (HMAC is the stronger security check).
 *
 * Returns: { valid: boolean, reason: string, clientIp: string }
 */
export function validateSafaricomSource(request) {
  const clientIp = getClientIp(request)
  const allIps = getAllForwardedIps(request)

  // Sandbox mode: always allow
  if (MPESA_CONFIG.isSandbox) {
    return { valid: true, reason: 'sandbox_mode', clientIp }
  }

  // Check if any IP in the chain is a Safaricom IP
  const hasSafaricomIp = allIps.some(ip => SAFARICOM_IPS.has(ip)) || SAFARICOM_IPS.has(clientIp)
  if (hasSafaricomIp) {
    return { valid: true, reason: 'safaricom_ip_match', clientIp }
  }

  // Check if client IP is a known proxy (Vercel, Cloudflare, etc.)
  // In this case, the original Safaricom IP was stripped — rely on HMAC instead
  if (isKnownProxyIp(clientIp)) {
    return { valid: true, reason: 'proxy_ip_hmac_fallback', clientIp }
  }

  // Unknown IP — still log it but reject
  return { valid: false, reason: `unknown_ip: ${clientIp}, chain: ${allIps.join(' → ')}`, clientIp }
}

/**
 * Legacy wrapper — kept for backward compat but callback route uses validateSafaricomSource now.
 */
export function isValidSafaricomIP(request) {
  return validateSafaricomSource(request).valid
}

/**
 * Generate HMAC signature for callback URL.
 * @param {string} idempotencyKey — unique key for this transaction
 * @returns {string} hex-encoded HMAC
 */
export function generateCallbackHmac(idempotencyKey) {
  return crypto
    .createHmac('sha256', MPESA_CONFIG.callbackSecret)
    .update(idempotencyKey)
    .digest('hex')
}

/**
 * Verify HMAC signature from callback URL params.
 * Uses timing-safe comparison to prevent side-channel attacks.
 * @param {string} receivedSig — signature from URL ?sig=
 * @param {string} idempotencyKey — key from URL ?key=
 * @returns {boolean}
 */
export function verifyCallbackHmac(receivedSig, idempotencyKey) {
  if (!receivedSig || !idempotencyKey || !MPESA_CONFIG.callbackSecret) return false

  const expected = generateCallbackHmac(idempotencyKey)

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSig, 'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * Extract selected headers for forensic logging.
 */
export function extractForensicHeaders(request) {
  const keep = ['user-agent', 'x-forwarded-for', 'x-real-ip', 'content-type', 'host']
  const headers = {}
  for (const key of keep) {
    const val = request.headers.get(key)
    if (val) headers[key] = val
  }
  return headers
}