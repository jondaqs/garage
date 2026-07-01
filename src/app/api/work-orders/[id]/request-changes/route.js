/**
 * POST /api/work-orders/[id]/request-changes
 * Customer requests changes to the estimate.
 */

import { createClient }                        from '@/lib/supabase/server'
import { NextResponse }                        from 'next/server'
import { sendEstimateChangesRequestedEmail }   from '@/lib/email/workOrderEmails'
import { sendEstimateChangesRequestedSms }     from '@/lib/sms/workOrderSms'
import { commsLimiter } from '@/lib/rateLimiters'

export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params
    const body                = await request.json().catch(() => ({}))
    const { changes_requested } = body

    if (!changes_requested?.trim()) {
      return NextResponse.json({ error: 'Please describe the changes you need' }, { status: 400 })
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: result, error: rpcErr } = await supabase.rpc(
      'request_estimate_changes',
      {
        p_work_order_id:      workOrderId,
        p_customer_user_id:   user.id,
        p_changes_requested:  changes_requested.trim(),
      }
    )
    if (rpcErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    const { work_order_number } = result

    // Fetch provider contact
    const { data: wo } = await supabase
      .from('work_orders_secure')
      .select(`
        service_provider_id,
        vehicle:vehicles_secure(plate_number),
        provider:service_providers_secure(email, name, owner_user_id,
          owner:user_profiles_secure!owner_user_id(phone)
        )
      `)
      .eq('id', workOrderId)
      .single()

    const providerEmail = wo?.provider?.email || null
    const providerPhone = wo?.provider?.owner?.phone || null
    const providerName  = wo?.provider?.name || 'Provider'
    const vehiclePlate  = wo?.vehicle?.plate_number || ''

    let emailSent = false
    if (providerEmail) {
      try {
        await sendEstimateChangesRequestedEmail(supabase, {
          to:              providerEmail,
          providerName,
          workOrderNumber: work_order_number,
          vehiclePlate,
          changes:         changes_requested.trim(),
          workOrderId,
        })
        emailSent = true
      } catch (e) {
        console.error('Changes email failed (non-fatal):', e.message)
      }
    }

    let smsSent = false
    if (providerPhone) {
      try {
        const smsResult = await sendEstimateChangesRequestedSms(supabase, {
          phone:           providerPhone,
          providerName,
          workOrderNumber: work_order_number,
          workOrderId,
        })
        smsSent = smsResult.sent
      } catch (e) {
        console.error('Changes SMS failed (non-fatal):', e.message)
      }
    }

    return NextResponse.json({ success: true, work_order_number, email_sent: emailSent, sms_sent: smsSent })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/request-changes error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}