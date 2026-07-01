/**
 * POST /api/subscription/ticket-notify
 *
 * Called client-side after submit_subscription_ticket RPC succeeds.
 * Sends notification to platform admins via email + SMS.
 * Pattern matches /api/subscription/payment-notify exactly.
 *
 * Body: { ticket_id, ticket_number, entity_name, subscriber_type, subject, description }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { commsLimiter } from '@/lib/rateLimiters'

const BRAND   = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildTicketEmailHtml({ adminName, ticketNumber, entityName, subscriberType, subject, description, ctaUrl }) {
  const typeLabel = subscriberType === 'company' ? 'Company' : 'Service Provider'
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Subscription Ticket</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#7c3aed;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#ddd6fe;">Custom Package Request</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#a78bfa,#7c3aed,transparent);"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${adminName || 'Admin'},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      A ${typeLabel.toLowerCase()} has submitted a custom subscription package request. Please review and respond.
    </p>
    <div style="background:#faf5ff;border:2px solid #e9d5ff;border-radius:12px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;width:35%;">Ticket</td>
          <td style="padding:6px 0;color:#7c3aed;font-size:13px;font-weight:700;font-family:monospace;">${ticketNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;">${typeLabel}</td>
          <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${entityName}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;">Subject</td>
          <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${subject}</td>
        </tr>
        ${description ? `<tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;vertical-align:top;">Details</td>
          <td style="padding:6px 0;color:#475569;font-size:13px;line-height:1.5;">${description.substring(0, 300)}${description.length > 300 ? '...' : ''}</td>
        </tr>` : ''}
      </table>
    </div>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#7c3aed;color:#fff;
        text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">
        View Ticket in Dashboard
      </a>
    </div>
    <p style="margin:12px 0 0;font-size:11px;color:#999;text-align:center">Log in to the admin panel to review this request.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { ticket_id, ticket_number, entity_name, subscriber_type, subject, description } = body

    if (!ticket_id || !ticket_number) {
      return NextResponse.json({ error: 'ticket_id and ticket_number required' }, { status: 400 })
    }

    const sc = getServiceClient()
    const typeLabel = subscriber_type === 'company' ? 'Company' : 'Service Provider'
    const ctaUrl = `${APP_URL()}/admin/subscriptions?tab=tickets&ticket=${ticket_id}`
    const results = { notified: 0, emails_sent: 0, sms_sent: 0 }

    // ── Find admin user IDs (same pattern as payment-notify) ──
    const { data: adminUsers } = await sc
      .from('user_roles')
      .select('user_id, user_roles_lookup!inner(code)')
      .in('user_roles_lookup.code', ['platform_admin', 'admin', 'accountant'])

    if (!adminUsers?.length) {
      console.warn('[ticket-notify] no admin users found')
      return NextResponse.json({ success: true, ...results, warning: 'No admin users found' })
    }

    const adminUserIds = [...new Set(adminUsers.map(a => a.user_id))]

    for (const adminId of adminUserIds) {
      // Get admin profile (decrypted via secure view)
      const { data: adminProfile } = await sc
        .from('user_profiles_secure')
        .select('first_name, last_name, email, phone')
        .eq('id', adminId)
        .maybeSingle()

      if (!adminProfile) continue

      const adminDisplayName = adminProfile.first_name
        ? `${adminProfile.first_name} ${adminProfile.last_name || ''}`.trim()
        : 'Admin'

      // ── In-app notification ──
      try {
        await sc.from('notifications').insert({
          user_id: adminId, recipient_user_id: adminId,
          type: 'subscription_ticket', notification_type: 'subscription_ticket',
          title: `New Subscription Ticket \u00b7 ${ticket_number}`,
          message: `${entity_name} (${typeLabel}) submitted a custom package request: "${subject}"`,
          reference_table: 'subscription_tickets', reference_id: ticket_id,
          reference_type: 'subscription_ticket', is_read: false,
        })
        results.notified++
      } catch (e) { console.error('[ticket-notify] notification failed:', e.message) }

      // ── Email ──
      const adminEmail = adminProfile.email || null
      if (adminEmail) {
        try {
          await sendAndQueueEmail(sc, {
            to: [{ Email: adminEmail, Name: adminDisplayName }],
            subject: `[${BRAND}] New Subscription Ticket ${ticket_number} \u2014 ${entity_name}`,
            html: buildTicketEmailHtml({
              adminName: adminDisplayName, ticketNumber: ticket_number,
              entityName: entity_name, subscriberType: subscriber_type,
              subject: subject || 'Custom package request',
              description: description || '', ctaUrl,
            }),
            text: `${BRAND}: ${entity_name} (${typeLabel}) submitted subscription ticket ${ticket_number}: "${subject || 'Custom package request'}". Review: ${ctaUrl}`,
            referenceTable: 'subscription_tickets',
            referenceId: ticket_id,
          })
          results.emails_sent++
        } catch (e) { console.error('[ticket-notify] email failed:', e.message) }
      }

      // ── SMS ──
      const adminPhone = normalisePhone(adminProfile.phone)
      if (adminPhone) {
        try {
          const r = await sendAndQueueSms(sc, {
            to: adminPhone, recipientName: adminDisplayName,
            message: `${BRAND}: New subscription ticket ${ticket_number} from ${entity_name}. Subject: "${(subject || '').substring(0, 60)}". Please review in admin dashboard.`,
            referenceTable: 'subscription_tickets',
            referenceId: ticket_id,
          })
          if (r?.sent) results.sms_sent++
        } catch (e) { console.error('[ticket-notify] SMS failed:', e.message) }
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error('[ticket-notify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}