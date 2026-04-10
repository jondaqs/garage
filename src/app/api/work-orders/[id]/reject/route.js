/**
 * POST /api/work-orders/[id]/reject
 * Customer rejects the work order estimate.
 */

import { createClient }              from '@/lib/supabase/server'
import { NextResponse }              from 'next/server'
import { sendEstimateRejectedEmail } from '@/lib/email/workOrderEmails'
import { sendEstimateRejectedSms }   from '@/lib/sms/workOrderSms'

export async function POST(request, { params }) {
  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params
    const body                = await request.json().catch(() => ({}))
    const { reason }          = body

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: result, error: rpcErr } = await supabase.rpc(
      'reject_work_order_estimate',
      {
        p_work_order_id:    workOrderId,
        p_customer_user_id: user.id,
        p_reason:           reason || null,
      }
    )
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    const { work_order_number } = result

    // Fetch provider contact
    const { data: wo } = await supabase
      .from('work_orders')
      .select(`
        service_provider_id,
        vehicle:vehicles(plate_number),
        provider:service_providers(email, owner_user_id,
          owner:user_profiles!owner_user_id(phone)
        )
      `)
      .eq('id', workOrderId)
      .single()

    const providerEmail = wo?.provider?.email || null
    const providerPhone = wo?.provider?.owner?.phone || null
    const vehiclePlate  = wo?.vehicle?.plate_number || ''

    // Fetch provider name
    const { data: sp } = await supabase
      .from('service_providers')
      .select('name')
      .eq('id', wo?.service_provider_id)
      .single()

    let emailSent = false
    if (providerEmail) {
      try {
        await sendEstimateRejectedEmail(supabase, {
          to:              providerEmail,
          providerName:    sp?.name || 'Provider',
          workOrderNumber: work_order_number,
          vehiclePlate,
          reason:          reason || null,
          workOrderId,
        })
        emailSent = true
      } catch (e) {
        console.error('Rejected email failed (non-fatal):', e.message)
      }
    }

    let smsSent = false
    if (providerPhone) {
      try {
        const smsResult = await sendEstimateRejectedSms(supabase, {
          phone:           providerPhone,
          providerName:    sp?.name || 'Provider',
          workOrderNumber: work_order_number,
          vehiclePlate,
          workOrderId,
        })
        smsSent = smsResult.sent
      } catch (e) {
        console.error('Rejected SMS failed (non-fatal):', e.message)
      }
    }

    return NextResponse.json({ success: true, work_order_number, email_sent: emailSent, sms_sent: smsSent })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/reject error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}