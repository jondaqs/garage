/**
 * lib/sms/bookingSms.js
 * ─────────────────────
 * SMS notifications sent when a booking is created.
 *
 *  sendBookingConfirmationSms  — to the customer/booker
 *  sendNewBookingProviderSms   — to the service provider owner
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms, normalisePhone } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND   = 'Motiifix' // Brand name used in SMS messages

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }) : '—'

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr > 12 ? hr - 12 : hr || 12}:${m}${hr >= 12 ? 'pm' : 'am'}`
}

// ─── 1. Customer confirmation SMS ────────────────────────────────────────────

/**
 * sendBookingConfirmationSms(supabase, {
 *   phone, customerName,
 *   bookingNumber, bookingId,
 *   bookingDate, bookingTime,
 *   providerName,
 *   isCompany,
 * })
 */
export async function sendBookingConfirmationSms(supabase, {
  phone,
  customerName,
  bookingNumber,
  bookingId,
  bookingDate,
  bookingTime,
  providerName,
  isCompany = false,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const url     = `${APP_URL()}/${isCompany ? 'company' : 'dashboard'}/bookings/${bookingId}`
  const name    = customerName ? `${customerName}, ` : ''
  const message = `${BRAND}: ${name}your booking (${bookingNumber}) at ${providerName} on ${fmtDate(bookingDate)} ${fmtTime(bookingTime)} is pending confirmation. View: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'bookings',
    referenceId:    bookingId,
  })
}

// ─── 2. Provider new booking alert SMS ───────────────────────────────────────

/**
 * sendNewBookingProviderSms(supabase, {
 *   phone, providerOwnerName,
 *   bookingNumber, bookingId,
 *   bookingDate, bookingTime,
 *   vehiclePlate, customerName,
 * })
 */
export async function sendNewBookingProviderSms(supabase, {
  phone,
  providerOwnerName,
  bookingNumber,
  bookingId,
  bookingDate,
  bookingTime,
  vehiclePlate,
  customerName,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const url     = `${APP_URL()}/provider/bookings/${bookingId}`
  const name    = providerOwnerName ? `${providerOwnerName}, ` : ''
  const customer = customerName || 'A customer'
  const message = `${BRAND}: ${name}new booking (${bookingNumber}) from ${customer} for ${vehiclePlate} on ${fmtDate(bookingDate)} ${fmtTime(bookingTime)}. Confirm here: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'bookings',
    referenceId:    bookingId,
  })
}