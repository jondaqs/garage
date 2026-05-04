/**
 * POST /api/chat/notify-user
 * Called after provider sends a message.
 * Sends in-app notification + email + SMS to the user who initiated the chat.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'

const BRAND   = 'Motiifix'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'

function sc() {
  const { createClient: svc } = require('@supabase/supabase-js')
  return svc(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const db       = sc()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { conversationId, messageId, senderName, providerName, preview } = await request.json()
    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

    // Load conversation + user
    const { data: conv } = await db
      .from('conversations')
      .select('id, user_id, service_provider_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    // Load user contact details
    const { data: userProfile } = await db
      .from('user_profiles')
      .select('id, first_name, last_name, email, phone')
      .eq('id', conv.user_id)
      .maybeSingle()

    if (!userProfile) return NextResponse.json({ success: true, notified: 0 })

    const chatUrl   = `${APP_URL()}/dashboard/chat?conversation=${conversationId}`
    const userName  = `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || 'there'

    // In-app notification
    await db.from('notifications').insert({
      user_id:           userProfile.id,
      recipient_user_id: userProfile.id,
      type:              'new_message',
      notification_type: 'new_message',
      title:             `New message from ${providerName || senderName}`,
      message:           `${senderName} replied: "${preview}"`,
      reference_table:   'conversations',
      reference_id:      conversationId,
      reference_type:    'conversation',
      is_read:           false,
    })

    // Update user unread count
    await db.from('conversations')
      .update({ user_unread_count: db.rpc ? undefined : undefined })
      .eq('id', conversationId)
    await db.rpc('increment_user_unread', { p_conversation_id: conversationId })
      .catch(async () => {
        const { data } = await db.from('conversations').select('user_unread_count').eq('id', conversationId).single()
        await db.from('conversations').update({ user_unread_count: (data?.user_unread_count || 0) + 1 }).eq('id', conversationId)
      })

    const subject = `New reply from ${providerName} — ${BRAND}`
    const smsText = `${BRAND}: ${senderName} from ${providerName} replied: "${preview.slice(0, 100)}". View: ${chatUrl}`

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

    let emailSent = false, smsSent = false

    if (userProfile.email) {
      try {
        await sendAndQueueEmail(db, {
          to:             [{ Email: userProfile.email, Name: userName }],
          subject,
          html:           html(userName),
          text:           smsText,
          referenceTable: 'conversations',
          referenceId:    conversationId,
        })
        emailSent = true
      } catch (e) { console.error('[notify-user] email:', e.message) }
    }

    const phone = normalisePhone(userProfile.phone)
    if (phone) {
      try {
        const res = await sendAndQueueSms(db, {
          to:             phone,
          recipientName:  userName,
          message:        smsText,
          referenceTable: 'conversations',
          referenceId:    conversationId,
        })
        smsSent = !!res?.sent
      } catch (e) { console.error('[notify-user] sms:', e.message) }
    }

    return NextResponse.json({ success: true, emailSent, smsSent })
  } catch (err) {
    console.error('POST /api/chat/notify-user error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}