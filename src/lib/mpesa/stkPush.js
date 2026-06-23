// src/lib/mpesa/stkPush.js

import { MPESA_CONFIG, formatTimestamp, generatePassword } from './config'
import { getOAuthToken } from './auth'

/**
 * Initiate an STK Push (Lipa Na M-Pesa Online) request.
 *
 * @param {Object} params
 * @param {string} params.phoneNumber — formatted 254XXXXXXXXX
 * @param {number} params.amount — amount in KES (whole number)
 * @param {string} params.accountReference — shown on user's phone (e.g. invoice ref)
 * @param {string} params.transactionDesc — description
 * @param {string} params.callbackUrl — full callback URL with HMAC sig
 * @returns {Object} { success, data?, error? }
 */
export async function initiateStkPush({
  phoneNumber,
  amount,
  accountReference,
  transactionDesc,
  callbackUrl,
}) {
  const token = await getOAuthToken()
  const timestamp = formatTimestamp()
  const password = generatePassword(timestamp)

  const payload = {
    BusinessShortCode: MPESA_CONFIG.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.ceil(Number(amount)), // M-Pesa requires whole numbers
    PartyA: phoneNumber,
    PartyB: MPESA_CONFIG.shortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: callbackUrl,
    AccountReference: accountReference.substring(0, 12), // max 12 chars
    TransactionDesc: (transactionDesc || 'Payment').substring(0, 13), // max 13 chars
  }

  const res = await fetch(
    `${MPESA_CONFIG.baseUrl}/mpesa/stkpush/v1/processrequest`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    }
  )

  const data = await res.json()

  if (data.ResponseCode === '0') {
    return {
      success: true,
      data: {
        merchantRequestId: data.MerchantRequestID,
        checkoutRequestId: data.CheckoutRequestID,
        responseDescription: data.ResponseDescription,
        customerMessage: data.CustomerMessage,
      },
    }
  }

  return {
    success: false,
    error: data.errorMessage || data.ResponseDescription || 'STK push failed',
    data,
  }
}