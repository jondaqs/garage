/**
 * POST /api/bookings
 * ──────────────────
 * Creates a new booking then fires email + SMS to:
 *   1. Customer / company booker  — booking confirmation
 *   2. Service provider owner     — new booking alert
 *
 * All comms are non-fatal — a delivery failure never blocks the booking.
 *
 * Body: {
 *   providerId, vehicleId, shopId?,
 *   bookingDate, bookingTime,
 *   requestedServices?,   — uuid[]
 *   problemDescription?,
 *   specialInstructions?,
 *   customerPhone?,
 *   customerEmail?,
 *   isCompany?,           — boolean, tweaks customer-facing URLs
 * }
 */

import { createClient }          from '@/lib/supabase/server'
import { NextResponse }          from 'next/server'
import {
  sendBookingConfirmationEmail,
  sendNewBookingProviderEmail,
}                                from '@/lib/email/bookingEmails'
import {
  sendBookingConfirmationSms,
  sendNewBookingProviderSms,
}                                from '@/lib/sms/bookingSms'

export async function POST(request) {
  try {
    const supabase = await createClient()
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

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, phone, email')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // ── Validate required fields ──────────────────────────────────────────────
    if (!providerId || !vehicleId || !bookingDate || !bookingTime) {
      return NextResponse.json(
        { error: 'providerId, vehicleId, bookingDate and bookingTime are required' },
        { status: 400 }
      )
    }

    // ── Load supporting data ──────────────────────────────────────────────────
    const [
      { data: provider },
      { data: vehicle  },
      { data: statuses },
      { data: shop     },
    ] = await Promise.all([
      supabase.from('service_providers')
        .select('id, name, owner_user_id')
        .eq('id', providerId).single(),

      supabase.from('vehicles')
        .select('id, plate_number, make, model')
        .eq('id', vehicleId).single(),

      supabase.from('booking_statuses')
        .select('id, code').eq('code', 'pending'),

      shopId
        ? supabase.from('shops').select('id, name, town').eq('id', shopId).single()
        : Promise.resolve({ data: null }),
    ])

    const pendingStatus = statuses?.[0]
    if (!pendingStatus) {
      return NextResponse.json({ error: 'Booking status "pending" not found' }, { status: 500 })
    }

    // ── Generate booking number ───────────────────────────────────────────────
    const bookingNumber = `BK${Date.now().toString(36).toUpperCase()}`

    // ── Insert booking ────────────────────────────────────────────────────────
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
        customer_email:       customerEmail || user.email    || null,
        priority:             'normal',
        created_by:           user.id,
      })
      .select().single()

    if (bookingErr) {
      return NextResponse.json({ error: bookingErr.message }, { status: 500 })
    }

    // ── Insert booking_services records ───────────────────────────────────────
    if (requestedServices.length > 0) {
      await supabase.from('booking_services').insert(
        requestedServices.map(serviceId => ({
          booking_id: booking.id,
          service_id: serviceId,
        }))
      )
    }

    // ── In-app notification to provider ──────────────────────────────────────
    if (provider?.owner_user_id) {
      try {
        await supabase.from('notifications').insert({
          recipient_user_id:  provider.owner_user_id,
          user_id:            provider.owner_user_id,
          type:               'new_booking',
          notification_type:  'new_booking',
          title:              'New Booking Request',
          message:            `New booking ${bookingNumber} from ${vehicle?.plate_number} for ${bookingDate}`,
          reference_id:       booking.id,
          reference_type:     'booking',
          reference_table:    'bookings',
          is_read:            false,
        })
      } catch (e) { console.error('Notification insert failed (non-fatal):', e.message) }
    }

    // ── Fetch service names for comms ─────────────────────────────────────────
    let serviceNames = []
    if (requestedServices.length > 0) {
      const { data: svcs } = await supabase
        .from('services').select('name').in('id', requestedServices)
      serviceNames = svcs?.map(s => s.name) || []
    }

    // ── Fetch provider owner profile for comms ────────────────────────────────
    let providerOwner = null
    if (provider?.owner_user_id) {
      const { data: po } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, phone, email')
        .eq('id', provider.owner_user_id).maybeSingle()
      providerOwner = po
    }

    const customerName   = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Customer'
    const provOwnerName  = providerOwner
      ? `${providerOwner.first_name || ''} ${providerOwner.last_name || ''}`.trim() || 'Provider'
      : 'Provider'
    const effectiveEmail = customerEmail || user.email
    const effectivePhone = customerPhone || profile.phone

    const sharedArgs = {
      bookingNumber,
      bookingId:    booking.id,
      bookingDate,
      bookingTime,
      vehiclePlate: vehicle?.plate_number || '—',
      vehicleMake:  vehicle?.make         || '',
      vehicleModel: vehicle?.model        || '',
      providerName: provider?.name        || '—',
      shopName:     shop?.name            || null,
      shopTown:     shop?.town            || null,
      services:     serviceNames,
      problemDescription,
    }

    // ── Customer email ────────────────────────────────────────────────────────
    if (effectiveEmail) {
        
      ;(async () => {
        console.log('Dispatching customer email with args:', { to: effectiveEmail, customerName, isCompany, ...sharedArgs }) // Debug log
        try { await sendBookingConfirmationEmail(supabase, { to: effectiveEmail, customerName, isCompany, ...sharedArgs }) }
        catch (e) { console.error('Customer email failed (non-fatal):', e.message) }
      })()
    }else {
      console.warn('No effective email found for customer, skipping booking confirmation email.')
    }

    // ── Customer SMS ──────────────────────────────────────────────────────────
    if (effectivePhone) {
        
      ;(async () => {
        console.log('Dispatching customer SMS with args:', { phone: effectivePhone, customerName, isCompany, ...sharedArgs }) // Debug log
        try { await sendBookingConfirmationSms(supabase, { phone: effectivePhone, customerName, isCompany, ...sharedArgs }) }
        catch (e) { console.error('Customer SMS failed (non-fatal):', e.message) }
      })()
    }else {
      console.warn('No effective phone number found for customer, skipping booking confirmation SMS.')
    }

    // ── Provider email ────────────────────────────────────────────────────────
    if (providerOwner?.email) {
      ;(async () => {
        console.log('Dispatching provider email with args:', { to: providerOwner.email, providerOwnerName: provOwnerName, customerName, customerPhone: effectivePhone || null, ...sharedArgs }) // Debug log
        try { await sendNewBookingProviderEmail(supabase, { to: providerOwner.email, providerOwnerName: provOwnerName, customerName, customerPhone: effectivePhone || null, ...sharedArgs }) }
        catch (e) { console.error('Provider email failed (non-fatal):', e.message) }
      })()
    }else {
      console.warn('No email found for provider owner, skipping new booking provider email.')
    }

    // ── Provider SMS ──────────────────────────────────────────────────────────
    if (providerOwner?.phone) {
      ;(async () => {
        console.log('Dispatching provider SMS with args:', { phone: providerOwner.phone, providerOwnerName: provOwnerName, customerName, ...sharedArgs }) // Debug log  
        try { await sendNewBookingProviderSms(supabase, { phone: providerOwner.phone, providerOwnerName: provOwnerName, customerName, ...sharedArgs }) }
        catch (e) { console.error('Provider SMS failed (non-fatal):', e.message) }
      })()
    }else {
      console.warn('No phone number found for provider owner, skipping new booking provider SMS.')
    }

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcEndTime(startTime) {
  if (!startTime) return '09:00'
  const [h, m] = startTime.split(':').map(Number)
  const endH   = h + 1 > 23 ? 23 : h + 1
  return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}