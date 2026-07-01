/**
 * POST /api/bookings/[id]/reminder
 * ────────────────────────────────
 * Dispatches a 24-hour reminder for a single booking.
 *
 * Authorisation:
 *   • Provided `x-reminder-secret` header matches REMINDER_SCAN_SECRET → service mode, all good
 *   • Otherwise authenticated user must be one of:
 *     – the booking's customer
 *     – the provider owner
 *     – an active service_provider_users / mechanics row on the provider
 *
 * Idempotency:
 *   - If `bookings.reminder_sent_at` is already set, skipped unless ?force=1.
 *
 * Side-effects:
 *   - Customer email + SMS (and a provider heads-up email + SMS)
 *   - In-app notification row for the customer
 *   - Stamps bookings.reminder_sent_at
 *
 * Comms are best-effort — any delivery failure is logged and reported in the
 * response but does NOT prevent reminder_sent_at from being stamped, so we
 * don't loop forever on a chronically bad email address.
 */

import { createClient }                          from '@/lib/supabase/server'
import { createClient as createServiceClient }   from '@supabase/supabase-js'
import { NextResponse }                          from 'next/server'
import { sendBookingReminderEmail }              from '@/lib/email/bookingEmails'
import { sendBookingReminderSms }                from '@/lib/sms/bookingSms'
import { commsLimiter } from '@/lib/rateLimiters'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const LIVE_STATUS_CODES = new Set(['pending', 'confirmed'])

export async function POST(request, context) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  // Next.js 15: params is a Promise; Next.js 14 it's a plain object.
  // Awaiting handles both.
  const { id: bookingId } = await context.params
  const url   = new URL(request.url)
  const force = url.searchParams.get('force') === '1'

  // ── Auth path: secret header OR signed-in user ─────────────────────────
  const secretHeader  = request.headers.get('x-reminder-secret')
  const expectedSecret = process.env.REMINDER_SCAN_SECRET
  const isServiceMode  = !!expectedSecret && secretHeader === expectedSecret

  let supabase, callerProfileId = null
  if (isServiceMode) {
    supabase = getServiceClient()
  } else {
    supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('user_profiles_secure').select('id')
      .eq('auth_user_id', user.id).maybeSingle()
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }
    callerProfileId = profile.id
  }

  // Always use service role for the actual data work; RLS shouldn't block
  // legitimate provider-side reminder dispatches.
  const sc = getServiceClient()

  // ── Load booking ───────────────────────────────────────────────────────
  const { data: booking, error: bErr } = await sc
    .from('bookings_secure')
    .select(`
      id, booking_number, booking_date, booking_time_start, booking_time_end,
      reminder_sent_at, customer_user_id, service_provider_id, customer_phone,
      customer_email,
      status:booking_statuses(code, display_name),
      customer:user_profiles_secure!customer_user_id(id, first_name, last_name, phone, email),
      vehicle:vehicles_secure(plate_number, make, model),
      shop:shops_secure(name, town),
      provider:service_providers_secure(id, name, owner_user_id),
      booking_services(service:services(name))
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (bErr) {
    console.error(`[reminder ${bookingId}] load error:`, bErr.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // ── Authorise non-service callers against this booking ─────────────────
  if (!isServiceMode) {
    const isCustomer = booking.customer_user_id === callerProfileId
    let isProviderStaff = false
    if (!isCustomer) {
      // Provider owner check
      const isOwner = booking.provider?.owner_user_id === callerProfileId
      if (isOwner) {
        isProviderStaff = true
      } else {
        const [{ data: spu }, { data: m }] = await Promise.all([
          sc.from('service_provider_users')
            .select('id')
            .eq('service_provider_id', booking.service_provider_id)
            .eq('user_id', callerProfileId)
            .eq('is_active', true).maybeSingle(),
          sc.from('mechanics')
            .select('id')
            .eq('service_provider_id', booking.service_provider_id)
            .eq('user_id', callerProfileId)
            .eq('is_active', true).maybeSingle(),
        ])
        isProviderStaff = !!(spu || m)
      }
    }
    if (!isCustomer && !isProviderStaff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // ── Skip if already sent (unless ?force=1) ─────────────────────────────
  if (booking.reminder_sent_at && !force) {
    return NextResponse.json({
      success: true, skipped: true, reason: 'already_sent',
      reminder_sent_at: booking.reminder_sent_at,
    })
  }

  // ── Only send for live bookings ────────────────────────────────────────
  const code = booking.status?.code
  if (!LIVE_STATUS_CODES.has(code)) {
    // Stamp anyway so the scanner doesn't keep picking it up
    await sc.from('bookings')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', bookingId)
    return NextResponse.json({
      success: true, skipped: true, reason: `status_${code || 'unknown'}`,
    })
  }

  // ── Build shared args ──────────────────────────────────────────────────
  const customerName = booking.customer
    ? `${booking.customer.first_name || ''} ${booking.customer.last_name || ''}`.trim() || 'Customer'
    : 'Customer'
  const custEmail = booking.customer?.email || booking.customer_email
  const custPhone = booking.customer?.phone || booking.customer_phone

  const serviceNames = (booking.booking_services || [])
    .map(bs => bs.service?.name).filter(Boolean)

  const sharedArgs = {
    bookingNumber: booking.booking_number,
    bookingId:     booking.id,
    bookingDate:   booking.booking_date,
    bookingTime:   booking.booking_time_start,
    providerName:  booking.provider?.name || '—',
    shopName:      booking.shop?.name || null,
    shopTown:      booking.shop?.town || null,
    vehiclePlate:  booking.vehicle?.plate_number || '—',
    vehicleMake:   booking.vehicle?.make  || '',
    vehicleModel: booking.vehicle?.model  || '',
    services:      serviceNames,
  }

  // ── Resolve provider owner contact for the heads-up ───────────────────
  let provOwnerEmail = null, provOwnerPhone = null, provOwnerName = 'Provider'
  if (booking.provider?.owner_user_id) {
    const { data: po } = await sc
      .from('user_profiles_secure')
      .select('first_name, last_name, email, phone')
      .eq('id', booking.provider.owner_user_id).maybeSingle()
    if (po) {
      provOwnerName  = `${po.first_name || ''} ${po.last_name || ''}`.trim() || 'Provider'
      provOwnerEmail = po.email || null
      provOwnerPhone = po.phone || null
    }
  }

  // ── Fire all comms in parallel ─────────────────────────────────────────
  const results = { customer: {}, provider: {} }

  const tasks = []

  if (custEmail) {
    tasks.push(
      sendBookingReminderEmail(sc, {
        to: custEmail, customerName, isCompany: false, isForProvider: false, ...sharedArgs,
      })
        .then(() => { results.customer.email = 'sent' })
        .catch(e => { results.customer.email = `failed: ${e.message}` })
    )
  } else {
    results.customer.email = 'skipped (no email)'
  }

  if (custPhone) {
    tasks.push(
      sendBookingReminderSms(sc, {
        phone: custPhone, customerName, isCompany: false, isForProvider: false, ...sharedArgs,
      })
        .then(() => { results.customer.sms = 'sent' })
        .catch(e => { results.customer.sms = `failed: ${e.message}` })
    )
  } else {
    results.customer.sms = 'skipped (no phone)'
  }

  if (provOwnerEmail) {
    tasks.push(
      sendBookingReminderEmail(sc, {
        to: provOwnerEmail, customerName: provOwnerName,
        isForProvider: true, ...sharedArgs,
      })
        .then(() => { results.provider.email = 'sent' })
        .catch(e => { results.provider.email = `failed: ${e.message}` })
    )
  }

  if (provOwnerPhone) {
    tasks.push(
      sendBookingReminderSms(sc, {
        phone: provOwnerPhone, customerName: provOwnerName,
        isForProvider: true, ...sharedArgs,
      })
        .then(() => { results.provider.sms = 'sent' })
        .catch(e => { results.provider.sms = `failed: ${e.message}` })
    )
  }

  await Promise.allSettled(tasks)

  // ── In-app notification to the customer ────────────────────────────────
  try {
    await sc.from('notifications').insert({
      user_id:           booking.customer_user_id,
      recipient_user_id: booking.customer_user_id,
      type:              'booking_reminder',
      notification_type: 'booking_reminder',
      title:             'Reminder — Booking Tomorrow',
      message: `Reminder: your booking ${booking.booking_number} is scheduled for `
             + `${new Date(booking.booking_date).toLocaleDateString('en-KE', { weekday:'long', day:'numeric', month:'long' })} `
             + `at ${booking.booking_time_start}.`,
      reference_table: 'bookings',
      reference_id:    booking.id,
      reference_type:  'booking',
      is_read:         false,
    })
  } catch (e) {
    console.warn(`[reminder ${bookingId}] notification insert failed:`, e.message)
  }

  // ── Stamp reminder_sent_at (always, even on partial failure) ───────────
  await sc.from('bookings')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', bookingId)

  return NextResponse.json({
    success:          true,
    bookingId:        booking.id,
    bookingNumber:    booking.booking_number,
    results,
  })
}