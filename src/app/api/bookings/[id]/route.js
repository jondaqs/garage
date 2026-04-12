/**
 * PATCH /api/bookings/[id]
 * ─────────────────────────
 * Updates booking status (confirmed, cancelled, in_progress, etc.)
 * and fires email + SMS to the customer when the status is confirmed or cancelled.
 *
 * Called by the provider booking detail page instead of direct Supabase update.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Resolve email for a user_profiles.id — uses service client to bypass RLS */
async function resolveEmail(profileId) {
  try {
    const sc = getServiceClient()
    const { data } = await sc
      .from('user_profiles')
      .select('email, auth_user_id')
      .eq('id', profileId)
      .single()
    if (data?.email) return data.email
    if (data?.auth_user_id) {
      const { data: au } = await sc.auth.admin.getUserById(data.auth_user_id)
      return au?.user?.email || null
    }
    return null
  } catch { return null }
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) : '—'

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garicare.com'
const BRAND   = 'GariCare'

function buildEmail({ status, booking, customerName, bookingUrl }) {
  const isConfirmed = status === 'confirmed'
  const headerBg    = isConfirmed ? '#16a34a' : '#dc2626'
  const headerSub   = isConfirmed ? '✅ Booking Confirmed' : '❌ Booking Cancelled'
  const bodyIntro   = isConfirmed
    ? `Great news! Your booking has been <strong>confirmed</strong> by the service provider.`
    : `Your booking has been <strong>cancelled</strong>.`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">
  <tr>
    <td style="background:${headerBg};padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND}</p>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.8);">${headerSub}</p>
    </td>
  </tr>
  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 16px;">Hello ${customerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">${bodyIntro}</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:5px 0;color:#6b7280;font-size:13px;width:38%;">Booking No.</td>
          <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${booking.booking_number}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;color:#6b7280;font-size:13px;">Date</td>
          <td style="padding:5px 0;color:#111827;font-size:13px;">${fmtDate(booking.booking_date)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;color:#6b7280;font-size:13px;">Time</td>
          <td style="padding:5px 0;color:#111827;font-size:13px;">${fmtTime(booking.booking_time_start)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;color:#6b7280;font-size:13px;">Provider</td>
          <td style="padding:5px 0;color:#111827;font-size:13px;">${booking.service_provider?.name || '—'}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;color:#6b7280;font-size:13px;">Vehicle</td>
          <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${booking.vehicle?.plate_number}${booking.vehicle?.make ? ` · ${booking.vehicle.make} ${booking.vehicle.model || ''}` : ''}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:0 0 8px;">
      <a href="${bookingUrl}" style="display:inline-block;background:${headerBg};color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        View Booking
      </a>
    </div>
  </td></tr>
  <tr>
    <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND}</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `${BRAND} — Booking ${status === 'confirmed' ? 'Confirmed' : 'Cancelled'}

Hello ${customerName},

Your booking (${booking.booking_number}) at ${booking.service_provider?.name || '—'} on ${fmtDate(booking.booking_date)} ${fmtTime(booking.booking_time_start)} has been ${status === 'confirmed' ? 'confirmed' : 'cancelled'}.

Vehicle: ${booking.vehicle?.plate_number}

View booking: ${bookingUrl}
— ${BRAND}`

  return { html, text }
}

function buildSms({ status, booking, bookingUrl }) {
  const state = status === 'confirmed' ? 'confirmed' : 'cancelled'
  return `${BRAND}: Your booking (${booking.booking_number}) at ${booking.service_provider?.name || '—'} on ${new Date(booking.booking_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} has been ${state}. View: ${bookingUrl}`
}

export async function PATCH(request, { params }) {
  try {
    const supabase    = await createClient()
    const { id }      = await params
    const body        = await request.json()
    const { statusCode } = body

    if (!statusCode) {
      return NextResponse.json({ error: 'statusCode is required' }, { status: 400 })
    }

    // ── Auth — must be provider staff ─────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

    // ── Load booking with all needed data ─────────────────────────────────────
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select(`
        id, booking_number, booking_date, booking_time_start,
        customer_user_id, customer_email, customer_phone,
        vehicle:vehicles(plate_number, make, model),
        service_provider:service_providers(id, name),
        shop:shops(name, town)
      `)
      .eq('id', id)
      .single()

    if (fetchErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // ── Get new status id ─────────────────────────────────────────────────────
    const { data: newStatus } = await supabase
      .from('booking_statuses').select('id').eq('code', statusCode).single()

    if (!newStatus) {
      return NextResponse.json({ error: `Status "${statusCode}" not found` }, { status: 400 })
    }

    // ── Update booking ────────────────────────────────────────────────────────
    const patch = {
      status_id:  newStatus.id,
      updated_at: new Date().toISOString(),
    }
    if (statusCode === 'confirmed') {
      patch.confirmed_by_provider_at      = new Date().toISOString()
      patch.confirmed_by_provider_user_id = profile.id
    }
    if (statusCode.startsWith('cancelled')) {
      patch.cancelled_at         = new Date().toISOString()
      patch.cancelled_by_user_id = profile.id
    }

    const { error: upErr } = await supabase.from('bookings').update(patch).eq('id', id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    // ── In-app notification to customer ───────────────────────────────────────
    await supabase.from('notifications').insert({
      user_id:           booking.customer_user_id,
      recipient_user_id: booking.customer_user_id,
      notification_type: `booking_${statusCode}`,
      type:              `booking_${statusCode}`,
      title:             `Booking ${statusCode.replace(/_/g, ' ')}`,
      message:           `Your booking #${booking.booking_number} has been ${statusCode.replace(/_/g, ' ')}.`,
      reference_id:      id,
      reference_type:    'booking',
      reference_table:   'bookings',
      is_read:           false,
    }).then(({ error: ne }) => {
      if (ne) console.warn('Notification insert failed (non-fatal):', ne.message)
    })

    // ── Email + SMS only for confirmed and cancelled ──────────────────────────
    if (!['confirmed', 'cancelled'].includes(statusCode)) {
      return NextResponse.json({ success: true })
    }

    // Resolve customer contact details
    const custEmail = booking.customer_email || await resolveEmail(booking.customer_user_id)
    const custPhone = booking.customer_phone

    // Determine if customer is a company user (for URL routing)
    const sc = getServiceClient()
    const { data: companyMem } = await sc
      .from('company_users')
      .select('company_id')
      .eq('user_id', booking.customer_user_id)
      .eq('is_active', true)
      .maybeSingle()
    const isCompany = !!companyMem?.company_id

    const bookingUrl = `${APP_URL()}/${isCompany ? 'company' : 'dashboard'}/bookings/${id}`

    const { data: custProfile } = await sc
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('id', booking.customer_user_id)
      .maybeSingle()

    const customerName = custProfile
      ? `${custProfile.first_name || ''} ${custProfile.last_name || ''}`.trim() || 'Customer'
      : 'Customer'

    console.log(`[/api/bookings/${id}] status=${statusCode} custEmail=${custEmail||'none'} custPhone=${custPhone||'none'}`)

    const comms = []

    // Email
    if (custEmail) {
      const { html, text } = buildEmail({ status: statusCode, booking, customerName, bookingUrl })
      comms.push(
        // Use sendAndQueueEmail from transport
        import('@/lib/email/transport.js').then(({ sendAndQueueEmail }) =>
          sendAndQueueEmail(supabase, {
            to:      [{ Email: custEmail, Name: customerName }],
            subject: `Booking ${statusCode === 'confirmed' ? 'Confirmed' : 'Cancelled'} — ${booking.booking_number}`,
            html,
            text,
          })
        )
        .then(() => console.log(`[/api/bookings/${id}] ✓ email → ${custEmail}`))
        .catch(e  => console.error(`[/api/bookings/${id}] ✗ email:`, e.message))
      )
    }

    // SMS
    if (custPhone) {
      const message = buildSms({ status: statusCode, booking, bookingUrl })
      comms.push(
        import('@/lib/sms/transport.js').then(({ sendAndQueueSms, normalisePhone }) => {
          const phone = normalisePhone(custPhone)
          if (!phone) return
          return sendAndQueueSms(supabase, { to: phone, message })
        })
        .then(() => console.log(`[/api/bookings/${id}] ✓ SMS → ${custPhone}`))
        .catch(e  => console.error(`[/api/bookings/${id}] ✗ SMS:`, e.message))
      )
    }

    await Promise.allSettled(comms)
    console.log(`[/api/bookings/${id}] comms done (${comms.length} tasks)`)

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error(`PATCH /api/bookings/[id] error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}