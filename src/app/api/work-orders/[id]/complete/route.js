/**
 * POST /api/work-orders/[id]/complete
 * Provider marks work order as complete after QC pass.
 * 1. Calls complete_work_order() DB function (atomic: parts used, service record, history, status)
 * 2. Sends completion email to owner
 * 3. Sends completion SMS to owner
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendWorkOrderCompletedEmail }         from '@/lib/email/workOrderEmails'
import { sendWorkOrderCompletedSms }           from '@/lib/sms/workOrderSms'
import { commsLimiter } from '@/lib/rateLimiters'
import { requireNumber, requireUUID, sanitizeText } from '@/lib/validation'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params
    if (!requireUUID(workOrderId)) return NextResponse.json({ error: 'Invalid work order ID' }, { status: 400 })
    const body                = await request.json().catch(() => ({}))
    const { final_mileage: rawMileage, technician_notes: rawNotes } = body
    const technician_notes = sanitizeText(rawNotes, 2000)
    const final_mileage = rawMileage != null ? requireNumber(rawMileage, { min: 0, integer: true }) : null

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. DB function ────────────────────────────────────────────────────
    const { data: result, error: rpcErr } = await supabase.rpc('complete_work_order', {
      p_work_order_id:    workOrderId,
      p_provider_user_id: user.id,
      p_final_mileage:    final_mileage    ? parseInt(final_mileage)    : null,
      p_technician_notes: technician_notes || null,
    })

    if (rpcErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    const { work_order_number, provider_name, vehicle_id, owner } = result

    // ── 2. Resolve vehicle plate ──────────────────────────────────────────
    const { data: vehicle } = await supabase
      .from('vehicles_secure').select('plate_number').eq('id', vehicle_id).single()
    const vehiclePlate = vehicle?.plate_number || ''

    // ── 3. Resolve provider phone ─────────────────────────────────────────
    const { data: wo } = await supabase
      .from('work_orders_secure')
      .select('service_provider_id, provider:service_providers_secure(phone)')
      .eq('id', workOrderId).single()
    const providerPhone = wo?.provider?.phone || null

    // ── 4. Resolve owner contact ──────────────────────────────────────────
    let ownerEmail = null
    let ownerPhone = null
    let ownerName  = null

    // Helper: resolve contact from a user_profiles.id (mirrors send-estimate)
    const resolveProfile = async (profileId) => {
      const { data: p } = await sc
        .from('user_profiles_secure')
        .select('first_name, last_name, phone, email, auth_user_id')
        .eq('id', profileId)
        .maybeSingle()
      if (!p) return {}
      let email = p.email || null
      // Fallback to auth.users email if not stored on profile
      if (!email && p.auth_user_id) {
        const { data: au } = await sc.auth.admin.getUserById(p.auth_user_id)
        email = au?.user?.email || null
      }
      return {
        name:  `${p.first_name || ''} ${p.last_name || ''}`.trim() || null,
        phone: p.phone || null,
        email,
      }
    }

    // Case A: registered owner returned by RPC
    if (owner?.id) {
      const contact = await resolveProfile(owner.id)
      ownerName  = contact.name
      ownerPhone = contact.phone
      ownerEmail = contact.email
    }

    // Case B: walk-in
    if (!ownerEmail && !ownerPhone && (owner?.walk_in_email || owner?.walk_in_phone)) {
      ownerEmail = owner.walk_in_email || null
      ownerPhone = owner.walk_in_phone || null
      ownerName  = owner.walk_in_name  || null
    }

    // Case C: look up vehicle ownership directly (covers company fleet)
    if (!ownerEmail && !ownerPhone) {
      const { data: ownership } = await sc
        .from('vehicle_ownership')
        .select('owner_user_id, owner_company_id')
        .eq('vehicle_id', vehicle_id)
        .maybeSingle()

      if (ownership?.owner_user_id) {
        const contact = await resolveProfile(ownership.owner_user_id)
        ownerName  = ownerName  || contact.name
        ownerPhone = ownerPhone || contact.phone
        ownerEmail = ownerEmail || contact.email
      } else if (ownership?.owner_company_id) {
        const { data: company } = await sc
          .from('company_profiles_secure')
          .select('owner_user_id')
          .eq('id', ownership.owner_company_id)
          .maybeSingle()
        if (company?.owner_user_id) {
          const contact = await resolveProfile(company.owner_user_id)
          ownerName  = ownerName  || contact.name
          ownerPhone = ownerPhone || contact.phone
          ownerEmail = ownerEmail || contact.email
        }
      }
    }

    // Case D: fallback — booking customer
    if (!ownerEmail && !ownerPhone) {
      const { data: booking } = await sc
        .from('bookings_secure')
        .select('customer_user_id, customer_email, customer_phone')
        .eq('work_order_id', workOrderId)
        .maybeSingle()
      if (booking) {
        ownerEmail = booking.customer_email || null
        ownerPhone = booking.customer_phone || null
        if (!ownerEmail && !ownerPhone && booking.customer_user_id) {
          const contact = await resolveProfile(booking.customer_user_id)
          ownerName  = ownerName  || contact.name
          ownerPhone = ownerPhone || contact.phone
          ownerEmail = ownerEmail || contact.email
        }
      }
    }

    // ── 5. Send email (non-fatal) ─────────────────────────────────────────
    let emailSent = false
    if (ownerEmail) {
      try {
        await sendWorkOrderCompletedEmail(sc, {
          to:              ownerEmail,
          ownerName,
          workOrderNumber: work_order_number,
          providerName:    provider_name,
          vehiclePlate,
          workOrderId,
          providerPhone,
        })
        emailSent = true
      } catch (e) {
        console.error('Completion email failed (non-fatal):', e.message)
      }
    }

    // ── 6. Send SMS (non-fatal) ───────────────────────────────────────────
    let smsSent = false
    if (ownerPhone) {
      try {
        const smsResult = await sendWorkOrderCompletedSms(sc, {
          phone:           ownerPhone,
          ownerName,
          workOrderNumber: work_order_number,
          providerName:    provider_name,
          vehiclePlate,
          workOrderId,
        })
        smsSent = smsResult.sent
      } catch (e) {
        console.error('Completion SMS failed (non-fatal):', e.message)
      }
    }

    return NextResponse.json({
      success:          true,
      work_order_number,
      service_record_id: result.service_record_id,
      email_sent:       emailSent,
      sms_sent:         smsSent,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/complete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}