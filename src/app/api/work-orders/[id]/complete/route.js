/**
 * POST /api/work-orders/[id]/complete
 * Provider marks work order as complete after QC pass.
 * 1. Calls complete_work_order() DB function (atomic: parts used, service record, history, status)
 * 2. Sends completion email to owner
 * 3. Sends completion SMS to owner
 */

import { createClient }                from '@/lib/supabase/server'
import { NextResponse }                from 'next/server'
import { sendWorkOrderCompletedEmail } from '@/lib/email/workOrderEmails'
import { sendWorkOrderCompletedSms }   from '@/lib/sms/workOrderSms'

export async function POST(request, { params }) {
  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params
    const body                = await request.json().catch(() => ({}))
    const { final_mileage, technician_notes } = body

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

    if (owner?.id) {
      // Get email from auth.users via profile link
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('first_name, last_name, phone, auth_user_id')
        .eq('id', owner.id).single()

      ownerName  = profile ? `${profile.first_name} ${profile.last_name}`.trim() : null
      ownerPhone = profile?.phone || owner.phone || null

      if (profile?.auth_user_id) {
        const { data: authUsers } = await supabase
          .from('user_profiles_secure')
          .select('auth_user_id')
          .eq('id', owner.id).single()
        // Fetch email via a workaround — check bookings for customer email
        const { data: booking } = await supabase
          .from('bookings_secure')
          .select('customer_email')
          .eq('work_order_id', workOrderId)
          .maybeSingle()
        ownerEmail = booking?.customer_email || null
      }
    } else if (owner?.walk_in_phone || owner?.walk_in_email) {
      ownerEmail = owner.walk_in_email || null
      ownerPhone = owner.walk_in_phone || null
      ownerName  = owner.walk_in_name  || null
    }

    // ── 5. Send email (non-fatal) ─────────────────────────────────────────
    let emailSent = false
    if (ownerEmail) {
      try {
        await sendWorkOrderCompletedEmail(supabase, {
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
        const smsResult = await sendWorkOrderCompletedSms(supabase, {
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