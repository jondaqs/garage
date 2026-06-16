/**
 * POST /api/subscription/custom-plan-notify
 *
 * Called from SaveCustomPlanModal after save_custom_plan RPC succeeds.
 * Notifies the target company/provider owner + admin/accountant members
 * that a custom package is now available for them.
 *
 * Body: {
 *   subscriber_type, target_entity_id, target_entity_name,
 *   tier_name, tier_code, base_monthly_price, packages_created,
 *   batch_id
 * }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const BRAND   = 'GariCare'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildCustomPlanEmailHtml({ recipientName, entityName, tierName, baseMonthlyPrice, packagesCreated, ctaUrl }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Custom Plan Available</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#7c3aed;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#ddd6fe;">Custom Plan Available</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#a78bfa,#7c3aed,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${recipientName || 'there'},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      Great news! A custom subscription plan has been created specifically for <strong>${entityName}</strong>.
      You can now view and subscribe to it from your Browse Plans page.
    </p>
    <div style="background:#faf5ff;border:2px solid #e9d5ff;border-radius:12px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;width:40%;">Plan</td>
          <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${tierName}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;">Base Price</td>
          <td style="padding:6px 0;color:#7c3aed;font-size:15px;font-weight:700;">${baseMonthlyPrice}/mo</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;">Billing Options</td>
          <td style="padding:6px 0;color:#0f172a;font-size:13px;">${packagesCreated} period${packagesCreated !== 1 ? 's' : ''} available</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#7c3aed;color:#fff;
        text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">
        View Plan &amp; Subscribe
      </a>
    </div>
    <p style="margin:12px 0 0;font-size:11px;color:#999;text-align:center">
      This plan was created exclusively for ${entityName}. Log in to browse and subscribe.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      subscriber_type, target_entity_id, target_entity_name,
      tier_name, tier_code, base_monthly_price, packages_created, batch_id
    } = body

    if (!target_entity_id || !subscriber_type) {
      return NextResponse.json({ error: 'subscriber_type and target_entity_id required' }, { status: 400 })
    }

    const sc = getServiceClient()
    const results = { notified: 0, emails_sent: 0, sms_sent: 0 }

    // Determine the subscription page URL for the entity type
    const subPage = subscriber_type === 'company' ? 'company' : 'provider'
    const ctaUrl = `${APP_URL()}/${subPage}/subscription`

    // ── Gather recipient user IDs: owner + admin/accountant staff ──
    const recipientUserIds = new Set()

    if (subscriber_type === 'company') {
      // Company owner
      const { data: company } = await sc
        .from('company_profiles')
        .select('owner_user_id')
        .eq('id', target_entity_id)
        .maybeSingle()
      if (company?.owner_user_id) recipientUserIds.add(company.owner_user_id)

      // Company admin/accountant staff
      const { data: staff } = await sc
        .from('company_users')
        .select('user_id')
        .eq('company_id', target_entity_id)
        .eq('is_active', true)
        .or('is_admin.eq.true,staff_role.eq.accountant')
      for (const s of (staff || [])) recipientUserIds.add(s.user_id)

    } else {
      // Provider owner
      const { data: provider } = await sc
        .from('service_providers')
        .select('owner_user_id')
        .eq('id', target_entity_id)
        .maybeSingle()
      if (provider?.owner_user_id) recipientUserIds.add(provider.owner_user_id)

      // Provider admin/accountant staff
      const { data: staff } = await sc
        .from('service_provider_users')
        .select('user_id')
        .eq('service_provider_id', target_entity_id)
        .eq('is_active', true)
        .in('role', ['service_provider_owner', 'admin', 'accountant'])
      for (const s of (staff || [])) recipientUserIds.add(s.user_id)
    }

    if (recipientUserIds.size === 0) {
      console.warn('[custom-plan-notify] no recipients found for', target_entity_id)
      return NextResponse.json({ success: true, ...results, warning: 'No recipients found' })
    }

    const entityName = target_entity_name || 'your organization'
    const priceDisplay = `${Number(base_monthly_price || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`

    for (const userId of recipientUserIds) {
      // Get profile (decrypted)
      const { data: profile } = await sc
        .from('user_profiles_secure')
        .select('first_name, last_name, email, phone')
        .eq('id', userId)
        .maybeSingle()

      if (!profile) continue

      const displayName = profile.first_name
        ? `${profile.first_name} ${profile.last_name || ''}`.trim()
        : 'there'

      // ── In-app notification ──
      try {
        await sc.from('notifications').insert({
          user_id: userId, recipient_user_id: userId,
          type: 'custom_plan_available', notification_type: 'custom_plan_available',
          title: `Custom Plan Available for ${entityName}`,
          message: `A custom subscription plan "${tier_name}" at ${priceDisplay}/mo has been created for ${entityName}. Browse plans to view and subscribe.`,
          reference_table: 'subscription_packages', reference_id: batch_id || target_entity_id,
          reference_type: 'custom_plan', is_read: false,
        })
        results.notified++
      } catch (e) { console.error('[custom-plan-notify] notification failed:', e.message) }

      // ── Email ──
      const email = profile.email || null
      if (email) {
        try {
          await sendAndQueueEmail(sc, {
            to: [{ Email: email, Name: displayName }],
            subject: `[${BRAND}] Custom Subscription Plan Available for ${entityName}`,
            html: buildCustomPlanEmailHtml({
              recipientName: displayName,
              entityName,
              tierName: tier_name || tier_code,
              baseMonthlyPrice: priceDisplay,
              packagesCreated: packages_created || 0,
              ctaUrl,
            }),
            text: `${BRAND}: A custom subscription plan "${tier_name}" at ${priceDisplay}/mo has been created for ${entityName}. ${packages_created || 0} billing period(s) available. View and subscribe: ${ctaUrl}`,
            referenceTable: 'subscription_packages',
            referenceId: batch_id || target_entity_id,
          })
          results.emails_sent++
        } catch (e) { console.error('[custom-plan-notify] email failed:', e.message) }
      }

      // ── SMS ──
      const phone = normalisePhone(profile.phone)
      if (phone) {
        try {
          const r = await sendAndQueueSms(sc, {
            to: phone, recipientName: displayName,
            message: `${BRAND}: A custom subscription plan has been created for ${entityName} at ${priceDisplay}/mo. Log in to Browse Plans to view and subscribe.`,
            referenceTable: 'subscription_packages',
            referenceId: batch_id || target_entity_id,
          })
          if (r?.sent) results.sms_sent++
        } catch (e) { console.error('[custom-plan-notify] SMS failed:', e.message) }
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error('[custom-plan-notify] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}