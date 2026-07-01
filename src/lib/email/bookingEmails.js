/**
 * lib/email/bookingEmails.js
 * ──────────────────────────
 * Email notifications related to bookings.
 *
 *  sendBookingConfirmationEmail  — to the customer/company booker
 *      • Customer-initiated → status is pending; copy reflects that
 *      • Provider-initiated (isProviderInitiated=true) → status is confirmed;
 *        copy is calm and final ("see you then"), no pending-language
 *  sendNewBookingProviderEmail   — to the service provider owner (new booking received)
 *  sendBookingReminderEmail      — to the customer 24h before the booking
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'
import { escapeHtml } from '@/lib/validation'
const h = (v) => escapeHtml(v ?? '')


const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND_NAME = 'Carfix-Connect'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : '—'

const fmtTime = (t) => {
  if (!t) return '—'
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

// ─── 1. Customer / booker confirmation ───────────────────────────────────────

export async function sendBookingConfirmationEmail(supabase, {
  to,
  customerName,
  bookingNumber,
  bookingId,
  bookingDate,
  bookingTime,
  providerName,
  shopName,
  shopTown,
  vehiclePlate,
  vehicleMake,
  vehicleModel,
  services = [],
  isCompany            = false,
  isProviderInitiated  = false,    // true when the provider booked the customer
}) {
  // ── HTML-escape user-supplied values ──
  customerName = h(customerName); providerName = h(providerName); shopName = h(shopName)
  shopTown = h(shopTown); vehiclePlate = h(vehiclePlate); vehicleMake = h(vehicleMake)
  vehicleModel = h(vehicleModel)
  services = services.map(s => h(s))
  const bookingUrl = `${APP_URL()}/${isCompany ? 'company' : 'dashboard'}/bookings/${bookingId}`
  const servicesList = services.length > 0
    ? services.map(s => `<li style="padding:3px 0;color:#374151;">${s}</li>`).join('')
    : '<li style="color:#6b7280;">To be confirmed with provider</li>'

  // ── Branched copy depending on who initiated the booking ──────────────
  const subject = isProviderInitiated
    ? `Booking Scheduled — ${bookingNumber} · ${providerName}`
    : `Booking Received — ${bookingNumber} · ${providerName}`

  const headerStrap = isProviderInitiated ? '✅ Booking Confirmed' : '📅 Booking Received'

  const intro = isProviderInitiated
    ? 'Your service provider has scheduled a booking for you. Here are the details:'
    : 'Your service booking has been placed successfully. Here are the details:'

  // Bottom note block — this is the bit the user flagged.
  const bottomNoteHtml = isProviderInitiated
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
        <p style="margin:0;color:#166534;font-size:13px;">
          ✅ Your appointment is <strong>confirmed</strong>. The provider is expecting you on
          ${fmtDate(bookingDate)} at ${fmtTime(bookingTime)}.
          If you need to reschedule or cancel, please open the booking and contact the provider as soon as possible.
        </p>
      </div>`
    : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
        <p style="margin:0;color:#1e40af;font-size:13px;">
          ⏳ Your booking is <strong>pending confirmation</strong> from the service provider.
          You'll receive another notification once they confirm.
        </p>
      </div>`

  const bottomNoteText = isProviderInitiated
    ? `Your appointment is confirmed. The provider is expecting you on ${fmtDate(bookingDate)} at ${fmtTime(bookingTime)}.\nIf you need to reschedule or cancel, please contact the provider as soon as possible.`
    : `Your booking is pending confirmation from the provider.`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND_NAME}</p>
      <p style="margin:0;font-size:14px;color:#bfdbfe;">${headerStrap}</p>
    </td>
  </tr>

  <!-- Body -->
  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 20px;">Hello ${customerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">${intro}</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%;">Booking No.</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${bookingNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Date</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${fmtDate(bookingDate)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Time</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${fmtTime(bookingTime)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Provider</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${providerName}</td>
        </tr>
        ${shopName ? `<tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Location</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${shopName}${shopTown ? `, ${shopTown}` : ''}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Vehicle</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}</td>
        </tr>
      </table>
    </div>

    <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">Requested services:</p>
    <ul style="margin:0 0 24px;padding-left:20px;">${servicesList}</ul>

    ${bottomNoteHtml}

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${bookingUrl}"
         style="display:inline-block;background:#2563eb;color:#fff;padding:13px 32px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        View Booking
      </a>
    </div>
  </td></tr>

  <tr>
    <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND_NAME}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `${BRAND_NAME} — ${isProviderInitiated ? 'Booking Confirmed' : 'Booking Received'}

Hello ${customerName},

${intro}

Booking: ${bookingNumber}
Date:    ${fmtDate(bookingDate)}
Time:    ${fmtTime(bookingTime)}
Provider: ${providerName}${shopTown ? `\nLocation: ${shopName || ''}, ${shopTown}` : ''}
Vehicle: ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}

${bottomNoteText}

View booking: ${bookingUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: customerName }],
    subject,
    html,
    text,
    referenceTable: 'bookings',
    referenceId:    bookingId,
  })
}

// ─── 2. Provider new booking alert ───────────────────────────────────────────

export async function sendNewBookingProviderEmail(supabase, {
  to,
  providerOwnerName,
  bookingNumber,
  bookingId,
  bookingDate,
  bookingTime,
  customerName,
  customerPhone,
  vehiclePlate,
  vehicleMake,
  vehicleModel,
  services = [],
  problemDescription,
}) {
  // ── HTML-escape user-supplied values ──
  providerOwnerName = h(providerOwnerName); customerName = h(customerName); customerPhone = h(customerPhone)
  vehiclePlate = h(vehiclePlate); vehicleMake = h(vehicleMake); vehicleModel = h(vehicleModel)
  problemDescription = h(problemDescription)
  services = services.map(s => h(s))
  const bookingUrl  = `${APP_URL()}/provider/bookings/${bookingId}`
  const servicesList = services.length > 0
    ? services.map(s => `<li style="padding:3px 0;color:#374151;">${s}</li>`).join('')
    : '<li style="color:#6b7280;">Not specified</li>'

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">

  <tr>
    <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND_NAME}</p>
      <p style="margin:0;font-size:14px;color:#bbf7d0;">📋 New Booking Request</p>
    </td>
  </tr>

  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 20px;">Hello ${providerOwnerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      You have a new booking request. Please review and confirm as soon as possible.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%;">Booking No.</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${bookingNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Date</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${fmtDate(bookingDate)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Time</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${fmtTime(bookingTime)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Customer</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${customerName}${customerPhone ? ` · ${customerPhone}` : ''}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Vehicle</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}</td>
        </tr>
      </table>
    </div>

    <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">Requested services:</p>
    <ul style="margin:0 0 ${problemDescription ? '16px' : '24px'};padding-left:20px;">${servicesList}</ul>

    ${problemDescription ? `
    <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">Problem description:</p>
    <p style="color:#374151;font-size:13px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:0 0 24px;">${problemDescription}</p>
    ` : ''}

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${bookingUrl}"
         style="display:inline-block;background:#16a34a;color:#fff;padding:13px 32px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Review &amp; Confirm Booking
      </a>
    </div>
  </td></tr>

  <tr>
    <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND_NAME}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `${BRAND_NAME} — New Booking Request

Hello ${providerOwnerName},

You have a new booking (${bookingNumber}).

Date: ${fmtDate(bookingDate)}
Time: ${fmtTime(bookingTime)}
Customer: ${customerName}${customerPhone ? ` · ${customerPhone}` : ''}
Vehicle: ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}
${services.length > 0 ? `Services: ${services.join(', ')}\n` : ''}${problemDescription ? `Issue: ${problemDescription}\n` : ''}
Review booking: ${bookingUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: providerOwnerName }],
    subject:        `New Booking Request — ${bookingNumber} · ${vehiclePlate}`,
    html,
    text,
    referenceTable: 'bookings',
    referenceId:    bookingId,
  })
}

// ─── 3. Customer 24-hour reminder ────────────────────────────────────────────

export async function sendBookingReminderEmail(supabase, {
  to,
  customerName,
  bookingNumber,
  bookingId,
  bookingDate,
  bookingTime,
  providerName,
  shopName,
  shopTown,
  vehiclePlate,
  vehicleMake,
  vehicleModel,
  services = [],
  isCompany     = false,
  isForProvider = false,
}) {
  // ── HTML-escape user-supplied values ──
  customerName = h(customerName); providerName = h(providerName); shopName = h(shopName)
  shopTown = h(shopTown); vehiclePlate = h(vehiclePlate); vehicleMake = h(vehicleMake)
  vehicleModel = h(vehicleModel)
  services = services.map(s => h(s))
  const route = isForProvider ? 'provider' : (isCompany ? 'company' : 'dashboard')
  const bookingUrl = `${APP_URL()}/${route}/bookings/${bookingId}`
  const servicesList = services.length > 0
    ? services.map(s => `<li style="padding:3px 0;color:#374151;">${s}</li>`).join('')
    : '<li style="color:#6b7280;">To be confirmed with provider</li>'

  const heading = isForProvider
    ? '⏰ Reminder — A Booking Tomorrow'
    : '⏰ Reminder — Your Booking Tomorrow'

  const intro = isForProvider
    ? `Hello ${customerName}, this is a friendly heads-up that you have a service booking scheduled for tomorrow.`
    : `Hello ${customerName}, this is a friendly reminder that your service booking is scheduled for tomorrow.`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">

  <tr>
    <td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND_NAME}</p>
      <p style="margin:0;font-size:14px;color:#fef3c7;">${heading}</p>
    </td>
  </tr>

  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:15px;margin:0 0 20px;">${intro}</p>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%;">Booking No.</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${bookingNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Date</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${fmtDate(bookingDate)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Time</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${fmtTime(bookingTime)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Provider</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${providerName}</td>
        </tr>
        ${shopName ? `<tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Location</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;">${shopName}${shopTown ? `, ${shopTown}` : ''}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">Vehicle</td>
          <td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}</td>
        </tr>
      </table>
    </div>

    <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 6px;">Services:</p>
    <ul style="margin:0 0 24px;padding-left:20px;">${servicesList}</ul>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#1e40af;font-size:13px;">
        Need to reschedule or cancel? Please open the booking and let the
        ${isForProvider ? 'customer' : 'provider'} know as soon as possible.
      </p>
    </div>

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${bookingUrl}"
         style="display:inline-block;background:#d97706;color:#fff;padding:13px 32px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        View Booking
      </a>
    </div>
  </td></tr>

  <tr>
    <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND_NAME}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `${BRAND_NAME} — ${heading.replace(/[⏰]/g, '').trim()}

${intro}

Booking: ${bookingNumber}
Date:    ${fmtDate(bookingDate)}
Time:    ${fmtTime(bookingTime)}
Provider: ${providerName}${shopTown ? `\nLocation: ${shopName || ''}, ${shopTown}` : ''}
Vehicle: ${vehiclePlate}${vehicleMake ? ` · ${vehicleMake} ${vehicleModel || ''}` : ''}

View booking: ${bookingUrl}
— ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to:             [{ Email: to, Name: customerName }],
    subject:        `Reminder — Booking ${bookingNumber} tomorrow at ${fmtTime(bookingTime)}`,
    html,
    text,
    referenceTable: 'bookings',
    referenceId:    bookingId,
  })
}