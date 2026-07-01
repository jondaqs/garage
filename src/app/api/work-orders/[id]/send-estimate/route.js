/**
 * POST /api/work-orders/[id]/send-estimate
 * Provider/accountant/admin triggers estimate approval flow.
 * 1. Calls send_estimate_for_approval() DB function
 * 2. Resolves owner contact via service client (same pattern as booking notify)
 * 3. Sends email + SMS to owner
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendEstimateApprovalEmail }           from '@/lib/email/workOrderEmails'
import { sendEstimateApprovalSms }             from '@/lib/sms/workOrderSms'
import { commsLimiter } from '@/lib/rateLimiters'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(request, { params }) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. DB function ────────────────────────────────────────────────────────
    const { data: result, error: rpcErr } = await supabase.rpc(
      'send_estimate_for_approval',
      { p_work_order_id: workOrderId, p_provider_user_id: user.id }
    )
    if (rpcErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    const { work_order_number, provider_name, estimate, owner } = result

    // ── 2. Resolve owner contact via service client ───────────────────────────
    const sc = getServiceClient()

    let ownerEmail = null
    let ownerPhone = null
    let ownerName  = null

    // Helper: resolve contact from a user_profiles.id
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

    // Case A: registered individual owner returned by RPC
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
      const { data: wo } = await sc
        .from('work_orders_secure')
        .select('vehicle_id')
        .eq('id', workOrderId)
        .maybeSingle()

      if (wo?.vehicle_id) {
        const { data: ownership } = await sc
          .from('vehicle_ownership')
          .select('owner_user_id, owner_company_id')
          .eq('vehicle_id', wo.vehicle_id)
          .maybeSingle()

        if (ownership?.owner_user_id) {
          // Individual owner
          const contact = await resolveProfile(ownership.owner_user_id)
          ownerName  = contact.name
          ownerPhone = contact.phone
          ownerEmail = contact.email
        } else if (ownership?.owner_company_id) {
          // Company fleet — get company owner
          const { data: company } = await sc
            .from('company_profiles_secure')
            .select('owner_user_id')
            .eq('id', ownership.owner_company_id)
            .maybeSingle()
          if (company?.owner_user_id) {
            const contact = await resolveProfile(company.owner_user_id)
            ownerName  = contact.name
            ownerPhone = contact.phone
            ownerEmail = contact.email
          }
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

    // ── 3. Resolve vehicle plate ──────────────────────────────────────────────
    const { data: woData } = await sc
      .from('work_orders_secure')
      .select('vehicle:vehicles_secure!vehicle_id(plate_number)')
      .eq('id', workOrderId)
      .maybeSingle()
    const vehiclePlate = woData?.vehicle?.plate_number || ''

    // ── 4. Send email (non-fatal) ─────────────────────────────────────────────
    let emailSent = false
    if (ownerEmail) {
      try {
        await sendEstimateApprovalEmail(supabase, {
          to:              ownerEmail,
          ownerName,
          workOrderNumber: work_order_number,
          providerName:    provider_name,
          vehiclePlate,
          estimate,
          workOrderId,
        })
        emailSent = true
      } catch (e) {
        console.error('Estimate email failed (non-fatal):', e.message)
      }
    }

    // ── 5. Send SMS (non-fatal) ───────────────────────────────────────────────
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
        smsSent = smsResult?.sent || false
      } catch (e) {
        console.error('Estimate SMS failed (non-fatal):', e.message)
      }
    }

    // ── 6. Notify company members with can_approve_estimates (non-fatal) ──────
    // When the vehicle belongs to a company fleet, the owner alone may not be
    // the person who approves estimates. We also notify every active
    // company_users member that has can_approve_estimates = true (skipping the
    // owner if already notified above).
    let companyMembersNotified = 0
    try {
      // Re-fetch vehicle_id → ownership if not already known
      const { data: woForFleet } = await sc
        .from('work_orders_secure')
        .select('vehicle_id')
        .eq('id', workOrderId)
        .maybeSingle()
      if (woForFleet?.vehicle_id) {
        const { data: ownershipForFleet } = await sc
          .from('vehicle_ownership')
          .select('owner_company_id')
          .eq('vehicle_id', woForFleet.vehicle_id)
          .maybeSingle()

        if (ownershipForFleet?.owner_company_id) {
          const companyId = ownershipForFleet.owner_company_id

          // Get company owner profile id so we can skip them (already notified)
          const { data: companyOwnerRow } = await sc
            .from('company_profiles_secure')
            .select('owner_user_id')
            .eq('id', companyId)
            .maybeSingle()
          const companyOwnerProfileId = companyOwnerRow?.owner_user_id

          // Fetch members with can_approve_estimates
          const { data: approvers } = await sc
            .from('company_users')
            .select(`
              user_id,
              user:user_profiles_secure(id, first_name, last_name, phone, email, auth_user_id)
            `)
            .eq('company_id', companyId)
            .eq('is_active', true)
            .eq('can_approve_estimates', true)

          const seenIds = new Set()
          // Skip company owner — they were already emailed above
          if (companyOwnerProfileId) seenIds.add(companyOwnerProfileId)

          for (const row of approvers || []) {
            const u = row.user
            if (!u || seenIds.has(u.id)) continue
            seenIds.add(u.id)

            const memberName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Team Member'

            // Resolve email — fall back to auth.users if needed
            let memberEmail = u.email || null
            if (!memberEmail && u.auth_user_id) {
              try {
                const { data: au } = await sc.auth.admin.getUserById(u.auth_user_id)
                memberEmail = au?.user?.email || null
              } catch {}
            }

            // Send email
            if (memberEmail) {
              try {
                await sendEstimateApprovalEmail(supabase, {
                  to:              memberEmail,
                  ownerName:       memberName,
                  workOrderNumber: work_order_number,
                  providerName:    provider_name,
                  vehiclePlate,
                  estimate,
                  workOrderId,
                })
                companyMembersNotified++
              } catch (e) {
                console.error(`Estimate email to company member ${u.id} failed:`, e.message)
              }
            }

            // Send SMS
            if (u.phone) {
              try {
                await sendEstimateApprovalSms(supabase, {
                  phone:           u.phone,
                  ownerName:       memberName,
                  workOrderNumber: work_order_number,
                  providerName:    provider_name,
                  estimateTotal:   estimate?.total,
                  workOrderId,
                })
              } catch (e) {
                console.error(`Estimate SMS to company member ${u.id} failed:`, e.message)
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Company member estimate notification (non-fatal):', e.message)
    }

    return NextResponse.json({
      success:           true,
      work_order_number,
      notification_sent: true,
      email_sent:        emailSent,
      sms_sent:          smsSent,
      owner_has_email:   !!ownerEmail,
      owner_has_phone:   !!ownerPhone,
      company_members_notified: companyMembersNotified,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/send-estimate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}