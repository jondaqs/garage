/**
 * POST /api/work-orders/[id]/send-estimate
 * Provider triggers estimate approval flow.
 * 1. Calls send_estimate_for_approval() DB function
 * 2. Sends email to owner (if email known)
 * 3. Sends SMS to owner (if phone known)
 */

import { createClient }               from '@/lib/supabase/server'
import { NextResponse }               from 'next/server'
import { sendEstimateApprovalEmail }  from '@/lib/email/workOrderEmails'
import { sendEstimateApprovalSms }    from '@/lib/sms/workOrderSms'

export async function POST(request, { params }) {
  try {
    const supabase           = await createClient()
    const { id: workOrderId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. DB function — validates, updates status, inserts notification ──
    const { data: result, error: rpcErr } = await supabase.rpc(
      'send_estimate_for_approval',
      { p_work_order_id: workOrderId, p_provider_user_id: user.id }
    )
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    const { work_order_number, provider_name, estimate, owner } = result

    // ── 2. Resolve owner contact details ──────────────────────────────────
    // Owner can be: registered user (has id), walk-in (has walk_in_* fields)
    let ownerEmail = null
    let ownerPhone = null
    let ownerName  = null

    if (owner?.id) {
      // Registered user — fetch their profile for email/phone
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, phone')
        .eq('id', owner.id)
        .single()

      // Also get auth email (user_profiles doesn't store email directly)
      const { data: authData } = await supabase.auth.admin
        ? supabase.auth.admin.getUserById(owner.id).catch(() => ({ data: null }))
        : { data: null }

      ownerName  = profile ? `${profile.first_name} ${profile.last_name}`.trim() : null
      ownerPhone = profile?.phone || null
      // Try auth email from user_profiles linked to auth.users
      const { data: authUser } = await supabase
        .from('user_profiles')
        .select('auth_user_id')
        .eq('id', owner.id)
        .single()
      if (authUser?.auth_user_id) {
        const { data: au } = await supabase.auth.admin
          ?.getUserById?.(authUser.auth_user_id)
          .catch(() => ({ data: null })) || { data: null }
        ownerEmail = au?.user?.email || null
      }
    } else if (owner?.walk_in_email || owner?.walk_in_phone) {
      ownerEmail = owner.walk_in_email || null
      ownerPhone = owner.walk_in_phone || null
      ownerName  = owner.walk_in_name  || null
    }

    // Fallback: also check vehicles table for linked booking customer
    if (!ownerEmail) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('customer:user_profiles!customer_user_id(phone, auth_user_id)')
        .eq('work_order_id', workOrderId)
        .maybeSingle()

      if (booking?.customer?.auth_user_id) {
        ownerPhone = ownerPhone || booking.customer.phone
      }
    }

    // ── 3. Send email (non-fatal) ─────────────────────────────────────────
    let emailSent = false
    if (ownerEmail) {
      try {
        await sendEstimateApprovalEmail(supabase, {
          to:              ownerEmail,
          ownerName,
          workOrderNumber: work_order_number,
          providerName:    provider_name,
          vehiclePlate:    result.vehicle_plate || '',
          estimate,
          workOrderId,
        })
        emailSent = true
      } catch (emailErr) {
        console.error('Estimate email failed (non-fatal):', emailErr.message)
      }
    }

    // ── 4. Send SMS (non-fatal) ───────────────────────────────────────────
    let smsSent = false
    if (ownerPhone) {
      try {
        const smsResult = await sendEstimateApprovalSms(supabase, {
          phone:           ownerPhone,
          ownerName,
          workOrderNumber: work_order_number,
          providerName:    provider_name,
          estimateTotal:   estimate?.total,
          workOrderId,
        })
        smsSent = smsResult.sent
      } catch (smsErr) {
        console.error('Estimate SMS failed (non-fatal):', smsErr.message)
      }
    }

    return NextResponse.json({
      success:          true,
      work_order_number,
      notification_sent: true,
      email_sent:        emailSent,
      sms_sent:          smsSent,
      owner_has_email:   !!ownerEmail,
      owner_has_phone:   !!ownerPhone,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/send-estimate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}