// src/lib/mpesa/security.js

import crypto from 'crypto'
import { MPESA_CONFIG } from './config'

// Known Safaricom callback IP addresses (production)
const SAFARICOM_IPS = new Set([
  '196.201.214.200', '196.201.214.206',
  '196.201.213.114', '196.201.214.207',
  '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.128',
  '196.201.212.129', '196.201.212.132',
  '196.201.212.136', '196.201.212.138',
])

/**
 * Extract client IP from request headers.
 */
export function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

/**
 * Verify the callback comes from a valid Safaricom IP.
 * Relaxed in sandbox mode.
 */
export function isValidSafaricomIP(request) {
  const ip = getClientIp(request)
  if (!MPESA_CONFIG.isSandbox) {
    return SAFARICOM_IPS.has(ip)
  }
  return true
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