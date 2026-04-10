/**
 * POST /api/work-orders/[id]/approve
 * Customer approves the work order estimate.
 */

import { createClient }              from '@/lib/supabase/server'
import { NextResponse }              from 'next/server'
import { sendEstimateApprovedEmail } from '@/lib/email/workOrderEmails'
import { sendEstimateApprovedSms }   from '@/lib/sms/workOrderSms'

export async function POST(request, { params }) {
  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params
    const body                = await request.json().catch(() => ({}))
    const { notes }           = body

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. DB function ────────────────────────────────────────────────────
    const { data: result, error: rpcErr } = await supabase.rpc(
      'approve_work_order_estimate',
      {
        p_work_order_id:    workOrderId,
        p_customer_user_id: user.id,
        p_notes:            notes || null,
      }
    )
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    const { work_order_number, provider_id, provider_name } = result

    // ── 2. Get customer name for notification ─────────────────────────────
    const { data: customerProfile } = await supabase
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()
    const customerName = customerProfile
      ? `${customerProfile.first_name} ${customerProfile.last_name}`.trim()
      : 'Customer'

    // ── 3. Fetch provider owner contact ───────────────────────────────────
    const { data: providerOwner } = await supabase
      .from('service_providers')
      .select('owner_user_id, owner:user_profiles!owner_user_id(phone, auth_user_id)')
      .eq('id', provider_id)
      .single()

    // Get work order details for vehicle plate + total
    const { data: wo } = await supabase
      .from('work_orders')
      .select('total_amount, vehicle:vehicles(plate_number)')
      .eq('id', workOrderId)
      .single()

    // Get provider owner's email via auth
    let providerEmail = null
    let providerPhone = providerOwner?.owner?.phone || null

    if (providerOwner?.owner?.auth_user_id) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
        .catch(() => ({ data: { user: null } }))
      // Use a direct query since admin API may not be available
      const { data: emailData } = await supabase
        .from('user_profiles')
        .select('auth_user_id')
        .eq('id', providerOwner.owner_user_id)
        .single()
      // We'll rely on the notification system for email; SMS is primary for provider
    }

    // Fetch email from provider_documents or service_providers table
    const { data: spEmail } = await supabase
      .from('service_providers')
      .select('email')
      .eq('id', provider_id)
      .single()
    providerEmail = spEmail?.email || null

    const vehiclePlate = wo?.vehicle?.plate_number || ''
    const estimateTotal = wo?.total_amount || 0

    // ── 4. Send email to provider (non-fatal) ─────────────────────────────
    let emailSent = false
    if (providerEmail) {
      try {
        await sendEstimateApprovedEmail(supabase, {
          to:             providerEmail,
          providerName:   provider_name,
          workOrderNumber: work_order_number,
          customerName,
          vehiclePlate,
          estimateTotal,
          workOrderId,
        })
        emailSent = true
      } catch (e) {
        console.error('Approved email failed (non-fatal):', e.message)
      }
    }

    // ── 5. Send SMS to provider (non-fatal) ───────────────────────────────
    let smsSent = false
    if (providerPhone) {
      try {
        const smsResult = await sendEstimateApprovedSms(supabase, {
          phone:           providerPhone,
          providerName:    provider_name,
          workOrderNumber: work_order_number,
          vehiclePlate,
          estimateTotal,
          workOrderId,
        })
        smsSent = smsResult.sent
      } catch (e) {
        console.error('Approved SMS failed (non-fatal):', e.message)
      }
    }

    return NextResponse.json({
      success:          true,
      work_order_number,
      email_sent:       emailSent,
      sms_sent:         smsSent,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/approve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}