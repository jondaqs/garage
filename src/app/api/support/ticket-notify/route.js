/**
 * POST /api/support/ticket-notify
 *
 * Called client-side after submit_support_ticket RPC succeeds.
 * 1. Fetches the routing email for this priority level
 * 2. Sends email to the routing address (support team)
 * 3. Sends email + SMS to platform admins
 * 4. Sends confirmation email to the submitter
 *
 * Body: { ticket_id, ticket_number, priority_code, priority_label,
 *         category, subject, description, subscriber_type, entity_name }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const BRAND   = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const PRIORITY_COLORS = {
  p1_critical: '#dc2626',
  p2_high:     '#ea580c',
  p3_medium:   '#ca8a04',
  p4_standard: '#2563eb',
  p5_basic:    '#6b7280',
}

function buildSupportEmailHtml({ recipientName, ticketNumber, priorityLabel, priorityCode, category, subject, description, entityName, subscriberType, ctaUrl, isSubmitter }) {
  const color = PRIORITY_COLORS[priorityCode] || '#6b7280'
  const typeLabel = subscriberType === 'company' ? 'Company' : subscriberType === 'service_provider' ? 'Service Provider' : 'Individual'
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Support Ticket ${ticketNumber}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;">${isSubmitter ? 'Your support ticket has been received' : 'New support ticket submitted'}</p>
  </td></tr>
  <tr><td style="height:3px;background:${color};"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${recipientName || 'there'},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
      ${isSubmitter
        ? 'We\'ve received your support ticket and will get back to you as soon as possible.'
        : `A ${typeLabel.toLowerCase()} has submitted a support ticket requiring attention.`}
    </p>
    <div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;width:35%;">Ticket</td>
          <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;">${ticketNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;">Priority</td>
          <td style="padding:6px 0;"><span style="color:#fff;background:${color};padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">${priorityLabel}</span></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;">Category</td>
          <td style="padding:6px 0;color:#0f172a;font-size:13px;text-transform:capitalize;">${(category || '').replace(/_/g, ' ')}</td>
        </tr>
        ${entityName ? `<tr>
          <td style="padding:6px 0;color:#64748b;font-size:13px;">${typeLabel}</td>
          <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${entityName}</td>
        </tr>` : ''}
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
      <a href="${ctaUrl}" style="display:inline-block;background:#0f172a;color:#fff;
        text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">
        ${isSubmitter ? 'View Your Ticket' : 'View in Dashboard'}
      </a>
    </div>
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
    const { ticket_id, ticket_number, priority_code, priority_label,
            category, subject, description, subscriber_type, entity_name } = body

    if (!ticket_id || !ticket_number) {
      return NextResponse.json({ error: 'ticket_id and ticket_number required' }, { status: 400 })
    }

    const sc = getServiceClient()
    const results = { routing_sent: false, admins_notified: 0, emails_sent: 0, sms_sent: 0, submitter_notified: false }

    // ── 1. Send to priority routing email ──
    const { data: routing } = await sc
      .from('support_ticket_routing')
      .select('email_to, sla_hours')
      .eq('priority_code', priority_code || 'p5_basic')
      .eq('is_active', true)
      .maybeSingle()

    if (routing?.email_to) {
      try {
        await sendAndQueueEmail(sc, {
          to: [{ Email: routing.email_to, Name: `${BRAND} Support` }],
          subject: `[${priority_label || 'Support'}] ${ticket_number} — ${subject}`,
          html: buildSupportEmailHtml({
            recipientName: 'Support Team', ticketNumber: ticket_number,
            priorityLabel: priority_label, priorityCode: priority_code,
            category, subject, description, entityName: entity_name,
            subscriberType: subscriber_type,
            ctaUrl: `${APP_URL()}/admin/support?ticket=${ticket_id}`,
            isSubmitter: false,
          }),
          text: `${BRAND} ${priority_label} Ticket ${ticket_number}: "${subject}" from ${entity_name || 'individual user'}. Category: ${category}.`,
          referenceTable: 'support_tickets', referenceId: ticket_id,
        })
        results.routing_sent = true
      } catch (e) { console.error('[support-notify] routing email failed:', e.message) }
    }

    // ── 2. Notify admin users ──
    const { data: adminUsers } = await sc
      .from('user_roles')
      .select('user_id, user_roles_lookup!inner(code)')
      .in('user_roles_lookup.code', ['platform_admin', 'admin'])

    const adminUserIds = [...new Set((adminUsers || []).map(a => a.user_id))]

    for (const adminId of adminUserIds) {
      const { data: profile } = await sc
        .from('user_profiles_secure')
        .select('first_name, last_name, email, phone')
        .eq('id', adminId)
        .maybeSingle()
      if (!profile) continue

      const name = profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : 'Admin'

      if (profile.email) {
        try {
          await sendAndQueueEmail(sc, {
            to: [{ Email: profile.email, Name: name }],
            subject: `[${BRAND}] ${priority_label} Ticket ${ticket_number}`,
            html: buildSupportEmailHtml({
              recipientName: name, ticketNumber: ticket_number,
              priorityLabel: priority_label, priorityCode: priority_code,
              category, subject, description, entityName: entity_name,
              subscriberType: subscriber_type,
              ctaUrl: `${APP_URL()}/admin/support?ticket=${ticket_id}`,
              isSubmitter: false,
            }),
            text: `${BRAND}: ${priority_label} support ticket ${ticket_number} from ${entity_name || 'individual'}. Subject: "${subject}".`,
            referenceTable: 'support_tickets', referenceId: ticket_id,
          })
          results.emails_sent++
        } catch (e) { console.error('[support-notify] admin email failed:', e.message) }
      }

      const phone = normalisePhone(profile.phone)
      if (phone) {
        try {
          const r = await sendAndQueueSms(sc, {
            to: phone, recipientName: name,
            message: `${BRAND}: ${priority_label} ticket ${ticket_number} — "${(subject || '').substring(0, 50)}". Review in admin dashboard.`,
            referenceTable: 'support_tickets', referenceId: ticket_id,
          })
          if (r?.sent) results.sms_sent++
        } catch (e) { console.error('[support-notify] admin SMS failed:', e.message) }
      }

      results.admins_notified++
    }

    // ── 3. Confirmation to submitter ──
    const { data: submitterProfile } = await sc
      .from('user_profiles_secure')
      .select('first_name, last_name, email')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (submitterProfile?.email) {
      const subName = submitterProfile.first_name ? `${submitterProfile.first_name} ${submitterProfile.last_name || ''}`.trim() : 'there'
      const subPage = subscriber_type === 'company' ? 'company' : subscriber_type === 'service_provider' ? 'provider' : 'dashboard'
      try {
        await sendAndQueueEmail(sc, {
          to: [{ Email: submitterProfile.email, Name: subName }],
          subject: `[${BRAND}] Ticket ${ticket_number} received — ${subject}`,
          html: buildSupportEmailHtml({
            recipientName: subName, ticketNumber: ticket_number,
            priorityLabel: priority_label, priorityCode: priority_code,
            category, subject, description, entityName: entity_name,
            subscriberType: subscriber_type,
            ctaUrl: `${APP_URL()}/${subPage}/support?ticket=${ticket_id}`,
            isSubmitter: true,
          }),
          text: `${BRAND}: Your support ticket ${ticket_number} has been received. Priority: ${priority_label}. We'll get back to you soon.`,
          referenceTable: 'support_tickets', referenceId: ticket_id,
        })
        results.submitter_notified = true
      } catch (e) { console.error('[support-notify] submitter email failed:', e.message) }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error('[support-notify] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}