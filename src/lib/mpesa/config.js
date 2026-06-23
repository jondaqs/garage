// src/lib/mpesa/config.js

const isSandbox = process.env.MPESA_ENV !== 'production'

export const MPESA_CONFIG = {
  consumerKey:        process.env.MPESA_CONSUMER_KEY,
  consumerSecret:     process.env.MPESA_CONSUMER_SECRET,
  shortcode:          process.env.MPESA_SHORTCODE || '174379',
  passkey:            process.env.MPESA_PASSKEY,
  callbackSecret:     process.env.MPESA_CALLBACK_SECRET,
  initiatorName:      process.env.MPESA_INITIATOR_NAME,
  securityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
  isSandbox,
  baseUrl: isSandbox
    ? 'https://sandbox.safaricom.co.ke'
    : 'https://api.safaricom.co.ke',
}

// Format phone: 0712345678 → 254712345678
export function formatPhone(phone) {
  let p = String(phone).replace(/\s+/g, '').replace(/^[+]+/, '')
  if (p.startsWith('0'))   p = '254' + p.slice(1)
  if (p.startsWith('7'))   p = '254' + p
  if (p.startsWith('+'))   p = p.slice(1)
  if (!/^254\d{9}$/.test(p)) return null
  return p
}

// Generate timestamp: YYYYMMDDHHmmss
export function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const d = date
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// Generate STK push password
export function generatePassword(timestamp) {
  return Buffer.from(
    `${MPESA_CONFIG.shortcode}${MPESA_CONFIG.passkey}${timestamp}`
  ).toString('base64')
}