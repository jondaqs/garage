/**
 * POST /api/provider/bookings
 * ───────────────────────────
 * Provider creates a booking on behalf of an existing customer.
 *
 * Authorisation is enforced inside the SECURITY DEFINER RPC
 * `provider_create_booking_for_customer`, which accepts any caller that is:
 *   • the provider owner, OR
 *   • an active service_provider_users row with can_approve_work=true, OR
 *   • an active mechanic with can_approve_work=true.
 *
 * After the RPC succeeds we reuse the existing booking-comms helpers so the
 * customer receives the same email + SMS they'd get if they had booked
 * themselves. Comms are non-fatal — delivery failure never blocks the booking.
 */

import { createClient }                            from '@/lib/supabase/server'
import { createClient as createServiceClient }     from '@supabase/supabase-js'
import { NextResponse }                            from 'next/server'
import { sendBookingConfirmationEmail }            from '@/lib/email/bookingEmails'
import { sendBookingConfirmationSms }              from '@/lib/sms/bookingSms'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
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
    const body     = await request.json()

    const {
      providerId,
      vehicleId,
      customerUserId,         // user_profiles.id of the customer (from vehicle lookup)
      shopId,
      bookingDate,
      bookingTime,
      bookingTimeEnd,
      problemDescription,
      specialInstructions,
      requestedServices = [],
    } = body

    // ── Auth (the RPC re-validates against can_provider_approve_work) ──────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!providerId || !vehicleId || !customerUserId || !bookingDate || !bookingTime) {
      return NextResponse.json(
        { error: 'providerId, vehicleId, customerUserId, bookingDate and bookingTime are required' },
        { status: 400 }
      )
    }

    const startTime = bookingTime
    const endTime   = bookingTimeEnd || calcEndTime(startTime)

    // ── Call the SECURITY DEFINER RPC ─────────────────────────────────────
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'provider_create_booking_for_customer',
      {
        p_caller_auth_uid:      user.id,
        p_provider_id:          providerId,
        p_vehicle_id:           vehicleId,
        p_customer_user_id:     customerUserId,
        p_shop_id:              shopId || null,
        p_booking_date:         bookingDate,
        p_booking_time_start:   startTime,
        p_booking_time_end:     endTime,
        p_problem_description:  problemDescription   || null,
        p_special_instructions: specialInstructions  || null,
        p_requested_services:   requestedServices.length > 0 ? requestedServices : null,
      }
    )

    if (rpcErr) {
      console.error('[/api/provider/bookings] RPC error:', rpcErr)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!rpcResult?.success) {
      // 403 when authorisation failed; 400 otherwise
      const status = (rpcResult?.error || '').toLowerCase().includes('authoris') ? 403 : 400
      return NextResponse.json({ error: rpcResult?.error || 'Booking creation failed' }, { status })
    }

    const {
      booking_id:     bookingId,
      booking_number: bookingNumber,
      customer_phone: rpcCustomerPhone,
      customer_email: rpcCustomerEmail,
    } = rpcResult

    // ── Email + SMS to the customer (reuse existing templates) ─────────────
    // Use service-role client for these reads — booking_emails helpers write
    // to the email_queue table whose RLS is permissive only for service role.
    const sc = getServiceClient()

    // Load context for templates (provider name, shop, vehicle, services, customer name)
    const [
      { data: provider },
      { data: vehicle  },
      { data: shop     },
      { data: customer },
      { data: services },
    ] = await Promise.all([
      sc.from('service_providers_secure').select('name').eq('id', providerId).maybeSingle(),
      sc.from('vehicles_secure').select('plate_number, make, model').eq('id', vehicleId).maybeSingle(),
      shopId ? sc.from('shops_secure').select('name, town').eq('id', shopId).maybeSingle() : Promise.resolve({ data: null }),
      sc.from('user_profiles_secure').select('first_name, last_name, phone, email').eq('id', customerUserId).maybeSingle(),
      requestedServices.length > 0
        ? sc.from('services').select('name').in('id', requestedServices)
        : Promise.resolve({ data: [] }),
    ])

    const customerName = customer
      ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Customer'
      : 'Customer'
    const custEmail = customer?.email || rpcCustomerEmail
    const custPhone = customer?.phone || rpcCustomerPhone

    const sharedArgs = {
      bookingNumber,
      bookingId,
      bookingDate,
      bookingTime:  startTime,
      vehiclePlate: vehicle?.plate_number || '—',
      vehicleMake:  vehicle?.make         || '',
      vehicleModel: vehicle?.model        || '',
      providerName: provider?.name        || '—',
      shopName:     shop?.name            || null,
      shopTown:     shop?.town            || null,
      services:     (services || []).map(s => s.name),
      // Provider made this booking on the customer's behalf — it goes straight
      // into 'confirmed' state (see the RPC). Tell the email/SMS helpers to
      // use the "already confirmed" copy instead of "pending confirmation".
      isProviderInitiated: true,
    }

    const commTasks = []

    if (custEmail) {
      commTasks.push(
        sendBookingConfirmationEmail(sc, {
          to: custEmail, customerName, isCompany: false, ...sharedArgs,
        })
          .then(() => console.log(`[/api/provider/bookings] ✓ customer email → ${custEmail}`))
          .catch(e => console.error('[/api/provider/bookings] ✗ customer email:', e.message))
      )
    } else {
      console.warn('[/api/provider/bookings] no customer email — skipped')
    }

    if (custPhone) {
      commTasks.push(
        sendBookingConfirmationSms(sc, {
          phone: custPhone, customerName, isCompany: false, ...sharedArgs,
        })
          .then(() => console.log(`[/api/provider/bookings] ✓ customer SMS → ${custPhone}`))
          .catch(e => console.error('[/api/provider/bookings] ✗ customer SMS:', e.message))
      )
    } else {
      console.warn('[/api/provider/bookings] no customer phone — skipped')
    }

    await Promise.allSettled(commTasks)

    return NextResponse.json({
      success:       true,
      bookingId,
      bookingNumber,
      emailDispatched: !!custEmail,
      smsDispatched:   !!custPhone,
    })

  } catch (err) {
    console.error('[/api/provider/bookings] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}