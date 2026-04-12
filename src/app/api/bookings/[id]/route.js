/**
 * PATCH /api/bookings/[id]
 * Updates booking status and fires email + SMS to customer on confirmed/cancelled.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Resolve email for a user_profiles.id via service client (bypasses RLS) */
async function resolveEmail(profileId) {
  try {
    const sc = getServiceClient()
    const { data, error } = await sc
      .from('user_profiles')
      .select('email, auth_user_id')
      .eq('id', profileId)
      .single()

    if (error) console.warn(`resolveEmail(${profileId}) query error:`, error.message)
    if (data?.email) return data.email

    if (data?.auth_user_id) {
      const { data: au, error: auErr } = await sc.auth.admin.getUserById(data.auth_user_id)
      if (auErr) console.warn(`resolveEmail getUserById error:`, auErr.message)
      return au?.user?.email || null
    }
    return null
  } catch (e) {
    console.warn('resolveEmail threw:', e.message)
    return null
  }
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND   = 'Motiifix' // Brand name used in communications

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  : '—'

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function buildEmail({ statusCode, booking, customerName, bookingUrl }) {
  const confirmed = statusCode === 'confirmed'
  const color     = confirmed ? '#16a34a' : '#dc2626'
  const headline  = confirmed ? '✅ Booking Confirmed' : '❌ Booking Cancelled'
  const intro     = confirmed
    ? 'Great news! Your booking has been <strong>confirmed</strong> by the service provider.'
    : 'Your booking has been <strong>cancelled</strong>.'

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">
  <tr>
    <td style="background:${color};padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND}</p>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">${headline}</p>
    </td>
  </tr>
  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 16px;">Hello ${customerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">${intro}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;width:38%;">Booking No.</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${booking.booking_number}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Date</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${fmtDate(booking.booking_date)}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Time</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${fmtTime(booking.booking_time_start)}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Provider</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${booking.service_provider?.name || '—'}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Vehicle</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${booking.vehicle?.plate_number}${booking.vehicle?.make ? ` · ${booking.vehicle.make} ${booking.vehicle.model || ''}` : ''}</td></tr>
      </table>
    </div>
    <div style="text-align:center;">
      <a href="${bookingUrl}" style="display:inline-block;background:${color};color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Booking</a>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `${BRAND} — Booking ${confirmed ? 'Confirmed' : 'Cancelled'}

Hello ${customerName},

Your booking (${booking.booking_number}) at ${booking.service_provider?.name || '—'} on ${fmtDate(booking.booking_date)} has been ${confirmed ? 'confirmed' : 'cancelled'}.

Vehicle: ${booking.vehicle?.plate_number}

View: ${bookingUrl}
— ${BRAND}`

  return { html, text }
}

export async function PATCH(request, { params }) {
  try {
    const supabase   = await createClient()
    const sc         = getServiceClient()           // service client for cross-user reads + queue writes
    const { id }     = await params
    const body       = await request.json()
    const { statusCode } = body

    if (!statusCode) {
      return NextResponse.json({ error: 'statusCode is required' }, { status: 400 })
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

    // ── Load booking ──────────────────────────────────────────────────────────
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

    // ── Get new status ────────────────────────────────────────────────────────
    const { data: newStatus } = await supabase
      .from('booking_statuses').select('id').eq('code', statusCode).single()

    if (!newStatus) {
      return NextResponse.json({ error: `Status "${statusCode}" not found` }, { status: 400 })
    }

    // ── Update booking ────────────────────────────────────────────────────────
    const patch = { status_id: newStatus.id, updated_at: new Date().toISOString() }
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

    // ── In-app notification ───────────────────────────────────────────────────
    const { error: notifErr } = await supabase.from('notifications').insert({
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
    })
    if (notifErr) console.warn('Notification failed (non-fatal):', notifErr.message)

    // ── Email + SMS only for confirmed / cancelled ────────────────────────────
    if (!['confirmed', 'cancelled'].includes(statusCode)) {
      return NextResponse.json({ success: true })
    }

    // Resolve customer contact — service client bypasses user_profiles RLS
    const { data: custProfile } = await sc
      .from('user_profiles')
      .select('first_name, last_name, phone, email, auth_user_id')
      .eq('id', booking.customer_user_id)
      .maybeSingle()

    const customerName = custProfile
      ? `${custProfile.first_name || ''} ${custProfile.last_name || ''}`.trim() || 'Customer'
      : 'Customer'

    let custEmail = booking.customer_email || custProfile?.email
    if (!custEmail && custProfile?.auth_user_id) {
      const { data: au } = await sc.auth.admin.getUserById(custProfile.auth_user_id)
      custEmail = au?.user?.email || null
    }

    const custPhone = booking.customer_phone || custProfile?.phone

    // Is this customer a company member? (for URL routing)
    const { data: companyMem } = await sc
      .from('company_users')
      .select('company_id')
      .eq('user_id', booking.customer_user_id)
      .eq('is_active', true)
      .maybeSingle()
    const isCompany   = !!companyMem?.company_id
    const bookingUrl  = `${APP_URL()}/${isCompany ? 'company' : 'dashboard'}/bookings/${id}`

    console.log(`[PATCH /api/bookings/${id}] status=${statusCode} customer=${customerName} email=${custEmail||'NONE'} phone=${custPhone||'NONE'} isCompany=${isCompany}`)

    const comms = []

    // ── Email — use service client so queue insert bypasses RLS ──────────────
    if (custEmail) {
      const { html, text } = buildEmail({ statusCode, booking, customerName, bookingUrl })
      comms.push(
        sendAndQueueEmail(sc, {   // ← service client, not supabase
          to:      [{ Email: custEmail, Name: customerName }],
          subject: `Booking ${statusCode === 'confirmed' ? 'Confirmed' : 'Cancelled'} — ${booking.booking_number}`,
          html,
          text,
        })
        .then(() => console.log(`[PATCH /api/bookings/${id}] ✓ email → ${custEmail}`))
        .catch(e  => console.error(`[PATCH /api/bookings/${id}] ✗ email:`, e.message))
      )
    } else {
      console.warn(`[PATCH /api/bookings/${id}] no customer email — skipping`)
    }

    // ── SMS — use service client so queue insert bypasses RLS ────────────────
    if (custPhone) {
      const phone = normalisePhone(custPhone)
      if (phone) {
        const dateShort = new Date(booking.booking_date)
          .toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
        const state   = statusCode === 'confirmed' ? 'confirmed ✓' : 'cancelled'
        const message = `${BRAND}: Your booking (${booking.booking_number}) at ${booking.service_provider?.name || '—'} on ${dateShort} has been ${state}. View: ${bookingUrl}`

        comms.push(
          sendAndQueueSms(sc, { to: phone, message })   // ← service client
          .then(() => console.log(`[PATCH /api/bookings/${id}] ✓ SMS → ${phone}`))
          .catch(e  => console.error(`[PATCH /api/bookings/${id}] ✗ SMS:`, e.message))
        )
      } else {
        console.warn(`[PATCH /api/bookings/${id}] phone "${custPhone}" failed to normalise — skipping SMS`)
      }
    } else {
      console.warn(`[PATCH /api/bookings/${id}] no customer phone — skipping SMS`)
    }

    await Promise.allSettled(comms)
    console.log(`[PATCH /api/bookings/${id}] done (${comms.length} comms tasks)`)

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('PATCH /api/bookings/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}