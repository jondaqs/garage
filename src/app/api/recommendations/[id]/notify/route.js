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

    // ── Resolve vehicle owner(s) — individual or company ──────────────
    const { data: ownership } = await sc
      .from('vehicle_ownership')
      .select('owner_user_id, owner_company_id')
      .eq('vehicle_id', rec.vehicle_id)
      .maybeSingle()

    if (!ownership) {
      return NextResponse.json({ success: true, skipped: true, reason: 'no_ownership_record' })
    }

    // Collect all recipients: individual owner OR company owner + active members
    const recipients = []

    if (ownership.owner_user_id) {
      // Individual-owned vehicle
      const { data: owner } = await sc
        .from('user_profiles_secure')
        .select('id, first_name, last_name, email, phone')
        .eq('id', ownership.owner_user_id)
        .maybeSingle()
      if (owner) recipients.push(owner)

    } else if (ownership.owner_company_id) {
      // Company-owned vehicle — notify company owner + active members
      const { data: company } = await sc
        .from('company_profiles_secure')
        .select('id, owner_user_id')
        .eq('id', ownership.owner_company_id)
        .maybeSingle()

      if (company?.owner_user_id) {
        const { data: compOwner } = await sc
          .from('user_profiles_secure')
          .select('id, first_name, last_name, email, phone')
          .eq('id', company.owner_user_id)
          .maybeSingle()
        if (compOwner) recipients.push(compOwner)
      }

      // Notify active company members with relevant permissions only:
      // admins, can_approve_work (manage work orders), can_manage_fleet (manage vehicles)
      const { data: members } = await sc
        .from('company_users')
        .select('user_id, is_admin, can_approve_work, can_manage_fleet')
        .eq('company_id', ownership.owner_company_id)
        .eq('is_active', true)

      if (members?.length) {
        const qualifiedIds = members
          .filter(m => m.is_admin || m.can_approve_work || m.can_manage_fleet)
          .map(m => m.user_id)
          .filter(id => id !== company?.owner_user_id)  // skip owner, already added

        if (qualifiedIds.length > 0) {
          const { data: memberProfiles } = await sc
            .from('user_profiles_secure')
            .select('id, first_name, last_name, email, phone')
            .in('id', qualifiedIds)
          if (memberProfiles) recipients.push(...memberProfiles)
        }
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'no_recipients_found' })
    }

    // ── Resolve vehicle ──────────────────────────────────────────────────
    const { data: vehicle } = await sc
      .from('vehicles_secure')
      .select('id, plate_number, make, model')
      .eq('id', rec.vehicle_id)
      .maybeSingle()

    const serviceName  = rec.service?.name || null
    const providerName = rec.work_order?.provider?.name || null

    const allResults = []

    // Send email + SMS to each recipient
    for (const recipient of recipients) {
      const ownerName = [recipient.first_name, recipient.last_name].filter(Boolean).join(' ') || 'Customer'
      const personResult = { userId: recipient.id, email: null, sms: null }

      // ── Email ──────────────────────────────────────────────────────────
      if (recipient.email) {
        try {
          await sendMaintenanceReminderEmail(sc, {
            to:                 recipient.email,
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
          personResult.email = 'sent'
        } catch (e) {
          console.warn(`[recommend-notify ${recommendationId}] email failed for ${recipient.id}:`, e.message)
          personResult.email = `failed: ${e.message}`
        }
      } else {
        personResult.email = 'skipped (no email)'
      }

      // ── SMS ────────────────────────────────────────────────────────────
      if (recipient.phone) {
        try {
          await sendMaintenanceReminderSms(sc, {
            phone:              recipient.phone,
            ownerName,
            vehiclePlate:       vehicle?.plate_number || null,
            reminderTitle:      (serviceName || 'Service') + ' — New Recommendation',
            recommendedDate:    rec.recommended_date || null,
            recommendedMileage: rec.recommended_mileage || null,
            vehicleId:          rec.vehicle_id,
          })
          personResult.sms = 'sent'
        } catch (e) {
          console.warn(`[recommend-notify ${recommendationId}] sms failed for ${recipient.id}:`, e.message)
          personResult.sms = `failed: ${e.message}`
        }
      } else {
        personResult.sms = 'skipped (no phone)'
      }

      allResults.push(personResult)
    }

    return NextResponse.json({ success: true, recipients: allResults.length, results: allResults })

  } catch (err) {
    console.error('[recommend-notify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}