/**
 * POST /api/work-orders/[id]/approve
 * Customer approves the work order estimate.
 */

import { createClient }              from '@/lib/supabase/server'
import { NextResponse }              from 'next/server'
import { sendEstimateApprovedEmail } from '@/lib/email/workOrderEmails'
import { sendEstimateApprovedSms }   from '@/lib/sms/workOrderSms'
import { commsLimiter } from '@/lib/rateLimiters'
import { requireUUID } from '@/lib/validation'

export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params
    if (!requireUUID(workOrderId)) return NextResponse.json({ error: 'Invalid work order ID' }, { status: 400 })
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
    if (rpcErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    const { work_order_number, provider_id, provider_name } = result

    // ── 2. Get customer name for notification ─────────────────────────────
    const { data: customerProfile } = await supabase
      .from('user_profiles_secure')
      .select('first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()
    const customerName = customerProfile
      ? `${customerProfile.first_name} ${customerProfile.last_name}`.trim()
      : 'Customer'

    // ── 3. Fetch all provider staff to notify ─────────────────────────────
    const sc = (() => {
      const { createClient: svcClient } = require('@supabase/supabase-js')
      return svcClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
    })()

    // Get work order details for vehicle plate + total
    const { data: wo } = await supabase
      .from('work_orders_secure')
      .select('total_amount, vehicle:vehicles_secure(plate_number)')
      .eq('id', workOrderId)
      .maybeSingle()

    const vehiclePlate  = wo?.vehicle?.plate_number || ''
    const estimateTotal = wo?.total_amount || 0

    // Collect all recipients: owner + SPU admins/managers/accountants + mechanics with can_approve_work
    const recipients = []
    const seenIds    = new Set()
    const addR = (r) => { if (r?.user_id && !seenIds.has(r.user_id)) { seenIds.add(r.user_id); recipients.push(r) } }

    const { data: spOwner } = await sc
      .from('service_providers_secure')
      .select('owner_user_id, email, user_profiles_secure!owner_user_id(first_name, last_name, email, phone)')
      .eq('id', provider_id).maybeSingle()
    if (spOwner?.owner_user_id) {
      addR({
        user_id:    spOwner.owner_user_id,
        first_name: spOwner.user_profiles?.first_name,
        last_name:  spOwner.user_profiles?.last_name,
        email:      spOwner.user_profiles?.email || spOwner.email,
        phone:      spOwner.user_profiles?.phone,
      })
    }

    const { data: spuList } = await sc
      .from('service_provider_users')
      .select('user_id, user_profiles_secure!user_id(first_name, last_name, email, phone)')
      .eq('service_provider_id', provider_id).eq('is_active', true)
      .in('role', ['admin', 'manager', 'accountant'])
    for (const s of spuList || []) {
      addR({ user_id: s.user_id, first_name: s.user_profiles?.first_name, last_name: s.user_profiles?.last_name, email: s.user_profiles?.email, phone: s.user_profiles?.phone })
    }

    const { data: mechList } = await sc
      .from('mechanics')
      .select('user_id, user_profiles_secure!user_id(first_name, last_name, email, phone)')
      .eq('service_provider_id', provider_id).eq('is_active', true).eq('can_approve_work', true)
    for (const m of mechList || []) {
      addR({ user_id: m.user_id, first_name: m.user_profiles?.first_name, last_name: m.user_profiles?.last_name, email: m.user_profiles?.email, phone: m.user_profiles?.phone })
    }

    // ── 4. Send email + SMS to all recipients ────────────────────────────
    let emailsSent = 0, smsSent = 0
    for (const r of recipients) {
      if (r.email) {
        try {
          await sendEstimateApprovedEmail(supabase, {
            to:              r.email,
            providerName:    provider_name,
            workOrderNumber: work_order_number,
            customerName,
            vehiclePlate,
            estimateTotal,
            workOrderId,
          })
          emailsSent++
        } catch (e) { console.error('Approved email failed (non-fatal):', e.message) }
      }
      if (r.phone) {
        try {
          const smsResult = await sendEstimateApprovedSms(supabase, {
            phone:           r.phone,
            providerName:    provider_name,
            workOrderNumber: work_order_number,
            vehiclePlate,
            estimateTotal,
            workOrderId,
          })
          if (smsResult?.sent) smsSent++
        } catch (e) { console.error('Approved SMS failed (non-fatal):', e.message) }
      }
    }

    return NextResponse.json({
      success:          true,
      work_order_number,
      email_sent:       emailsSent > 0,
      emails_sent:      emailsSent,
      sms_sent:         smsSent,
    })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/approve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}