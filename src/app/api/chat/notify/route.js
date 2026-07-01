// → Drop this file at: src/app/api/chat/notify/route.js
/**
 * POST /api/chat/notify
 * Called after a user sends a message.
 * Sends in-app notification + email + SMS to provider owner + all active SPU staff + mechanics.
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service-role credentials not configured')
  }
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(request) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const sc       = getServiceClient()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId, messageId, senderName, preview } = await request.json()
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    // Load conversation + provider
    const { data: conv } = await sc
      .from('conversations')
      .select('id, service_provider_id, user_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const providerId = conv.service_provider_id
    const chatUrl    = `${APP_URL()}/provider/chat?conversation=${conversationId}`

    // Collect all provider recipients
    const recipients = []
    const seenIds    = new Set()
    const addR = r => { if (r?.user_id && !seenIds.has(r.user_id)) { seenIds.add(r.user_id); recipients.push(r) } }

    // Provider owner
    const { data: sp } = await sc
      .from('service_providers_secure')
      .select('owner_user_id, name, user_profiles_secure!owner_user_id(first_name, last_name, email, phone)')
      .eq('id', providerId).maybeSingle()

    const providerName = sp?.name || 'your garage'

    if (sp?.owner_user_id) {
      addR({
        user_id:    sp.owner_user_id,
        first_name: sp.user_profiles?.first_name,
        last_name:  sp.user_profiles?.last_name,
        email:      sp.user_profiles?.email,
        phone:      sp.user_profiles?.phone,
      })
    }

    // SPU staff
    const { data: spuList } = await sc
      .from('service_provider_users')
      .select('user_id, user_profiles_secure!user_id(first_name, last_name, email, phone)')
      .eq('service_provider_id', providerId).eq('is_active', true)
      .in('role', ['admin', 'manager', 'accountant'])
    for (const s of spuList || []) {
      addR({ user_id: s.user_id, first_name: s.user_profiles?.first_name, last_name: s.user_profiles?.last_name, email: s.user_profiles?.email, phone: s.user_profiles?.phone })
    }

    // Mechanics
    const { data: mechList } = await sc
      .from('mechanics')
      .select('user_id, user_profiles_secure!user_id(first_name, last_name, email, phone)')
      .eq('service_provider_id', providerId).eq('is_active', true)
    for (const m of mechList || []) {
      addR({ user_id: m.user_id, first_name: m.user_profiles?.first_name, last_name: m.user_profiles?.last_name, email: m.user_profiles?.email, phone: m.user_profiles?.phone })
    }

    if (recipients.length === 0) return NextResponse.json({ success: true, notified: 0 })

    const title   = `New message from ${senderName}`
    const message = `${senderName} sent a message to ${providerName}: "${preview}"`

    // In-app notifications — wrapped: a single failed insert here must not 500
    // the whole route (which manifests as a red POST in the browser console).
    try {
      const { error: notifErr } = await sc.from('notifications').insert(
        recipients.map(r => ({
          user_id:           r.user_id,
          recipient_user_id: r.user_id,
          type:              'new_message',
          notification_type: 'new_message',
          title,
          message,
          reference_table:   'conversations',
          reference_id:      conversationId,
          reference_type:    'conversation',
          is_read:           false,
        }))
      )
      if (notifErr) console.error('[chat/notify] notifications insert:', notifErr.message)
    } catch (e) {
      console.error('[chat/notify] notifications insert threw:', e.message)
    }

    // NB: provider_unread_count is already incremented atomically by the
    // send_message_to_provider RPC on the client side. This route used to
    // increment it again here; we removed that to prevent double-counting.

    const subject  = `New message from ${senderName} — ${providerName}`
    const smsText  = `${BRAND}: ${senderName} sent you a message: "${preview.slice(0, 100)}". Reply at: ${chatUrl}`

    const buildEmail = (rName) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>New Message</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:24px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">New Customer Message</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#3b82f6,#60a5fa,transparent);"></td></tr>
  <tr><td style="padding:24px 32px;">
    <p style="margin:0 0 12px;color:#1e293b;font-size:15px;">Hi ${rName},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
      <strong>${senderName}</strong> has sent a new message to <strong>${providerName}</strong>:
    </p>
    <div style="background:#f8fafc;border-left:4px solid #3b82f6;border-radius:4px;padding:16px;margin:0 0 20px;">
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;font-style:italic;">"${preview}"</p>
    </div>
    <div style="text-align:center;margin:0 0 16px;">
      <a href="${chatUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
        Reply to Message
      </a>
    </div>
  </td></tr>
  <tr><td style="background:#f8fafc;padding:12px 32px;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} ${BRAND} · Kenya</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

    let emailsSent = 0, smsSent = 0
    for (const r of recipients) {
      const rName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Team'
      if (r.email) {
        try {
          await sendAndQueueEmail(sc, {
            to:             [{ Email: r.email, Name: rName }],
            subject,
            html:           buildEmail(rName),
            text:           smsText,
            referenceTable: 'conversations',
            referenceId:    conversationId,
          })
          emailsSent++
        } catch (e) { console.error('[chat/notify] email:', e.message) }
      }
      const phone = normalisePhone(r.phone)
      if (phone) {
        try {
          const res = await sendAndQueueSms(sc, {
            to:             phone,
            recipientName:  rName,
            message:        smsText,
            referenceTable: 'conversations',
            referenceId:    conversationId,
          })
          if (res?.sent) smsSent++
        } catch (e) { console.error('[chat/notify] sms:', e.message) }
      }
    }

    return NextResponse.json({ success: true, notified: recipients.length, emailsSent, smsSent })
  } catch (err) {
    console.error('POST /api/chat/notify error:', err)
    // Notifications are a side effect — never surface a 500 here, because the
    // user has already successfully sent their message. Returning 200 with a
    // delivered:false flag keeps the browser console clean.
    return NextResponse.json({ success: false, delivered: false, error: 'Internal server error' }, { status: 200 })
  }
}