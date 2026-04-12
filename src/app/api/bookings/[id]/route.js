/**
 * PATCH /api/bookings/[id]
 * Updates booking status and fires email + SMS to customer on confirmed/cancelled.
 *
 * Each step is logged with a prefix so you can trace exactly where it stops in Vercel logs.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const TAG = (id) => `[PATCH /api/bookings/${id}]`

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garicare.com'
const BRAND   = 'GariCare'

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-KE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
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
  const { id } = await params
  const t = TAG(id)

  try {
    console.log(`${t} ── START ──────────────────────────────────`)

    // ── 1. Env check ──────────────────────────────────────────────────────────
    console.log(`${t} [1] env: APP_URL=${APP_URL()} MAILJET_KEY=${!!process.env.MAILJET_API_KEY} AT_KEY=${!!process.env.AT_API_KEY} SVC_KEY=${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`)

    const supabase = await createClient()
    const sc       = getServiceClient()
    const body     = await request.json()
    const { statusCode } = body

    console.log(`${t} [2] statusCode=${statusCode}`)

    if (!statusCode) {
      return NextResponse.json({ error: 'statusCode is required' }, { status: 400 })
    }

    // ── 2. Auth ───────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      console.error(`${t} [3] auth failed:`, authErr?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log(`${t} [3] auth OK user=${user.id}`)

    const { data: profile } = await supabase
      .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
    console.log(`${t} [4] provider profile id=${profile?.id}`)

    // ── 3. Load booking ───────────────────────────────────────────────────────
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
      console.error(`${t} [5] booking fetch failed:`, fetchErr?.message)
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    console.log(`${t} [5] booking loaded: number=${booking.booking_number} customer_user_id=${booking.customer_user_id} stored_email=${booking.customer_email||'null'} stored_phone=${booking.customer_phone||'null'}`)

    // ── 4. Get status id ──────────────────────────────────────────────────────
    const { data: newStatus, error: statusErr } = await supabase
      .from('booking_statuses').select('id').eq('code', statusCode).single()

    if (!newStatus) {
      console.error(`${t} [6] status not found: ${statusCode}`, statusErr?.message)
      return NextResponse.json({ error: `Status "${statusCode}" not found` }, { status: 400 })
    }
    console.log(`${t} [6] status id=${newStatus.id}`)

    // ── 5. Update booking ─────────────────────────────────────────────────────
    const patch = { status_id: newStatus.id, updated_at: new Date().toISOString() }
    if (statusCode === 'confirmed') {
      patch.confirmed_by_provider_at      = new Date().toISOString()
      patch.confirmed_by_provider_user_id = profile.id
    }
    const isCancelled = statusCode === 'cancelled' || statusCode.startsWith('cancelled')
    if (isCancelled) {
      patch.cancelled_at         = new Date().toISOString()
      patch.cancelled_by_user_id = profile.id
    }

    const { error: upErr } = await supabase.from('bookings').update(patch).eq('id', id)
    if (upErr) {
      console.error(`${t} [7] booking update failed:`, upErr.message)
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }
    console.log(`${t} [7] booking updated to "${statusCode}"`)

    // ── 6. In-app notification ────────────────────────────────────────────────
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
    if (notifErr) {
      console.warn(`${t} [8] notification failed (non-fatal):`, notifErr.message)
    } else {
      console.log(`${t} [8] in-app notification inserted`)
    }

    // ── 7. Skip email/SMS for non-customer-facing status changes ──────────────
    const sendComms = statusCode === 'confirmed' || statusCode.startsWith('cancelled')
    if (!sendComms) {
      console.log(`${t} [9] status="${statusCode}" — no email/SMS needed`)
      return NextResponse.json({ success: true })
    }

    // ── 8. Resolve customer profile (service client bypasses RLS) ─────────────
    console.log(`${t} [9] resolving customer profile via service client…`)
    const { data: custProfile, error: custErr } = await sc
      .from('user_profiles')
      .select('first_name, last_name, phone, email, auth_user_id')
      .eq('id', booking.customer_user_id)
      .maybeSingle()

    if (custErr) console.warn(`${t} [9] custProfile error:`, custErr.message)
    console.log(`${t} [9] custProfile: first=${custProfile?.first_name} last=${custProfile?.last_name} email=${custProfile?.email||'null'} phone=${custProfile?.phone||'null'} auth_user_id=${custProfile?.auth_user_id||'null'}`)

    const customerName = custProfile
      ? `${custProfile.first_name || ''} ${custProfile.last_name || ''}`.trim() || 'Customer'
      : 'Customer'

    // Try email in order: booking record → profile row → auth.users
    let custEmail = booking.customer_email || custProfile?.email || null
    if (!custEmail && custProfile?.auth_user_id) {
      console.log(`${t} [10] email not in profile — fetching from auth.users…`)
      const { data: au, error: auErr } = await sc.auth.admin.getUserById(custProfile.auth_user_id)
      if (auErr) console.warn(`${t} [10] auth.users lookup error:`, auErr.message)
      custEmail = au?.user?.email || null
      console.log(`${t} [10] auth.users email=${custEmail||'null'}`)
    }

    const custPhone = booking.customer_phone || custProfile?.phone || null
    console.log(`${t} [11] final: customerName="${customerName}" email=${custEmail||'NONE'} phone=${custPhone||'NONE'}`)

    // ── 9. Determine URL routing (individual vs company) ──────────────────────
    const { data: companyMem, error: coErr } = await sc
      .from('company_users')
      .select('company_id')
      .eq('user_id', booking.customer_user_id)
      .eq('is_active', true)
      .maybeSingle()

    if (coErr) console.warn(`${t} [12] company_users lookup error:`, coErr.message)
    const isCompany  = !!companyMem?.company_id
    const bookingUrl = `${APP_URL()}/${isCompany ? 'company' : 'dashboard'}/bookings/${id}`
    console.log(`${t} [12] isCompany=${isCompany} bookingUrl=${bookingUrl}`)

    // ── 10. Send comms ────────────────────────────────────────────────────────
    const comms = []

    if (custEmail) {
      console.log(`${t} [13] queueing email → ${custEmail}`)
      const { html, text } = buildEmail({ statusCode, booking, customerName, bookingUrl })
      comms.push(
        sendAndQueueEmail(sc, {
          to:      [{ Email: custEmail, Name: customerName }],
          subject: `Booking ${statusCode === 'confirmed' ? 'Confirmed' : 'Cancelled'} — ${booking.booking_number}`,
          html,
          text,
        })
        .then(() => console.log(`${t} [13] ✓ email sent → ${custEmail}`))
        .catch(e  => console.error(`${t} [13] ✗ email FAILED:`, e.message, e.stack?.split('\n')[1]))
      )
    } else {
      console.warn(`${t} [13] NO email address found — email skipped`)
    }

    if (custPhone) {
      const phone = normalisePhone(custPhone)
      console.log(`${t} [14] phone raw="${custPhone}" normalised="${phone||'INVALID'}"`)
      if (phone) {
        const dateShort = new Date(booking.booking_date)
          .toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
        const state   = statusCode === 'confirmed' ? 'confirmed ✓' : 'cancelled'
        const message = `${BRAND}: Your booking (${booking.booking_number}) at ${booking.service_provider?.name || '—'} on ${dateShort} has been ${state}. View: ${bookingUrl}`
        console.log(`${t} [14] SMS message (${message.length} chars): ${message.substring(0, 100)}…`)

        comms.push(
          sendAndQueueSms(sc, { to: phone, message })
          .then(() => console.log(`${t} [14] ✓ SMS sent → ${phone}`))
          .catch(e  => console.error(`${t} [14] ✗ SMS FAILED:`, e.message))
        )
      }
    } else {
      console.warn(`${t} [14] NO phone found — SMS skipped`)
    }

    console.log(`${t} [15] awaiting ${comms.length} comm task(s)…`)
    const results = await Promise.allSettled(comms)
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`${t} [15] task ${i} rejected:`, r.reason)
      }
    })
    console.log(`${t} [15] all comms done`)
    console.log(`${t} ── END ────────────────────────────────────`)

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error(`${t} UNHANDLED ERROR:`, err.message, err.stack?.split('\n').slice(0, 3).join(' | '))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}