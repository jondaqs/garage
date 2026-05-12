/**
 * lib/sms/bookingSms.js
 * ─────────────────────
 * SMS notifications related to bookings.
 *
 *  sendBookingConfirmationSms  — to the customer/booker
 *  sendNewBookingProviderSms   — to the service provider owner
 *  sendBookingReminderSms      — to the customer 24h before the booking (Phase 3)
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms, normalisePhone } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND   = 'Motiifix'

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

// ─── 3. Customer 24-hour reminder SMS (Phase 3) ──────────────────────────────

/**
 * sendBookingReminderSms(supabase, {
 *   phone, customerName,
 *   bookingNumber, bookingId,
 *   bookingDate, bookingTime,
 *   providerName, vehiclePlate,
 *   isCompany, isForProvider,
 * })
 *
 * Kept under 160 chars where possible. Africa's Talking concatenates >160 char
 * messages automatically; we still aim to fit one segment for cost.
 */
export async function sendBookingReminderSms(supabase, {
  phone,
  customerName,
  bookingNumber,
  bookingId,
  bookingDate,
  bookingTime,
  providerName,
  vehiclePlate,
  isCompany     = false,
  isForProvider = false,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const route = isForProvider ? 'provider' : (isCompany ? 'company' : 'dashboard')
  const url   = `${APP_URL()}/${route}/bookings/${bookingId}`
  const name  = customerName ? `${customerName}, ` : ''
  const who   = isForProvider ? 'a booking is scheduled' : 'your booking'

  const message = `${BRAND}: Reminder — ${name}${who} (${bookingNumber}) ` +
    `${vehiclePlate ? `for ${vehiclePlate} ` : ''}at ${providerName} on ` +
    `${fmtDate(bookingDate)} ${fmtTime(bookingTime)}. View: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'bookings',
    referenceId:    bookingId,
  })
}