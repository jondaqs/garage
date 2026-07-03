// → Drop this file at: src/app/api/chat/notify-user/route.js
/**
 * POST /api/chat/notify-user
 * Called after a provider sends a message.
 * Sends in-app notification + email + SMS to the customer side of the chat:
 *   • Personal conversation  → the user who opened it
 *   • Company conversation   → every active company_users member with can_chat = true
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { commsLimiter } from '@/lib/rateLimiters'
import { requireUUIDs } from '@/lib/validation'

const BRAND   = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com'

function sc() {
  const { createClient: svc } = require('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service-role credentials not configured')
  }
  return svc(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request) {
  const limited = commsLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const db       = sc()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId, messageId, senderName, providerName, preview } = await request.json()
    const _invalidUUID = requireUUIDs({ conversationId })
    if (_invalidUUID) return NextResponse.json({ error: _invalidUUID }, { status: 400 })

    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    // Load conversation — note we now read company_id too, since the recipient
    // set differs for company-scoped conversations.
    const { data: conv } = await db
      .from('conversations')
      .select('id, user_id, company_id, service_provider_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    // Build the recipient list. Two paths:
    //  • Personal conversation (company_id IS NULL): single recipient = conv.user_id
    //  • Company conversation (company_id IS NOT NULL): every active company_users
    //    row with can_chat = true. (The conv.user_id is the member who *opened*
    //    the chat — they may or may not still have can_chat, so we don't rely
    //    on it here.)
    const recipients = []
    const seenIds    = new Set()
    const addR = r => { if (r?.id && !seenIds.has(r.id)) { seenIds.add(r.id); recipients.push(r) } }

    if (conv.company_id) {
      const { data: members } = await db
        .from('company_users')
        .select('user_id, user_profiles_secure!user_id(id, first_name, last_name, email, phone)')
        .eq('company_id', conv.company_id)
        .eq('is_active', true)
        .eq('can_chat', true)
      for (const m of members || []) {
        const p = m.user_profiles
        if (p) addR({ id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone })
      }
    } else {
      const { data: userProfile } = await db
        .from('user_profiles_secure')
        .select('id, first_name, last_name, email, phone')
        .eq('id', conv.user_id)
        .maybeSingle()
      if (userProfile) addR(userProfile)
    }

    if (recipients.length === 0) return NextResponse.json({ success: true, notified: 0 })

    // The chat URL differs by surface — personal recipients land at /dashboard/chat,
    // company recipients land at /dashboard/company/[id]/chat.
    const chatUrl = conv.company_id
      ? `${APP_URL()}/dashboard/company/${conv.company_id}/chat?conversation=${conversationId}`
      : `${APP_URL()}/dashboard/chat?conversation=${conversationId}`

    // In-app notifications — wrapped: a failed insert here must not 500
    // the whole route (which manifests as a red POST in the browser console).
    try {
      const { error: notifErr } = await db.from('notifications').insert(
        recipients.map(r => ({
          user_id:           r.id,
          recipient_user_id: r.id,
          type:              'new_message',
          notification_type: 'new_message',
          title:             `New message from ${providerName || senderName}`,
          message:           `${senderName} replied: "${preview}"`,
          reference_table:   'conversations',
          reference_id:      conversationId,
          reference_type:    'conversation',
          is_read:           false,
        }))
      )
      if (notifErr) console.error('[notify-user] notifications insert:', notifErr.message)
    } catch (e) {
      console.error('[notify-user] notifications insert threw:', e.message)
    }

    // NB: user_unread_count / company_unread_count are already incremented
    // atomically by the send_message_to_user RPC on the provider side. This
    // route used to increment again here; removed to prevent double-counting.

    const subject = `New reply from ${providerName} — ${BRAND}`

    const html = (name) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>New Reply</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f172a;padding:24px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">New Reply from Service Provider</p>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#16a34a,#4ade80,transparent);"></td></tr>
  <tr><td style="padding:24px 32px;">
    <p style="margin:0 0 12px;color:#1e293b;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
      <strong>${senderName}</strong> from <strong>${providerName}</strong> has replied to your message:
    </p>
    <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:16px;margin:0 0 20px;">
      <p style="margin:0;font-size:14px;color:#166534;line-height:1.6;font-style:italic;">"${preview}"</p>
    </div>
    <div style="text-align:center;margin:0 0 16px;">
      <a href="${chatUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
        View Message
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
      const rName   = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'there'
      const smsText = `${BRAND}: ${senderName} from ${providerName} replied: "${preview.slice(0, 100)}". View: ${chatUrl}`

      if (r.email) {
        try {
          await sendAndQueueEmail(db, {
            to:             [{ Email: r.email, Name: rName }],
            subject,
            html:           html(rName),
            text:           smsText,
            referenceTable: 'conversations',
            referenceId:    conversationId,
          })
          emailsSent++
        } catch (e) { console.error('[notify-user] email:', e.message) }
      }

      const phone = normalisePhone(r.phone)
      if (phone) {
        try {
          const res = await sendAndQueueSms(db, {
            to:             phone,
            recipientName:  rName,
            message:        smsText,
            referenceTable: 'conversations',
            referenceId:    conversationId,
          })
          if (res?.sent) smsSent++
        } catch (e) { console.error('[notify-user] sms:', e.message) }
      }
    }

    return NextResponse.json({ success: true, notified: recipients.length, emailsSent, smsSent })
  } catch (err) {
    console.error('POST /api/chat/notify-user error:', err)
    return NextResponse.json({ success: false, delivered: false, error: 'Internal server error' }, { status: 200 })
  }
}