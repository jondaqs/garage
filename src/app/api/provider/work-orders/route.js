// src/app/api/provider/work-orders/route.js
// POST /api/provider/work-orders
// Creates a walk-in work order, then:
//   • sends an invite email + SMS to an UNREGISTERED customer (existing email
//     path preserved verbatim; SMS added alongside it),
//   • sends a "your vehicle is at the garage" email + SMS + in-app notification
//     to a REGISTERED customer (chauffeur-aware: the owner may not be present
//     at drop-off so all three channels are used),
//   • notifies the provider owner + admins (excluding the initiator) when
//     notifyOwnerAndAdmins=true is supplied (member-flow new behaviour).
//
// Auth + can_approve_work gating happens inside the RPC; this layer is thin.

import { createClient }                          from '@/lib/supabase/server'
import { createClient as createServiceClient }   from '@supabase/supabase-js'
import { NextResponse }                          from 'next/server'
import { sendWalkInCreatedEmail, sendWalkInOwnerEmail, sendWalkInFleetEmail } from '@/lib/email/walkInEmails'
import { sendWalkInCreatedSms, sendWalkInInviteSms, sendWalkInOwnerSms, sendWalkInFleetSms } from '@/lib/sms/walkInSms'
import { piiHmacRaw } from '@/lib/pii'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const ADMIN_ROLES = ['service_provider_owner', 'admin']

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body     = await request.json()

    const {
      // vehicle
      plate_number,
      make, model, year, color, vin,
      // owner (known)
      owner_user_id,
      owner_company_id,
      // unregistered owner
      walk_in_owner_name,
      walk_in_owner_phone,
      walk_in_owner_email,
      // work order
      problem_description,
      priority,
      shop_id,
      initial_mileage,
      // ── NEW ─────────────────────────────────────────────────────────
      providerId,               // explicit provider scope (member flow)
      notifyOwnerAndAdmins,     // fan-out to owner + admins (member flow default true)
    } = body

    if (!plate_number?.trim()) {
      return NextResponse.json({ error: 'Plate number is required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Call the SECURITY DEFINER function ────────────────────────────
    const { data: result, error: rpcError } = await supabase.rpc(
      'create_walk_in_work_order',
      {
        p_provider_user_id:    user.id,
        p_plate_number:        plate_number.trim().toUpperCase(),
        p_make:                make   || null,
        p_model:               model  || null,
        p_year:                year   ? parseInt(year) : null,
        p_color:               color  || null,
        p_vin:                 vin    || null,
        p_owner_user_id:       owner_user_id    || null,
        p_owner_company_id:    owner_company_id || null,
        p_walk_in_owner_name:  walk_in_owner_name  || null,
        p_walk_in_owner_phone: walk_in_owner_phone || null,
        p_walk_in_owner_email: walk_in_owner_email || null,
        p_problem_description: problem_description || null,
        p_priority:            priority || 'normal',
        p_shop_id:             shop_id  || null,
        p_initial_mileage:     initial_mileage ? parseInt(initial_mileage) : null,
        p_provider_id:         providerId || null,    // ← NEW
      }
    )

    if (rpcError) {
      console.error('create_walk_in_work_order RPC error:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }
    if (!result.success) {
      const status = (result.error || '').toLowerCase().includes('permission') ? 403 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    // ── Fan-out notifications to owner + admins ───────────────────────
    // We do this even for the legacy provider flow when the caller is the
    // owner — the helper itself excludes the initiator, so the owner won't
    // notify themselves. The new member flow opts in via notifyOwnerAndAdmins.
    //
    // Important: we MUST await this. In Vercel / Lambda serverless functions,
    // any unawaited promise is dropped the moment the response is sent.
    // Internally each helper uses Promise.allSettled across recipients, so
    // a single bad email doesn't block the others.
    const shouldNotify =
      notifyOwnerAndAdmins === undefined ? true : !!notifyOwnerAndAdmins

    const backgroundTasks = []

    if (shouldNotify) {
      backgroundTasks.push(
        notifyOwnerAndAdminsBackground({
          providerId:         result.service_provider_id,
          workOrderId:        result.work_order_id,
          workOrderNumber:    result.work_order_number,
          initiatorProfileId: result.initiator_profile_id,
          plateNumber:        plate_number.trim().toUpperCase(),
          problemDescription: problem_description,
          priority:           priority || 'normal',
          shopId:             shop_id,
          walkInOwner: {
            name:  walk_in_owner_name,
            phone: walk_in_owner_phone,
            email: walk_in_owner_email,
          },
          registeredOwner: {
            userId:    owner_user_id,
            companyId: owner_company_id,
          },
        }).catch(e =>
          console.error('[walk-in] owner/admin fan-out failed (non-fatal):', e.message)
        )
      )
    }

    // ── Walk-in invitation email (existing behaviour) ─────────────────
    if (result.invitation_id && walk_in_owner_email) {
      try {
        await sendWalkInInviteEmail({
          toEmail:          walk_in_owner_email,
          ownerName:        walk_in_owner_name,
          workOrderNumber:  result.work_order_number,
          plateNumber:      plate_number.trim().toUpperCase(),
          inviteToken:      result.invitation_token,
          providerUserId:   user.id,
          supabase,
        })
      } catch (emailErr) {
        console.error('Walk-in invite email failed (non-fatal):', emailErr.message)
        // Don't early-return — we still want to send the SMS path and notify
        // owner/admins. Just flag the failure in the response.
        result.email_warning = 'Work order created but invitation email failed to send. You can resend from the work order page.'
      }
    }

    // ── Customer comms ────────────────────────────────────────────────
    // Same awaited pattern as the owner/admin fan-out above.
    backgroundTasks.push(
      notifyCustomerBackground({
        result,
        walkInOwner: {
          name:  walk_in_owner_name,
          phone: walk_in_owner_phone,
          email: walk_in_owner_email,
        },
        registeredOwnerUserId:    owner_user_id,
        registeredOwnerCompanyId: owner_company_id,
        plateNumber:              plate_number.trim().toUpperCase(),
        problemDescription:       problem_description,
        priority:                 priority || 'normal',
        shopId:                   shop_id,
      }).catch(e =>
        console.error('[walk-in] customer comms failed (non-fatal):', e.message)
      )
    )

    // Await all comms together so they actually run in serverless.
    // Each one already swallows its own errors via .catch() so this
    // resolves cleanly even on partial failures.
    await Promise.all(backgroundTasks)

    return NextResponse.json({
      ...result,
      email_sent:        !!result.invitation_id && !result.email_warning,
      customer_notified: !!(walk_in_owner_email || walk_in_owner_phone || owner_user_id || owner_company_id),
    })

  } catch (err) {
    console.error('POST /api/provider/work-orders error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Owner + admin fan-out ──────────────────────────────────────────────────
async function notifyOwnerAndAdminsBackground({
  providerId, workOrderId, workOrderNumber, initiatorProfileId,
  plateNumber, problemDescription, priority, shopId, walkInOwner, registeredOwner,
}) {
  const sc = getServiceClient()

  // 1. Resolve provider + initiator + owner + admins + shop + vehicle ───
  const plateIdx = await piiHmacRaw(sc, plateNumber)
  const [
    { data: provider },
    { data: initiator },
    { data: ownerProfile },
    { data: admins },
    { data: shop },
    { data: vehicle },
  ] = await Promise.all([
    sc.from('service_providers_secure')
      .select('id, name, owner_user_id')
      .eq('id', providerId).maybeSingle(),
    sc.from('user_profiles_secure')
      .select('id, first_name, last_name')
      .eq('id', initiatorProfileId).maybeSingle(),
    // owner profile — we'll look it up via provider.owner_user_id below
    Promise.resolve({ data: null }),
    sc.from('service_provider_users')
      .select(`
        role, user_id, is_active,
        user:user_profiles_secure!service_provider_users_user_id_fkey(
          id, first_name, last_name, email, phone
        )
      `)
      .eq('service_provider_id', providerId)
      .eq('is_active', true)
      .in('role', ADMIN_ROLES),
    shopId ? sc.from('shops_secure').select('name, town').eq('id', shopId).maybeSingle()
           : Promise.resolve({ data: null }),
    sc.from('vehicles_secure').select('plate_number, make, model').eq('plate_number_idx', plateIdx).maybeSingle(),
  ])

  // Look up the owner profile separately
  const { data: ownerProf } = provider?.owner_user_id
    ? await sc.from('user_profiles_secure')
        .select('id, first_name, last_name, email, phone')
        .eq('id', provider.owner_user_id).maybeSingle()
    : { data: null }

  // Walk-in initiator's role on this provider (for the email subtext)
  let initiatorRole = null
  if (initiatorProfileId) {
    if (provider?.owner_user_id === initiatorProfileId) {
      initiatorRole = 'owner'
    } else {
      const { data: spu } = await sc.from('service_provider_users')
        .select('role').eq('service_provider_id', providerId)
        .eq('user_id', initiatorProfileId).eq('is_active', true).maybeSingle()
      const { data: mech } = await sc.from('mechanics')
        .select('role').eq('service_provider_id', providerId)
        .eq('user_id', initiatorProfileId).eq('is_active', true).maybeSingle()
      initiatorRole = (spu?.role || mech?.role || 'member').replace(/_/g, ' ')
    }
  }

  // Look up registered customer/company name if applicable
  let ownerInfo = walkInOwner?.name
    ? `Walk-in: ${walkInOwner.name}${walkInOwner.phone ? ` · ${walkInOwner.phone}` : ''}`
    : walkInOwner?.phone
      ? `Walk-in: ${walkInOwner.phone}`
      : null
  if (!ownerInfo && registeredOwner?.userId) {
    const { data: u } = await sc.from('user_profiles_secure')
      .select('first_name, last_name')
      .eq('id', registeredOwner.userId).maybeSingle()
    if (u) ownerInfo = `Registered: ${[u.first_name, u.last_name].filter(Boolean).join(' ')}`
  }
  if (!ownerInfo && registeredOwner?.companyId) {
    const { data: c } = await sc.from('company_profiles_secure')
      .select('name').eq('id', registeredOwner.companyId).maybeSingle()
    if (c) ownerInfo = `Fleet: ${c.name}`
  }
  if (!ownerInfo) ownerInfo = 'Unknown / unregistered'

  // 2. Build recipient list — owner + admins, dedup, exclude initiator ──
  const recipientMap = new Map()  // keyed by user_profiles.id

  if (ownerProf && ownerProf.id !== initiatorProfileId) {
    recipientMap.set(ownerProf.id, {
      name:  [ownerProf.first_name, ownerProf.last_name].filter(Boolean).join(' ') || 'Owner',
      email: ownerProf.email,
      phone: ownerProf.phone,
      role:  'Owner',
      isOwner: true,
    })
  }
  for (const a of (admins || [])) {
    const u = a.user
    if (!u || u.id === initiatorProfileId) continue
    if (recipientMap.has(u.id)) continue
    recipientMap.set(u.id, {
      name:  [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Admin',
      email: u.email,
      phone: u.phone,
      role:  a.role === 'service_provider_owner' ? 'Owner' : 'Admin',
      isOwner: a.role === 'service_provider_owner',
    })
  }

  if (recipientMap.size === 0) {
    console.log(`[walk-in ${workOrderNumber}] no recipients — initiator may be the only admin`)
    return
  }

  const initiatorName = initiator
    ? `${initiator.first_name || ''} ${initiator.last_name || ''}`.trim() || 'A team member'
    : 'A team member'

  const sharedArgs = {
    workOrderNumber,
    workOrderId,
    vehiclePlate: vehicle?.plate_number || plateNumber,
    vehicleMake:  vehicle?.make         || '',
    vehicleModel: vehicle?.model        || '',
    ownerInfo,
    initiatorName,
    initiatorRole,
    priority,
    problemDescription,
    shopName: shop?.name || null,
    shopTown: shop?.town || null,
    createdAt: new Date().toISOString(),
  }

  // 3. In-app notifications (single insert) ─────────────────────────────
  try {
    const notificationRows = Array.from(recipientMap.entries()).map(([profileId, r]) => ({
      user_id:            profileId,
      recipient_user_id:  profileId,
      type:               'walk_in_wo_created',
      notification_type:  'walk_in_wo_created',
      title:              'New Walk-In Work Order',
      message: `${initiatorName} created walk-in work order ${workOrderNumber} for ${sharedArgs.vehiclePlate}.`,
      reference_table:    'work_orders',
      reference_id:       workOrderId,
      reference_type:     'work_order',
      is_read:            false,
    }))
    if (notificationRows.length > 0) {
      await sc.from('notifications').insert(notificationRows)
    }
  } catch (e) {
    console.warn(`[walk-in ${workOrderNumber}] in-app notification failed:`, e.message)
  }

  // 4. Email + SMS fan-out (parallel, best-effort) ──────────────────────
  const tasks = []
  for (const [, r] of recipientMap) {
    if (r.email) {
      tasks.push(
        sendWalkInCreatedEmail(sc, {
          to:              r.email,
          recipientName:   r.name,
          recipientRole:   r.role,
          recipientIsOwner: r.isOwner,
          ...sharedArgs,
        })
          .then(() => console.log(`[walk-in ${workOrderNumber}] ✓ email → ${r.email}`))
          .catch(e => console.error(`[walk-in ${workOrderNumber}] ✗ email → ${r.email}: ${e.message}`))
      )
    }
    if (r.phone) {
      tasks.push(
        sendWalkInCreatedSms(sc, {
          phone:           r.phone,
          recipientName:   r.name,
          workOrderNumber,
          workOrderId,
          vehiclePlate:    sharedArgs.vehiclePlate,
          initiatorName,
        })
          .then(() => console.log(`[walk-in ${workOrderNumber}] ✓ SMS → ${r.phone}`))
          .catch(e => console.error(`[walk-in ${workOrderNumber}] ✗ SMS → ${r.phone}: ${e.message}`))
      )
    }
  }
  await Promise.allSettled(tasks)
}

// ─── Customer comms fan-out ────────────────────────────────────────────────
// Three paths:
//   • REGISTERED individual owner (owner_user_id set) → email + SMS + in-app
//     notification to the owner. The owner may have sent a chauffeur to the
//     garage, so all three channels are used — in-app alone may go unseen.
//   • UNREGISTERED owner with phone (with or without email) → invite SMS
//     using the same invitation token the email path uses. Email path is
//     handled separately above (preserves the original Mailjet-based queue).
//   • REGISTERED company fleet (owner_company_id set) → email + SMS + in-app
//     to the company owner AND every active fleet manager / admin. Same
//     "chauffeur scenario" rationale; mirrors the pattern used by the
//     bookings notify and checkout-notify flows.
async function notifyCustomerBackground({
  result,
  walkInOwner,
  registeredOwnerUserId,
  registeredOwnerCompanyId,
  plateNumber,
  problemDescription,
  priority,
  shopId,
}) {
  const sc = getServiceClient()
  const workOrderNumber = result.work_order_number
  const workOrderId     = result.work_order_id

  // Common context: provider name + shop + vehicle
  const plateIdx2 = await piiHmacRaw(sc, plateNumber)
  const [
    { data: provider },
    { data: shop },
    { data: vehicle },
  ] = await Promise.all([
    sc.from('service_providers_secure').select('name')
      .eq('id', result.service_provider_id).maybeSingle(),
    shopId ? sc.from('shops_secure').select('name, town').eq('id', shopId).maybeSingle()
           : Promise.resolve({ data: null }),
    sc.from('vehicles_secure').select('plate_number, make, model')
      .eq('plate_number_idx', plateIdx2).maybeSingle(),
  ])

  const sharedArgs = {
    workOrderNumber,
    workOrderId,
    vehiclePlate: vehicle?.plate_number || plateNumber,
    vehicleMake:  vehicle?.make         || '',
    vehicleModel: vehicle?.model        || '',
    providerName: provider?.name        || '—',
    shopName:     shop?.name            || null,
    shopTown:     shop?.town            || null,
    problemDescription,
    priority,
    createdAt:    new Date().toISOString(),
  }

  // ── Path A: Registered owner (has a user account) ────────────────────
  if (registeredOwnerUserId) {
    const { data: customer } = await sc.from('user_profiles_secure')
      .select('id, first_name, last_name, email, phone')
      .eq('id', registeredOwnerUserId).maybeSingle()

    if (!customer) {
      console.warn(`[walk-in ${workOrderNumber}] registered owner ${registeredOwnerUserId} not found`)
      return
    }

    const customerName = [customer.first_name, customer.last_name]
      .filter(Boolean).join(' ') || 'Customer'

    // In-app notification
    try {
      await sc.from('notifications').insert({
        user_id:           customer.id,
        recipient_user_id: customer.id,
        type:              'walk_in_wo_opened',
        notification_type: 'walk_in_wo_opened',
        title:             'Your vehicle is at the garage',
        message: `Your vehicle ${sharedArgs.vehiclePlate} has been brought in to ${sharedArgs.providerName}. `
               + `Work order ${workOrderNumber} is now open.`,
        reference_table: 'work_orders',
        reference_id:    workOrderId,
        reference_type:  'work_order',
        is_read:         false,
      })
    } catch (e) {
      console.warn(`[walk-in ${workOrderNumber}] customer in-app notification failed:`, e.message)
    }

    // Email + SMS (parallel, best-effort)
    const tasks = []
    if (customer.email) {
      tasks.push(
        sendWalkInOwnerEmail(sc, {
          to: customer.email, customerName, ...sharedArgs,
        })
          .then(() => console.log(`[walk-in ${workOrderNumber}] ✓ customer email → ${customer.email}`))
          .catch(e => console.error(`[walk-in ${workOrderNumber}] ✗ customer email: ${e.message}`))
      )
    }
    if (customer.phone) {
      tasks.push(
        sendWalkInOwnerSms(sc, {
          phone: customer.phone,
          customerName,
          workOrderNumber,
          workOrderId,
          vehiclePlate: sharedArgs.vehiclePlate,
          providerName: sharedArgs.providerName,
        })
          .then(() => console.log(`[walk-in ${workOrderNumber}] ✓ customer SMS → ${customer.phone}`))
          .catch(e => console.error(`[walk-in ${workOrderNumber}] ✗ customer SMS: ${e.message}`))
      )
    }
    await Promise.allSettled(tasks)
    return
  }

  // ── Path C: Company fleet (owner_company_id set) ─────────────────────
  // Fan out to: company owner + every active fleet manager / admin. Same
  // pattern as the bookings notify and checkout-notify flows. Dedup by
  // user_id since the owner is usually also a company_users row.
  if (registeredOwnerCompanyId) {
    const [
      { data: company },
      { data: fleetMembers },
    ] = await Promise.all([
      sc.from('company_profiles_secure')
        .select('id, name, owner_user_id')
        .eq('id', registeredOwnerCompanyId).maybeSingle(),
      sc.from('company_users')
        .select('user_id, is_admin, can_manage_fleet')
        .eq('company_id', registeredOwnerCompanyId)
        .eq('is_active', true),
    ])

    if (!company) {
      console.warn(`[walk-in ${workOrderNumber}] company ${registeredOwnerCompanyId} not found`)
      return
    }

    // Build dedup'd recipient id set: owner + qualifying members
    const recipientIds = new Set()
    if (company.owner_user_id) recipientIds.add(company.owner_user_id)
    for (const m of (fleetMembers || [])) {
      if (m.is_admin || m.can_manage_fleet) recipientIds.add(m.user_id)
    }
    if (recipientIds.size === 0) {
      console.log(`[walk-in ${workOrderNumber}] no fleet recipients for company ${company.name}`)
      return
    }

    // Fetch profile rows for the contact channels in one query
    const { data: profiles } = await sc.from('user_profiles_secure')
      .select('id, first_name, last_name, email, phone')
      .in('id', Array.from(recipientIds))

    // In-app notifications (batched)
    try {
      const notificationRows = (profiles || []).map(p => ({
        user_id:           p.id,
        recipient_user_id: p.id,
        type:              'walk_in_wo_opened',
        notification_type: 'walk_in_wo_opened',
        title:             `Fleet vehicle ${sharedArgs.vehiclePlate} at the garage`,
        message: `${company.name || 'A fleet'} vehicle ${sharedArgs.vehiclePlate} has been brought in `
               + `to ${sharedArgs.providerName}. Work order ${workOrderNumber} is now open.`,
        reference_table: 'work_orders',
        reference_id:    workOrderId,
        reference_type:  'work_order',
        is_read:         false,
      }))
      if (notificationRows.length > 0) {
        await sc.from('notifications').insert(notificationRows)
      }
    } catch (e) {
      console.warn(`[walk-in ${workOrderNumber}] fleet in-app notifications failed:`, e.message)
    }

    // Email + SMS fan-out (parallel, best-effort)
    const tasks = []
    for (const p of (profiles || [])) {
      const recipientName = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Fleet Manager'
      const recipientRole = p.id === company.owner_user_id ? 'Company Owner' : 'Fleet Manager'

      if (p.email) {
        tasks.push(
          sendWalkInFleetEmail(sc, {
            to:            p.email,
            recipientName,
            recipientRole,
            companyName:   company.name,
            ...sharedArgs,
          })
            .then(() => console.log(`[walk-in ${workOrderNumber}] ✓ fleet email → ${p.email}`))
            .catch(e => console.error(`[walk-in ${workOrderNumber}] ✗ fleet email → ${p.email}: ${e.message}`))
        )
      }
      if (p.phone) {
        tasks.push(
          sendWalkInFleetSms(sc, {
            phone:           p.phone,
            recipientName,
            companyName:     company.name,
            workOrderNumber,
            workOrderId,
            vehiclePlate:    sharedArgs.vehiclePlate,
            providerName:    sharedArgs.providerName,
          })
            .then(() => console.log(`[walk-in ${workOrderNumber}] ✓ fleet SMS → ${p.phone}`))
            .catch(e => console.error(`[walk-in ${workOrderNumber}] ✗ fleet SMS → ${p.phone}: ${e.message}`))
        )
      }
    }
    await Promise.allSettled(tasks)
    return
  }

  // ── Path B: Unregistered owner — invite SMS (companion to invite email) ─
  // The invite email is handled in the main handler (preserves Mailjet
  // queue semantics). We only handle the SMS leg here. Requires an invite
  // token (only created when an email was supplied at intake), AND a phone.
  if (walkInOwner?.phone && result.invitation_token) {
    try {
      await sendWalkInInviteSms(sc, {
        phone:           walkInOwner.phone,
        customerName:    walkInOwner.name,
        workOrderNumber,
        workOrderId,
        vehiclePlate:    sharedArgs.vehiclePlate,
        providerName:    sharedArgs.providerName,
        inviteToken:     result.invitation_token,
      })
      console.log(`[walk-in ${workOrderNumber}] ✓ invite SMS → ${walkInOwner.phone}`)
    } catch (e) {
      console.error(`[walk-in ${workOrderNumber}] ✗ invite SMS: ${e.message}`)
    }
  } else if (walkInOwner?.phone && !result.invitation_token) {
    // Edge case: a phone was given but no email → the RPC did NOT create an
    // invitation (current behaviour). We have no token to send. Log so the
    // gap is visible; the provider can still hand the customer a physical
    // contact card or follow up manually.
    console.log(
      `[walk-in ${workOrderNumber}] phone-only walk-in: no invite token created, ` +
      `SMS skipped. (Provider should follow up directly.)`
    )
  }
}

// ─── Walk-in invitation email helper (existing — unchanged) ─────────────────
async function sendWalkInInviteEmail({
  toEmail, ownerName, workOrderNumber, plateNumber, inviteToken, providerUserId, supabase
}) {
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'
  const mailjetApiKey  = process.env.MAILJET_API_KEY
  const mailjetSecret  = process.env.MAILJET_SECRET_KEY
  const fromEmail      = process.env.MAILJET_FROM_EMAIL || 'noreply@survlinx.com'
  const fromName       = process.env.MAILJET_FROM_NAME  || 'Carfix-Connect'

  if (!mailjetApiKey || !mailjetSecret) {
    await supabase.from('email_queue').insert({
      recipient_email: toEmail,
      subject:         `Your vehicle (${plateNumber}) is being serviced — register to track it`,
      body_html:       buildInviteEmailHtml({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }),
      body_text:       buildInviteEmailText({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }),
      status:          'failed',
      error_message:   'Mailjet credentials not configured',
    })
    throw new Error('Mailjet credentials not configured')
  }

  const html  = buildInviteEmailHtml({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl })
  const text  = buildInviteEmailText({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl })
  const subject = `Your vehicle (${plateNumber}) is at the garage — track it on Carfix-Connect`

  let queuedId = null
  try {
    const { data: queued } = await supabase.from('email_queue').insert({
      recipient_email: toEmail,
      subject,
      body_html: html,
      body_text: text,
      status: 'pending',
    }).select('id').single()
    queuedId = queued?.id
  } catch {}

  const auth = Buffer.from(`${mailjetApiKey}:${mailjetSecret}`).toString('base64')

  const resp = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      Messages: [{
        From:     { Email: fromEmail, Name: fromName },
        To:       [{ Email: toEmail, Name: ownerName || toEmail.split('@')[0] }],
        Subject:  subject,
        TextPart: text,
        HTMLPart: html,
      }],
    }),
  })

  if (!resp.ok) {
    const errData = await resp.json()
    if (queuedId) {
      await supabase.from('email_queue').update({
        status: 'failed',
        error_message: JSON.stringify(errData),
      }).eq('id', queuedId)
    }
    throw new Error(`Mailjet error: ${JSON.stringify(errData)}`)
  }

  if (queuedId) {
    await supabase.from('email_queue').update({
      status: 'sent', sent_at: new Date().toISOString()
    }).eq('id', queuedId)
  }
}

function buildInviteEmailHtml({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }) {
  const registerUrl = `${appUrl}/auth/signup?invite_token=${inviteToken}&ref=walkin`
  const greeting    = ownerName ? `Hello ${ownerName},` : 'Hello,'
  return `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:20px;color:#333}
  .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}
  .header{background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);color:#fff;padding:40px 30px;text-align:center}
  .body{padding:40px 30px}
  .btn{display:inline-block;background:#16a34a;color:#fff!important;padding:16px 40px;text-decoration:none;border-radius:8px;margin:24px 0;font-weight:600;font-size:16px}
  .info{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0}
  .footer{text-align:center;padding:24px;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb}
  .wo-badge{display:inline-block;background:#dbeafe;color:#1e40af;padding:4px 12px;border-radius:20px;font-weight:600;font-size:14px;margin:4px 0}
</style>
</head><body>
<div class="wrap">
  <div class="header">
    <h1 style="margin:0;font-size:24px">🔧 Your Vehicle is at the Garage</h1>
    <p style="margin:10px 0 0;opacity:.9">Track your service on Carfix-Connect</p>
  </div>
  <div class="body">
    <p style="font-size:16px">${greeting}</p>
    <p>Your vehicle with plate number <strong>${plateNumber}</strong> has been brought in for service.
    A work order has been created:</p>
    <div class="info">
      <p style="margin:0 0 8px"><strong>Work Order:</strong> <span class="wo-badge">${workOrderNumber}</span></p>
      <p style="margin:0"><strong>Vehicle Plate:</strong> ${plateNumber}</p>
    </div>
    <p>To <strong>view service progress, approve work estimates, and receive updates</strong>,
    create your free Carfix-Connect account using this link:</p>
    <div style="text-align:center">
      <a href="${registerUrl}" class="btn">Create My Account &amp; Track Service</a>
    </div>
    <p style="font-size:13px;color:#6b7280">
      ⏰ This invitation link expires in 7 days.<br>
      After registering, the vehicle and work order will automatically appear in your dashboard.
    </p>
    <p style="font-size:13px;color:#6b7280">
      Already have a Carfix-Connect account?
      <a href="${appUrl}/auth/login" style="color:#16a34a">Log in here</a> —
      the work order will be linked to your vehicle.
    </p>
  </div>
  <div class="footer">
    <p>If this wasn't your vehicle or you have questions, please ignore this email.</p>
    <p style="font-size:12px;color:#9ca3af">Carfix-Connect — Vehicle Service Platform</p>
  </div>
</div>
</body></html>`
}

function buildInviteEmailText({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }) {
  const registerUrl = `${appUrl}/auth/signup?invite_token=${inviteToken}&ref=walkin`
  return `
${ownerName ? `Hello ${ownerName},` : 'Hello,'}

Your vehicle (${plateNumber}) has been brought in for service.

Work Order: ${workOrderNumber}
Vehicle:    ${plateNumber}

To track your service progress, approve work estimates, and receive updates,
create your free Carfix-Connect account here:

${registerUrl}

This invitation expires in 7 days.

Already have an account? Log in at ${appUrl}/auth/login

---
Carfix-Connect — Vehicle Service Platform
`
}