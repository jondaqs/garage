// src/lib/mpesa/statusQuery.js

import { MPESA_CONFIG, formatTimestamp, generatePassword } from './config'
import { getOAuthToken } from './auth'

/**
 * Query STK Push transaction status from Safaricom.
 * Used for double-verification after callback.
 *
 * @param {string} checkoutRequestId — from the STK push response
 * @returns {Object} { success, resultCode, resultDesc, receiptNumber? }
 */
export async function queryStkStatus(checkoutRequestId) {
  const token = await getOAuthToken()
  const timestamp = formatTimestamp()
  const password = generatePassword(timestamp)

  const res = await fetch(
    `${MPESA_CONFIG.baseUrl}/mpesa/stkpushquery/v1/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: MPESA_CONFIG.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
      signal: AbortSignal.timeout(15000),
    }
  )

  const data = await res.json()

  return {
    success: data.ResultCode === '0' || data.ResultCode === 0,
    resultCode: Number(data.ResultCode),
    resultDesc: data.ResultDesc,
    raw: data,
  }
}

/**
 * Query general transaction status (works for both STK and C2B).
 * Uses the Transaction Status API — requires initiator credentials.
 *
 * @param {string} transactionId — M-Pesa receipt number (e.g. QKJ71H859T)
 * @returns {Object} { success, data?, error? }
 */
export async function queryTransactionStatus(transactionId) {
  if (!MPESA_CONFIG.initiatorName || !MPESA_CONFIG.securityCredential) {
    // Initiator not configured — fall back to STK query
    return { success: false, error: 'Initiator credentials not configured' }
  }

  const token = await getOAuthToken()

  const res = await fetch(
    `${MPESA_CONFIG.baseUrl}/mpesa/transactionstatus/v1/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Initiator: MPESA_CONFIG.initiatorName,
        SecurityCredential: MPESA_CONFIG.securityCredential,
        CommandID: 'TransactionStatusQuery',
        TransactionID: transactionId,
        PartyA: MPESA_CONFIG.shortcode,
        IdentifierType: '4', // Shortcode
        ResultURL: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payments/mpesa/callback?type=status_query`,
        QueueTimeOutURL: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payments/mpesa/callback?type=status_timeout`,
        Remarks: 'Payment verification',
        Occasion: 'Subscription payment',
      }),
      signal: AbortSignal.timeout(15000),
    }
  )

  const data = await res.json()

  return {
    success: data.ResponseCode === '0',
    data,
    error: data.errorMessage || null,
  }
}