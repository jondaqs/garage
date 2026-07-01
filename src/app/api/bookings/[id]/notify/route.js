/**
 * POST /api/bookings/[id]/notify
 * ─────────────────────────────
 * Fires email + SMS to the customer after the provider accepts a booking
 * (accept_booking_and_create_work_order RPC handles DB + in-app notification;
 *  this route handles the outgoing comms).
 *
 * Body: { event: 'booking_accepted', workOrderId, workOrderNumber }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { commsLimiter } from '@/lib/rateLimiters'
import { requireUUID } from '@/lib/validation'

const TAG   = (id) => `[POST /api/bookings/${id}/notify]`
const BRAND = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

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

export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  const { id } = await params
  if (!requireUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  const t      = TAG(id)

  try {
    console.log(`${t} ── START ──────────────────────────────────`)
    console.log(`${t} [1] env check: MAILJET=${!!process.env.MAILJET_API_KEY} AT=${!!process.env.AT_API_KEY} SVC=${!!process.env.SUPABASE_SERVICE_ROLE_KEY} APP_URL=${APP_URL()}`)

    const supabase = await createClient()
    const sc       = getServiceClient()
    const body     = await request.json()
    const { event, workOrderId, workOrderNumber } = body

    console.log(`${t} [2] event=${event} workOrderId=${workOrderId} workOrderNumber=${workOrderNumber}`)

    // ── Auth check (must be authenticated provider) ───────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      console.error(`${t} [3] auth failed:`, authErr?.message)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.log(`${t} [3] auth OK user=${user.id}`)

    // ── Load booking (service client — avoids RLS cross-user issues) ──────────
    console.log(`${t} [4] loading booking ${id}…`)
    const { data: booking, error: bookingErr } = await sc
      .from('bookings_secure')
      .select(`
        id, booking_number, booking_date, booking_time_start,
        customer_user_id, customer_email, customer_phone,
        vehicle:vehicles_secure(plate_number, make, model),
        service_provider:service_providers_secure(id, name),
        shop:shops_secure(name, town)
      `)
      .eq('id', id)
      .single()

    if (bookingErr || !booking) {
      console.error(`${t} [4] booking load failed:`, bookingErr?.message)
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    console.log(`${t} [4] booking loaded: number=${booking.booking_number} provider=${booking.service_provider?.name} vehicle=${booking.vehicle?.plate_number}`)
    console.log(`${t} [4] stored customer_email=${booking.customer_email||'null'} customer_phone=${booking.customer_phone||'null'} customer_user_id=${booking.customer_user_id}`)

    // ── Resolve customer profile ──────────────────────────────────────────────
    console.log(`${t} [5] fetching customer profile…`)
    const { data: custProfile, error: profErr } = await sc
      .from('user_profiles_secure')
      .select('first_name, last_name, phone, email, auth_user_id')
      .eq('id', booking.customer_user_id)
      .maybeSingle()

    if (profErr) console.warn(`${t} [5] profile error:`, profErr.message)
    console.log(`${t} [5] profile: name="${custProfile?.first_name} ${custProfile?.last_name}" email=${custProfile?.email||'null'} phone=${custProfile?.phone||'null'}`)

    const customerName = custProfile
      ? `${custProfile.first_name || ''} ${custProfile.last_name || ''}`.trim() || 'Customer'
      : 'Customer'

    // Resolve email: booking record → profile.email → auth.users
    let custEmail = booking.customer_email || custProfile?.email || null
    if (!custEmail && custProfile?.auth_user_id) {
      console.log(`${t} [5] no email in profile — checking auth.users…`)
      const { data: au, error: auErr } = await sc.auth.admin.getUserById(custProfile.auth_user_id)
      if (auErr) console.warn(`${t} [5] auth.users error:`, auErr.message)
      custEmail = au?.user?.email || null
      console.log(`${t} [5] auth.users email=${custEmail||'null'}`)
    }

    const custPhone = booking.customer_phone || custProfile?.phone || null
    console.log(`${t} [6] resolved: name="${customerName}" email=${custEmail||'NONE'} phone=${custPhone||'NONE'}`)

    // ── Determine if company user (for URL routing) ───────────────────────────
    const { data: companyMem } = await sc
      .from('company_users')
      .select('company_id')
      .eq('user_id', booking.customer_user_id)
      .eq('is_active', true)
      .maybeSingle()

    const isCompany  = !!companyMem?.company_id
    const bookingUrl = `${APP_URL()}/${isCompany ? 'company' : 'dashboard'}/bookings/${id}`
    const woUrl      = `${APP_URL()}/${isCompany ? 'company' : 'dashboard'}/work-orders/${workOrderId}`
    console.log(`${t} [7] isCompany=${isCompany} bookingUrl=${bookingUrl}`)

    // ── Build email ───────────────────────────────────────────────────────────
    const subject  = `Booking Accepted & Work Order Created — ${booking.booking_number}`
    const html     = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:600px;width:100%;">
  <tr>
    <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#fff;">${BRAND}</p>
      <p style="margin:0;font-size:14px;color:#bbf7d0;">✅ Booking Accepted — Service Starting</p>
    </td>
  </tr>
  <tr><td style="padding:32px;">
    <p style="color:#111827;font-size:16px;margin:0 0 16px;">Hello ${customerName},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      Great news! <strong>${booking.service_provider?.name || 'Your service provider'}</strong> has accepted
      your booking and created a work order. Your vehicle is now in their system.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;width:38%;">Booking No.</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${booking.booking_number}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Work Order</td>
            <td style="padding:5px 0;color:#16a34a;font-size:13px;font-weight:700;">${workOrderNumber}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Date</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${fmtDate(booking.booking_date)}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Time</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${fmtTime(booking.booking_time_start)}</td></tr>
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Provider</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${booking.service_provider?.name || '—'}</td></tr>
        ${booking.shop?.name ? `<tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Location</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;">${booking.shop.name}${booking.shop.town ? `, ${booking.shop.town}` : ''}</td></tr>` : ''}
        <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;">Vehicle</td>
            <td style="padding:5px 0;color:#111827;font-size:13px;font-weight:600;">${booking.vehicle?.plate_number}${booking.vehicle?.make ? ` · ${booking.vehicle.make} ${booking.vehicle.model || ''}` : ''}</td></tr>
      </table>
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#1e40af;font-size:13px;">
        You will receive further updates as the service progresses. You can track the work order status in real time.
      </p>
    </div>

    <div style="text-align:center;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
      <a href="${woUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:4px;">
        Track Work Order
      </a>
      <a href="${bookingUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:4px;border:1px solid #e5e7eb;">
        View Booking
      </a>
    </div>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

    const text = `${BRAND} — Booking Accepted

Hello ${customerName},

${booking.service_provider?.name || 'Your service provider'} has accepted your booking and created work order ${workOrderNumber}.

Booking: ${booking.booking_number}
Date: ${fmtDate(booking.booking_date)} ${fmtTime(booking.booking_time_start)}
Vehicle: ${booking.vehicle?.plate_number}

Track work order: ${woUrl}
— ${BRAND}`

    // ── Send comms ────────────────────────────────────────────────────────────
    const comms = []

    if (custEmail) {
      console.log(`${t} [8] sending email → ${custEmail}`)
      comms.push(
        sendAndQueueEmail(sc, {
          to:      [{ Email: custEmail, Name: customerName }],
          subject,
          html,
          text,
        })
        .then(() => console.log(`${t} [8] ✓ email sent → ${custEmail}`))
        .catch(e  => console.error(`${t} [8] ✗ email FAILED: ${e.message}`))
      )
    } else {
      console.warn(`${t} [8] no email address found — email skipped`)
    }

    if (custPhone) {
      const phone = normalisePhone(custPhone)
      console.log(`${t} [9] phone raw="${custPhone}" normalised="${phone||'INVALID'}"`)
      if (phone) {
        const dateShort = new Date(booking.booking_date)
          .toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
        const smsMsg = `${BRAND}: Your booking (${booking.booking_number}) at ${booking.service_provider?.name || '—'} on ${dateShort} has been accepted. Work order ${workOrderNumber} created. Track: ${woUrl}`
        console.log(`${t} [9] SMS (${smsMsg.length} chars): ${smsMsg.substring(0, 100)}…`)
        comms.push(
          sendAndQueueSms(sc, { to: phone, message: smsMsg })
          .then(() => console.log(`${t} [9] ✓ SMS sent → ${phone}`))
          .catch(e  => console.error(`${t} [9] ✗ SMS FAILED: ${e.message}`))
        )
      }
    } else {
      console.warn(`${t} [9] no phone found — SMS skipped`)
    }

    console.log(`${t} [10] awaiting ${comms.length} comm task(s)…`)
    await Promise.allSettled(comms)
    console.log(`${t} [10] all comms done`)
    console.log(`${t} ── END ────────────────────────────────────`)

    return NextResponse.json({
      success: true,
      emailSent: !!custEmail,
      smsSent:   !!(custPhone && normalisePhone(custPhone)),
    })

  } catch (err) {
    console.error(`${t} UNHANDLED ERROR:`, err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}