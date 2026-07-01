/**
 * POST /api/bookings
 * ──────────────────
 * Creates a booking then fires email + SMS to customer and provider.
 * All comms are non-fatal — delivery failure never blocks the booking.
 */

import { createClient }                            from '@/lib/supabase/server'
import { createClient as createServiceClient }     from '@supabase/supabase-js'
import { NextResponse }                            from 'next/server'
import {
  sendBookingConfirmationEmail,
  sendNewBookingProviderEmail,
}                                                  from '@/lib/email/bookingEmails'
import {
  sendBookingConfirmationSms,
  sendNewBookingProviderSms,
}                                                  from '@/lib/sms/bookingSms'

/** Service-role client — can read auth.users email */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Resolve email for a user_profiles.id via service client */
async function resolveEmail(profileId) {
  try {
    const sc = getServiceClient()
    // user_profiles.email is synced from auth.users by handle_new_user trigger
    const { data } = await sc
      .from('user_profiles_secure')
      .select('email, auth_user_id')
      .eq('id', profileId)
      .single()

    if (data?.email) return data.email

    // Fallback: look up directly in auth.users via service client
    if (data?.auth_user_id) {
      const { data: authUser } = await sc.auth.admin.getUserById(data.auth_user_id)
      return authUser?.user?.email || null
    }
    return null
  } catch (e) {
    console.warn('resolveEmail failed (non-fatal):', e.message)
    return null
  }
}

function calcEndTime(startTime) {
  if (!startTime) return '09:00'
  const [h, m] = startTime.split(':').map(Number)
  const endH = Math.min(h + 1, 23)
  return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const sc       = getServiceClient()   // service client for queue inserts (bypasses RLS)
    const body     = await request.json()

    const {
      providerId,
      vehicleId,
      shopId,
      bookingDate,
      bookingTime,
      requestedServices = [],
      problemDescription,
      specialInstructions,
      customerPhone,
      customerEmail,
      isCompany = false,
    } = body

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!providerId || !vehicleId || !bookingDate || !bookingTime) {
      return NextResponse.json(
        { error: 'providerId, vehicleId, bookingDate and bookingTime are required' },
        { status: 400 }
      )
    }

    // ── Load customer profile ─────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('id, first_name, last_name, phone, email')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // ── Load provider, vehicle, pending status ────────────────────────────────
    const [
      { data: provider },
      { data: vehicle  },
      { data: statuses },
    ] = await Promise.all([
      supabase.from('service_providers_secure')
        .select('id, name, owner_user_id')
        .eq('id', providerId).single(),
      supabase.from('vehicles_secure')
        .select('id, plate_number, make, model')
        .eq('id', vehicleId).single(),
      supabase.from('booking_statuses')
        .select('id, code').eq('code', 'pending'),
    ])

    const pendingStatus = statuses?.[0]
    if (!pendingStatus) {
      return NextResponse.json({ error: '"pending" booking status not found' }, { status: 500 })
    }
    

    // ── Load shop (optional) ──────────────────────────────────────────────────
    let shop = null
    if (shopId) {
      const { data: s } = await supabase
        .from('shops_secure').select('id, name, town').eq('id', shopId).single()
      shop = s
    }

    // ── Create booking ────────────────────────────────────────────────────────
    const bookingNumber = `BK${Date.now().toString(36).toUpperCase()}`

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .insert({
        booking_number:       bookingNumber,
        service_provider_id:  providerId,
        shop_id:              shopId || null,
        vehicle_id:           vehicleId,
        customer_user_id:     profile.id,
        status_id:            pendingStatus.id,
        booking_date:         bookingDate,
        booking_time_start:   bookingTime,
        booking_time_end:     calcEndTime(bookingTime),
        requested_services:   requestedServices,
        problem_description:  problemDescription  || null,
        special_instructions: specialInstructions || null,
        customer_phone:       customerPhone || profile.phone || null,
        customer_email:       customerEmail || profile.email || user.email || null,
        priority:             'normal',
        created_by:           user.id,
      })
      .select().single()

    if (bookingErr) {
      console.error('Booking insert error:', bookingErr)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // ── booking_services ──────────────────────────────────────────────────────
    if (requestedServices.length > 0) {
      const { error: svcsErr } = await supabase.from('booking_services').insert(
        requestedServices.map(sid => ({ booking_id: booking.id, service_id: sid }))
      )
      if (svcsErr) console.warn('booking_services insert failed (non-fatal):', svcsErr.message)
    }

    // ── In-app notification to provider ──────────────────────────────────────
    if (provider?.owner_user_id) {
      const { error: notifErr } = await supabase.from('notifications').insert({
        recipient_user_id: provider.owner_user_id,
        user_id:           provider.owner_user_id,
        type:              'new_booking',
        notification_type: 'new_booking',
        title:             'New Booking Request',
        message:           `New booking ${bookingNumber} from ${vehicle?.plate_number} for ${bookingDate}`,
        reference_id:      booking.id,
        reference_type:    'booking',
        reference_table:   'bookings',
        is_read:           false,
      })
      if (notifErr) console.warn('Provider notification failed (non-fatal):', notifErr.message)
    }

    // ── Resolve emails and phones for comms ───────────────────────────────────
    // Customer
    const customerName  = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Customer'
    const custEmail     = customerEmail || profile.email || await resolveEmail(profile.id) || user.email
    const custPhone     = customerPhone || profile.phone

    // Provider owner
    let provOwnerName  = 'Provider'
    let provOwnerEmail = null
    let provOwnerPhone = null

    if (provider?.owner_user_id) {
      // Must use service client — RLS on user_profiles only allows reading own row
      try {
        const sc = getServiceClient()
        const { data: provProfile } = await sc
          .from('user_profiles_secure')
          .select('id, first_name, last_name, phone, email, auth_user_id')
          .eq('id', provider.owner_user_id)
          .maybeSingle()

        if (provProfile) {
          provOwnerName  = `${provProfile.first_name || ''} ${provProfile.last_name || ''}`.trim() || 'Provider'
          provOwnerPhone = provProfile.phone || null
          // email is synced by handle_new_user trigger; fallback to auth.users
          if (provProfile.email) {
            provOwnerEmail = provProfile.email
          } else if (provProfile.auth_user_id) {
            const { data: au } = await sc.auth.admin.getUserById(provProfile.auth_user_id)
            provOwnerEmail = au?.user?.email || null
          }
          console.log(`[/api/bookings] provider profile: name=${provOwnerName} email=${provOwnerEmail||'none'} phone=${provOwnerPhone||'none'}`)
        } else {
          console.warn(`[/api/bookings] provider owner profile not found for id=${provider.owner_user_id}`)
        }
      } catch (e) {
        console.error('[/api/bookings] provider profile lookup failed:', e.message)
      }
    } else {
      console.warn('[/api/bookings] provider has no owner_user_id — cannot resolve provider contact')
    }

    console.log(`[/api/bookings] booking=${booking.id} customer=${custEmail||'no-email'} provider=${provOwnerEmail||'no-email'}`)

    // ── Fetch service names ───────────────────────────────────────────────────
    let serviceNames = []
    if (requestedServices.length > 0) {
      const { data: svcs } = await supabase
        .from('services').select('name').in('id', requestedServices)
      serviceNames = svcs?.map(s => s.name) || []
    }

    const sharedArgs = {
      bookingNumber:     booking.booking_number,
      bookingId:         booking.id,
      bookingDate,
      bookingTime,
      vehiclePlate:      vehicle?.plate_number || '—',
      vehicleMake:       vehicle?.make         || '',
      vehicleModel:      vehicle?.model        || '',
      providerName:      provider?.name        || '—',
      shopName:          shop?.name            || null,
      shopTown:          shop?.town            || null,
      services:          serviceNames,
      problemDescription: problemDescription   || null,
    }

    // ── Send all comms in parallel, awaited so logs appear before response ──────
    const commTasks = []

    if (custEmail) {
      commTasks.push(
        sendBookingConfirmationEmail(sc, {
          to: custEmail, customerName, isCompany, ...sharedArgs,
        }).then(() => console.log(`[/api/bookings] ✓ customer email → ${custEmail}`))
          .catch(e => console.error('[/api/bookings] ✗ customer email:', e.message))
      )
    } else {
      console.warn('[/api/bookings] no customer email — skipped')
    }

    if (custPhone) {
      commTasks.push(
        sendBookingConfirmationSms(sc, {
          phone: custPhone, customerName, isCompany, ...sharedArgs,
        }).then(() => console.log(`[/api/bookings] ✓ customer SMS → ${custPhone}`))
          .catch(e => console.error('[/api/bookings] ✗ customer SMS:', e.message))
      )
    } else {
      console.warn('[/api/bookings] no customer phone — skipped')
    }

    if (provOwnerEmail) {
      commTasks.push(
        sendNewBookingProviderEmail(sc, {
          to: provOwnerEmail, providerOwnerName: provOwnerName,
          customerName, customerPhone: custPhone || null, ...sharedArgs,
        }).then(() => console.log(`[/api/bookings] ✓ provider email → ${provOwnerEmail}`))
          .catch(e => console.error('[/api/bookings] ✗ provider email:', e.message))
      )
    } else {
      console.warn('[/api/bookings] no provider email — skipped')
    }

    if (provOwnerPhone) {
      commTasks.push(
        sendNewBookingProviderSms(sc, {
          phone: provOwnerPhone, providerOwnerName: provOwnerName,
          customerName, ...sharedArgs,
        }).then(() => console.log(`[/api/bookings] ✓ provider SMS → ${provOwnerPhone}`))
          .catch(e => console.error('[/api/bookings] ✗ provider SMS:', e.message))
      )
    } else {
      console.warn('[/api/bookings] no provider phone — skipped')
    }

    // Wait for all — allSettled so one failure never blocks others
    await Promise.allSettled(commTasks)
    console.log(`[/api/bookings] comms complete (${commTasks.length} tasks)`)

    return NextResponse.json({
      success:       true,
      bookingId:     booking.id,
      bookingNumber: booking.booking_number,
    })

  } catch (err) {
    console.error('POST /api/bookings error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}