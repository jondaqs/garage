/**
 * lib/email/reminderEmails.js
 * ───────────────────────────
 * Email notifications for maintenance/service reminders.
 *
 *  sendMaintenanceReminderEmail — to the vehicle owner when a reminder fires
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'
import { escapeHtml } from '@/lib/validation'
const h = (v) => escapeHtml(v ?? '')

const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND_NAME = 'Carfix-Connect'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : '—'

// ─── Maintenance reminder email ──────────────────────────────────────────────

export async function sendMaintenanceReminderEmail(supabase, {
  to,
  ownerName,
  vehiclePlate,
  vehicleMake,
  vehicleModel,
  reminderTitle,
  reminderMessage,
  recommendedDate,
  recommendedMileage,
  serviceName,
  providerName,
  vehicleId,
}) {
  if (!to) return { sent: false, skipped: true, reason: 'no email' }

  const url     = `${APP_URL()}/dashboard/reminders`
  const bookUrl = vehicleId
    ? `${APP_URL()}/dashboard/bookings/book?vehicle=${vehicleId}`
    : `${APP_URL()}/dashboard/bookings`

  const vehicle = [vehiclePlate, vehicleMake, vehicleModel].filter(Boolean).join(' · ')

  const dueLine = []
  if (recommendedDate)    dueLine.push(`<strong>Due date:</strong> ${h(fmtDate(recommendedDate))}`)
  if (recommendedMileage) dueLine.push(`<strong>Due mileage:</strong> ${Number(recommendedMileage).toLocaleString()} km`)

  const subject = `🔧 ${reminderTitle || 'Service Reminder'} — ${vehiclePlate || 'Your Vehicle'}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #16a34a; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 18px; color: #fff;">${h(BRAND_NAME)}</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 16px; font-size: 15px;">
          Hi ${h(ownerName || 'there')},
        </p>
        <p style="margin: 0 0 16px; font-size: 15px;">
          ${h(reminderMessage || 'Your vehicle is due for maintenance soon.')}
        </p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          ${vehicle ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Vehicle:</strong> ${h(vehicle)}</p>` : ''}
          ${serviceName ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Service:</strong> ${h(serviceName)}</p>` : ''}
          ${providerName ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Recommended by:</strong> ${h(providerName)}</p>` : ''}
          ${dueLine.length > 0 ? dueLine.map(l => `<p style="margin: 0 0 8px; font-size: 14px;">${l}</p>`).join('') : ''}
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${bookUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Book Service Now
          </a>
        </div>

        <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280;">
          <a href="${url}" style="color: #16a34a;">View all reminders</a> ·
          You can dismiss this reminder from your dashboard.
        </p>
      </div>
    </div>
  `

  return sendAndQueueEmail(supabase, {
    to:  [{ Email: to, Name: ownerName || undefined }],
    subject,
    html,
    referenceTable: 'reminders',
  })
}