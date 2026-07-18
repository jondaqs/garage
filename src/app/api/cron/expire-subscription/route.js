/**
 * GET /api/cron/expire-subscriptions
 * ───────────────────────────────────
 * Vercel Cron job — runs daily (6 AM EAT).
 *
 * Three phases, in order:
 *   Phase 1 — 7-day warning:  subscriptions expiring in exactly 7 days
 *   Phase 2 — 1-day warning:  subscriptions expiring tomorrow
 *   Phase 3 — Expire lapsed:  calls expire_lapsed_subscriptions() RPC
 *
 * Duplicate prevention: checks the notifications table for existing
 * 'subscription_expiring_7d' / 'subscription_expiring_1d' entries
 * before sending, so re-runs on the same day are safe.
 *
 * Secured with CRON_SECRET.
 *
 * Response:
 *   { success, warnings_7d, warnings_1d, expired, errors }
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { safeCompare }                         from '@/lib/safeCompare'
import { sendSubscriptionExpiryWarningEmail, sendSubscriptionExpiredEmail } from '@/lib/email/subscriptionEmails'
import { sendSubscriptionExpiryWarningSms, sendSubscriptionExpiredSms }     from '@/lib/sms/subscriptionSms'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Resolve the subscriber's contact info (email, phone, name, type)
 * from subscription_details + user_profiles_secure.
 */
async function resolveSubscriberContact(sc, sub) {
  let email = null, phone = null, notifUserId = null
  const subscriberName = sub.subscriber_name || 'Customer'
  const subscriberType = sub.subscriber_type

  if (sub.user_id) {
    notifUserId = sub.user_id
    const { data: u } = await sc
      .from('user_profiles_secure')
      .select('email, phone')
      .eq('id', sub.user_id)
      .maybeSingle()
    email = u?.email; phone = u?.phone
  } else if (sub.company_id) {
    const { data: cp } = await sc
      .from('company_profiles_secure')
      .select('owner_user_id')
      .eq('id', sub.company_id)
      .maybeSingle()
    notifUserId = cp?.owner_user_id
    if (notifUserId) {
      const { data: u } = await sc
        .from('user_profiles_secure')
        .select('email, phone')
        .eq('id', notifUserId)
        .maybeSingle()
      email = u?.email; phone = u?.phone
    }
  } else if (sub.service_provider_id) {
    const { data: sp } = await sc
      .from('service_providers_secure')
      .select('owner_user_id')
      .eq('id', sub.service_provider_id)
      .maybeSingle()
    notifUserId = sp?.owner_user_id
    if (notifUserId) {
      const { data: u } = await sc
        .from('user_profiles_secure')
        .select('email, phone')
        .eq('id', notifUserId)
        .maybeSingle()
      email = u?.email; phone = u?.phone
    }
  }

  return { email, phone, notifUserId, subscriberName, subscriberType }
}

/**
 * Check if a notification of a given type already exists for a subscription.
 */
async function alreadyNotified(sc, notifUserId, notificationType, subscriptionId) {
  if (!notifUserId) return false
  const { data } = await sc
    .from('notifications')
    .select('id')
    .eq('recipient_user_id', notifUserId)
    .eq('notification_type', notificationType)
    .eq('reference_id', subscriptionId)
    .eq('reference_table', 'subscriptions')
    .limit(1)
    .maybeSingle()
  return !!data
}

/**
 * Send expiry warning (notification + email + SMS) for a subscription.
 */
async function sendExpiryWarning(sc, sub, daysRemaining, notificationType) {
  const contact = await resolveSubscriberContact(sc, sub)
  const results = { notification: null, email: null, sms: null, skipped: false }

  // Check for duplicate notification
  if (await alreadyNotified(sc, contact.notifUserId, notificationType, sub.id)) {
    results.skipped = true
    return results
  }

  const urgency = daysRemaining <= 1
    ? 'Your subscription expires tomorrow'
    : `Your subscription expires in ${daysRemaining} days`

  // 1. In-app notification
  if (contact.notifUserId) {
    try {
      await sc.from('notifications').insert({
        user_id:           contact.notifUserId,
        recipient_user_id: contact.notifUserId,
        type:              notificationType,
        notification_type: notificationType,
        title:             daysRemaining <= 1 ? '⚠️ Subscription Expires Tomorrow' : '📅 Subscription Expiring Soon',
        message:           `${urgency}. Your ${sub.package_name || 'subscription'} plan expires on ${sub.expiry_date}. Renew to avoid interruption.`,
        reference_table:   'subscriptions',
        reference_id:      sub.id,
        reference_type:    'subscription',
        is_read:           false,
      })
      results.notification = 'sent'
    } catch (e) {
      console.warn(`[expire-subs] notification failed for ${sub.id}:`, e.message)
      results.notification = `failed: ${e.message}`
    }
  }

  // 2. Email (best-effort)
  if (contact.email) {
    try {
      await sendSubscriptionExpiryWarningEmail(sc, {
        to:                 contact.email,
        subscriberName:     contact.subscriberName,
        subscriberType:     contact.subscriberType,
        packageName:        sub.package_name,
        expiryDate:         sub.expiry_date,
        daysRemaining,
        subscriptionNumber: sub.subscription_number,
        subscriptionId:     sub.id,
      })
      results.email = 'sent'
    } catch (e) {
      console.warn(`[expire-subs] email failed for ${sub.id}:`, e.message)
      results.email = `failed: ${e.message}`
    }
  }

  // 3. SMS (best-effort)
  if (contact.phone) {
    try {
      await sendSubscriptionExpiryWarningSms(sc, {
        phone:          contact.phone,
        subscriberName: contact.subscriberName,
        packageName:    sub.package_name,
        daysRemaining,
        subscriptionId: sub.id,
      })
      results.sms = 'sent'
    } catch (e) {
      console.warn(`[expire-subs] sms failed for ${sub.id}:`, e.message)
      results.sms = `failed: ${e.message}`
    }
  }

  return results
}


export async function GET(request) {
  try {
    // ── Security ──────────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization')
    if (!safeCompare(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sc = getServiceClient()
    const summary = {
      warnings_7d: { sent: 0, skipped: 0, errors: 0 },
      warnings_1d: { sent: 0, skipped: 0, errors: 0 },
      expired:     { count: 0 },
      errors:      [],
    }

    // ── Phase 1: 7-day warnings ──────────────────────────────────────────
    try {
      const targetDate7 = new Date()
      targetDate7.setDate(targetDate7.getDate() + 7)
      const target7Str = targetDate7.toISOString().split('T')[0]

      const { data: expiring7d } = await sc
        .from('subscription_details')
        .select('id, subscription_number, subscriber_name, subscriber_type, package_name, expiry_date, user_id, company_id, service_provider_id')
        .eq('status_code', 'active')
        .eq('expiry_date', target7Str)

      for (const sub of (expiring7d || [])) {
        try {
          const result = await sendExpiryWarning(sc, sub, 7, 'subscription_expiring_7d')
          if (result.skipped) summary.warnings_7d.skipped++
          else summary.warnings_7d.sent++
        } catch (e) {
          summary.warnings_7d.errors++
          summary.errors.push({ phase: '7d', sub_id: sub.id, error: e.message })
        }
      }
    } catch (e) {
      summary.errors.push({ phase: '7d_query', error: e.message })
    }

    // ── Phase 2: 1-day warnings ──────────────────────────────────────────
    try {
      const targetDate1 = new Date()
      targetDate1.setDate(targetDate1.getDate() + 1)
      const target1Str = targetDate1.toISOString().split('T')[0]

      const { data: expiring1d } = await sc
        .from('subscription_details')
        .select('id, subscription_number, subscriber_name, subscriber_type, package_name, expiry_date, user_id, company_id, service_provider_id')
        .eq('status_code', 'active')
        .eq('expiry_date', target1Str)

      for (const sub of (expiring1d || [])) {
        try {
          const result = await sendExpiryWarning(sc, sub, 1, 'subscription_expiring_1d')
          if (result.skipped) summary.warnings_1d.skipped++
          else summary.warnings_1d.sent++
        } catch (e) {
          summary.warnings_1d.errors++
          summary.errors.push({ phase: '1d', sub_id: sub.id, error: e.message })
        }
      }
    } catch (e) {
      summary.errors.push({ phase: '1d_query', error: e.message })
    }

    // ── Phase 3: Expire lapsed subscriptions ─────────────────────────────
    try {
      const { data, error } = await sc.rpc('expire_lapsed_subscriptions')

      if (error) {
        summary.errors.push({ phase: 'expire', error: error.message })
      } else {
        const result = typeof data === 'string' ? JSON.parse(data) : data

        if (result.success) {
          summary.expired.count = result.expired_count

          // Send expired emails/SMS for each just-expired subscription
          for (const detail of (result.details || [])) {
            try {
              const { data: subRow } = await sc
                .from('subscription_details')
                .select('id, subscription_number, subscriber_name, subscriber_type, package_name, expiry_date, user_id, company_id, service_provider_id')
                .eq('id', detail.subscription_id)
                .maybeSingle()

              if (subRow) {
                const contact = await resolveSubscriberContact(sc, subRow)

                if (contact.email) {
                  await sendSubscriptionExpiredEmail(sc, {
                    to:                 contact.email,
                    subscriberName:     contact.subscriberName,
                    subscriberType:     contact.subscriberType,
                    packageName:        subRow.package_name,
                    expiryDate:         subRow.expiry_date,
                    subscriptionNumber: subRow.subscription_number,
                    subscriptionId:     subRow.id,
                  }).catch(e => console.warn(`[expire-subs] expired email failed:`, e.message))
                }

                if (contact.phone) {
                  await sendSubscriptionExpiredSms(sc, {
                    phone:          contact.phone,
                    subscriberName: contact.subscriberName,
                    packageName:    subRow.package_name,
                    subscriptionId: subRow.id,
                  }).catch(e => console.warn(`[expire-subs] expired sms failed:`, e.message))
                }
              }
            } catch (e) {
              console.warn(`[expire-subs] post-expire comms failed for ${detail.subscription_id}:`, e.message)
            }
          }
        } else {
          summary.errors.push({ phase: 'expire', error: result.error })
        }
      }
    } catch (e) {
      summary.errors.push({ phase: 'expire', error: e.message })
    }

    console.log(
      `[expire-subscriptions] 7d=${summary.warnings_7d.sent} 1d=${summary.warnings_1d.sent} expired=${summary.expired.count}`
    )

    return NextResponse.json({ success: true, ...summary })

  } catch (err) {
    console.error('[expire-subscriptions] fatal error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}