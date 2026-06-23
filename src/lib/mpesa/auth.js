// src/lib/mpesa/auth.js

import { MPESA_CONFIG } from './config'

let cachedToken = null
let tokenExpiry = 0

/**
 * Get OAuth access token from Safaricom Daraja API.
 * Token is cached in-memory for its lifetime (~3599s).
 * In serverless environments, cache is per-instance.
 */
export async function getOAuthToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const credentials = Buffer.from(
    `${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`
  ).toString('base64')

  const res = await fetch(
    `${MPESA_CONFIG.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      method: 'GET',
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(10000),
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`M-Pesa OAuth failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  // Expire 60s before actual expiry for safety
  tokenExpiry = Date.now() + ((data.expires_in || 3599) - 60) * 1000

  return cachedToken
}