/**
 * lib/sms/reminderSms.js
 * ──────────────────────
 * SMS notifications for maintenance/service reminders.
 *
 *  sendMaintenanceReminderSms — to the vehicle owner when a reminder fires
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms, normalisePhone } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND   = 'Carfix-Connect'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }) : ''

// ─── Maintenance reminder SMS ────────────────────────────────────────────────

export async function sendMaintenanceReminderSms(supabase, {
  phone,
  ownerName,
  vehiclePlate,
  reminderTitle,
  recommendedDate,
  recommendedMileage,
  vehicleId,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const name = ownerName ? `${ownerName}, ` : ''
  const plate = vehiclePlate || 'your vehicle'

  let due = ''
  if (recommendedDate)         due = ` due ${fmtDate(recommendedDate)}`
  else if (recommendedMileage) due = ` due at ${Number(recommendedMileage).toLocaleString()} km`

  const url = vehicleId
    ? `${APP_URL()}/dashboard/bookings/book?vehicle=${vehicleId}`
    : `${APP_URL()}/dashboard/reminders`

  const message = `${BRAND}: ${name}${reminderTitle || 'service reminder'} for ${plate}${due}. Book now: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'reminders',
  })
}