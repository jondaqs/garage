/**
 * POST /api/recommendations/[id]/notify
 * ──────────────────────────────────────
 * Sends the first-time email + SMS to the vehicle owner when a mechanic
 * adds a maintenance recommendation.
 *
 * Called by RecommendationsTab.jsx immediately after a successful
 * add_maintenance_recommendation RPC. Best-effort: failures are logged
 * but never surface to the provider UI.
 *
 * Auth: the caller must be authenticated as provider staff on the work
 * order that owns this recommendation.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient }  from '@supabase/supabase-js'
import { NextResponse }                         from 'next/server'
import { sendMaintenanceReminderEmail }         from '@/lib/email/reminderEmails'
import { sendMaintenanceReminderSms }           from '@/lib/sms/reminderSms'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(request, context) {
  try {
    const { id: recommendationId } = await context.params

    // ── Auth ──────────────────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sc = getServiceClient()

    // ── Load recommendation with vehicle + work order context ────────────
    const { data: rec, error: recErr } = await sc
      .from('maintenance_recommendations')
      .select(`
        id, vehicle_id, note, priority,
        recommended_mileage, recommended_date,
        service:services(name),
        work_order:work_orders(
          id, service_provider_id,
          provider:service_providers(name)
        )
      `)
      .eq('id', recommendationId)
      .maybeSingle()

    if (recErr || !rec) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 })
    }

    // ── Resolve vehicle owner ────────────────────────────────────────────
    const { data: ownership } = await sc
      .from('vehicle_ownership')
      .select('owner_user_id')
      .eq('vehicle_id', rec.vehicle_id)
      .maybeSingle()

    if (!ownership?.owner_user_id) {
      // Company-owned or no owner — nothing to send
      return NextResponse.json({ success: true, skipped: true, reason: 'no_individual_owner' })
    }

    const { data: owner } = await sc
      .from('user_profiles_secure')
      .select('id, first_name, last_name, email, phone')
      .eq('id', ownership.owner_user_id)
      .maybeSingle()

    if (!owner) {
      return NextResponse.json({ success: true, skipped: true, reason: 'owner_not_found' })
    }

    const ownerName = [owner.first_name, owner.last_name].filter(Boolean).join(' ') || 'Customer'

    // ── Resolve vehicle ──────────────────────────────────────────────────
    const { data: vehicle } = await sc
      .from('vehicles_secure')
      .select('id, plate_number, make, model')
      .eq('id', rec.vehicle_id)
      .maybeSingle()

    const serviceName  = rec.service?.name || null
    const providerName = rec.work_order?.provider?.name || null

    const results = { email: null, sms: null }

    // ── Email ────────────────────────────────────────────────────────────
    if (owner.email) {
      try {
        await sendMaintenanceReminderEmail(sc, {
          to:                 owner.email,
          ownerName,
          vehiclePlate:       vehicle?.plate_number || null,
          vehicleMake:        vehicle?.make || null,
          vehicleModel:       vehicle?.model || null,
          reminderTitle:      (serviceName || 'Service') + ' — New Recommendation',
          reminderMessage:    rec.note || 'Your mechanic has added a maintenance recommendation for your vehicle.',
          recommendedDate:    rec.recommended_date || null,
          recommendedMileage: rec.recommended_mileage || null,
          serviceName,
          providerName,
          vehicleId:          rec.vehicle_id,
        })
        results.email = 'sent'
      } catch (e) {
        console.warn(`[recommend-notify ${recommendationId}] email failed:`, e.message)
        results.email = `failed: ${e.message}`
      }
    } else {
      results.email = 'skipped (no email)'
    }

    // ── SMS ──────────────────────────────────────────────────────────────
    if (owner.phone) {
      try {
        await sendMaintenanceReminderSms(sc, {
          phone:              owner.phone,
          ownerName,
          vehiclePlate:       vehicle?.plate_number || null,
          reminderTitle:      (serviceName || 'Service') + ' — New Recommendation',
          recommendedDate:    rec.recommended_date || null,
          recommendedMileage: rec.recommended_mileage || null,
          vehicleId:          rec.vehicle_id,
        })
        results.sms = 'sent'
      } catch (e) {
        console.warn(`[recommend-notify ${recommendationId}] sms failed:`, e.message)
        results.sms = `failed: ${e.message}`
      }
    } else {
      results.sms = 'skipped (no phone)'
    }

    return NextResponse.json({ success: true, results })

  } catch (err) {
    console.error('[recommend-notify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}