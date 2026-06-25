// src/lib/paystack/client.js

import crypto from 'crypto'
import { PAYSTACK_CONFIG } from './config'

const headers = () => ({
  Authorization: `Bearer ${PAYSTACK_CONFIG.secretKey}`,
  'Content-Type': 'application/json',
})

/**
 * Initialize a Paystack transaction.
 * @param {object} opts
 * @param {string} opts.email       - Customer email
 * @param {number} opts.amountKobo  - Amount in kobo/cents (KES 100 = 10000)
 * @param {string} opts.currency    - Currency code (default: KES)
 * @param {string} opts.reference   - Unique transaction reference
 * @param {string} opts.callbackUrl - URL Paystack redirects to after payment
 * @param {object} opts.metadata    - Custom metadata (invoice_id, user_id, etc.)
 * @param {string[]} opts.channels  - Payment channels: ['card', 'mobile_money', 'apple_pay']
 * @returns {{ success, data, error }}
 */
export async function initializeTransaction({
  email,
  amountKobo,
  currency = PAYSTACK_CONFIG.currency,
  reference,
  callbackUrl,
  metadata = {},
  channels = ['card', 'apple_pay'],
}) {
  try {
    const res = await fetch(`${PAYSTACK_CONFIG.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        email,
        amount: amountKobo,
        currency,
        reference,
        callback_url: callbackUrl,
        metadata,
        channels,
      }),
    })
    const data = await res.json()
    if (!data.status) {
      return { success: false, error: data.message || 'Paystack initialization failed' }
    }
    return {
      success: true,
      data: {
        authorizationUrl: data.data.authorization_url,
        accessCode: data.data.access_code,
        reference: data.data.reference,
      },
    }
  } catch (err) {
    console.error('[paystack] Initialize error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Verify a Paystack transaction by reference.
 * @param {string} reference - Transaction reference
 * @returns {{ success, data, error }}
 */
export async function verifyTransaction(reference) {
  try {
    const res = await fetch(
      `${PAYSTACK_CONFIG.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      { method: 'GET', headers: headers() }
    )
    const data = await res.json()
    if (!data.status || data.data.status !== 'success') {
      return {
        success: false,
        error: data.message || data.data?.gateway_response || 'Payment not successful',
        status: data.data?.status,
        gatewayResponse: data.data?.gateway_response,
      }
    }
    const tx = data.data
    return {
      success: true,
      data: {
        reference: tx.reference,
        amount: tx.amount,           // in kobo
        amountValue: tx.amount / 100, // in KES
        currency: tx.currency,
        paidAt: tx.paid_at,
        channel: tx.channel,          // 'card', 'mobile_money', etc.
        gatewayResponse: tx.gateway_response,
        cardType: tx.authorization?.card_type,
        cardLast4: tx.authorization?.last4,
        bank: tx.authorization?.bank,
        metadata: tx.metadata,
      },
    }
  } catch (err) {
    console.error('[paystack] Verify error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Verify Paystack webhook signature.
 * @param {string} body     - Raw request body
 * @param {string} signature - x-paystack-signature header
 * @returns {boolean}
 */
export function verifyWebhookSignature(body, signature) {
  if (!signature || !PAYSTACK_CONFIG.secretKey) return false
  const hash = crypto
    .createHmac('sha512', PAYSTACK_CONFIG.secretKey)
    .update(body)
    .digest('hex')
  return hash === signature
}