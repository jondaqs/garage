/**
 * GET /api/cron/reminder-scan
 * ───────────────────────────
 * Vercel Cron job that runs daily (8 AM EAT).
 *
 * Finds every active reminder whose scheduled_at ≤ now and whose
 * sent_at IS NULL, then for each:
 *   1. Sends an in-app notification
 *   2. Sends an email  (best-effort)
 *   3. Sends an SMS    (best-effort)
 *   4. Stamps sent_at so it never fires again
 *
 * Secured with CRON_SECRET (same secret used by refresh-exchange-rates).
 *
 * Response:
 *   { success, scanned, sent, skipped, errors, reminders: [...] }
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { safeCompare }                         from '@/lib/safeCompare'
import { sendMaintenanceReminderEmail }        from '@/lib/email/reminderEmails'
import { sendMaintenanceReminderSms }          from '@/lib/sms/reminderSms'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request) {
  try {
    // ── Security: verify Vercel cron secret ──────────────────────────────
    const authHeader = request.headers.get('authorization')
    if (!safeCompare(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sc = getServiceClient()

    // ── Find all due reminders ──────────────────────────────────────────
    const { data: dueReminders, error: qErr } = await sc
      .from('reminders')
      .select(`
        id, vehicle_id, user_id, recommendation_id,
        source_type, reminder_type, trigger_value,
        title, message, scheduled_at, is_active
      `)
      .eq('is_active', true)
      .is('sent_at', null)
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(200)

    if (qErr) {
      console.error('[reminder-scan] query error:', qErr.message)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!dueReminders || dueReminders.length === 0) {
      return NextResponse.json({
        success: true, scanned: 0, sent: 0, skipped: 0, errors: 0, reminders: [],
      })
    }

    // ── Process each reminder ───────────────────────────────────────────
    const results = await Promise.all(dueReminders.map(async (rem) => {
      try {
        // Resolve owner profile (email, phone, name)
        const { data: owner } = await sc
          .from('user_profiles_secure')
          .select('id, first_name, last_name, email, phone')
          .eq('id', rem.user_id)
          .maybeSingle()

        if (!owner) {
          // User doesn't exist or was deactivated — deactivate reminder
          await sc.from('reminders')
            .update({ is_active: false, sent_at: new Date().toISOString() })
            .eq('id', rem.id)
          return { id: rem.id, status: 'skipped', reason: 'owner_not_found' }
        }

        const ownerName = [owner.first_name, owner.last_name].filter(Boolean).join(' ') || 'Customer'

        // Resolve vehicle info
        let vehicle = null
        if (rem.vehicle_id) {
          const { data: v } = await sc
            .from('vehicles_secure')
            .select('id, plate_number, make, model')
            .eq('id', rem.vehicle_id)
            .maybeSingle()
          vehicle = v
        }

        // Resolve recommendation for extra context
        let rec = null, providerName = null, serviceName = null
        if (rem.recommendation_id) {
          const { data: r } = await sc
            .from('maintenance_recommendations')
            .select(`
              id, note, priority, recommended_mileage, recommended_date,
              service:services(name),
              work_order:work_orders(service_provider_id)
            `)
            .eq('id', rem.recommendation_id)
            .maybeSingle()
          rec = r
          serviceName = r?.service?.name || null

          if (r?.work_order?.service_provider_id) {
            const { data: sp } = await sc
              .from('service_providers_secure')
              .select('name')
              .eq('id', r.work_order.service_provider_id)
              .maybeSingle()
            providerName = sp?.name || null
          }
        }

        const commsResults = { notification: null, email: null, sms: null }

        // ── 1. In-app notification ────────────────────────────────────────
        try {
          await sc.from('notifications').insert({
            user_id:           owner.id,
            recipient_user_id: owner.id,
            type:              'service_reminder',
            notification_type: 'service_reminder',
            title:             rem.title || 'Service Reminder',
            message:           rem.message || 'Your vehicle is due for maintenance.',
            reference_table:   'reminders',
            reference_id:      rem.id,
            reference_type:    'reminder',
            is_read:           false,
          })
          commsResults.notification = 'sent'
        } catch (e) {
          console.warn(`[reminder-scan] notification insert failed for ${rem.id}:`, e.message)
          commsResults.notification = `failed: ${e.message}`
        }

        // ── 2. Email (best-effort) ────────────────────────────────────────
        if (owner.email) {
          try {
            await sendMaintenanceReminderEmail(sc, {
              to:                 owner.email,
              ownerName,
              vehiclePlate:       vehicle?.plate_number || null,
              vehicleMake:        vehicle?.make || null,
              vehicleModel:       vehicle?.model || null,
              reminderTitle:      rem.title,
              reminderMessage:    rem.message,
              recommendedDate:    rec?.recommended_date || null,
              recommendedMileage: rec?.recommended_mileage || null,
              serviceName,
              providerName,
              vehicleId:          rem.vehicle_id,
            })
            commsResults.email = 'sent'
          } catch (e) {
            console.warn(`[reminder-scan] email failed for ${rem.id}:`, e.message)
            commsResults.email = `failed: ${e.message}`
          }
        } else {
          commsResults.email = 'skipped (no email)'
        }

        // ── 3. SMS (best-effort) ──────────────────────────────────────────
        if (owner.phone) {
          try {
            await sendMaintenanceReminderSms(sc, {
              phone:              owner.phone,
              ownerName,
              vehiclePlate:       vehicle?.plate_number || null,
              reminderTitle:      rem.title,
              recommendedDate:    rec?.recommended_date || null,
              recommendedMileage: rec?.recommended_mileage || null,
              vehicleId:          rem.vehicle_id,
            })
            commsResults.sms = 'sent'
          } catch (e) {
            console.warn(`[reminder-scan] sms failed for ${rem.id}:`, e.message)
            commsResults.sms = `failed: ${e.message}`
          }
        } else {
          commsResults.sms = 'skipped (no phone)'
        }

        // ── 4. Stamp sent_at (always, even on partial comms failure) ─────
        await sc.from('reminders')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', rem.id)

        return { id: rem.id, status: 'sent', comms: commsResults }

      } catch (err) {
        console.error(`[reminder-scan] error processing ${rem.id}:`, err.message)
        return { id: rem.id, status: 'error', error: err.message }
      }
    }))

    const sent    = results.filter(r => r.status === 'sent').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const errors  = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      success:   true,
      scanned:   dueReminders.length,
      sent,
      skipped,
      errors,
      reminders: results,
    })

  } catch (err) {
    console.error('[reminder-scan] fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}