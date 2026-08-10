import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms }                     from '@/lib/sms/transport'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildEmailHtml(message) {
  const escaped = message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Carfix-Connect</h2>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escaped}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p style="color:#9ca3af;font-size:12px;">This message was sent by the Carfix-Connect admin team.</p>
      </div>
    </div>
  `
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const sc       = getServiceClient()

    // Auth check — mirror the admin layout pattern
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await sc
      .from('user_profiles_secure')
      .select('id, user_roles(role:user_roles_lookup(code))')
      .eq('auth_user_id', user.id)
      .single()

    const isAdmin = profile?.user_roles?.some(ur => ur.role?.code === 'admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { channel, recipientEmail, recipientPhone, recipientUserId, recipientName, subject, message } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const results = []
    const channels = channel === 'all'
      ? ['email', 'sms', 'notification']
      : [channel]

    for (const ch of channels) {

      // ── Email ──────────────────────────────────────────────────────────
      if (ch === 'email' && recipientEmail) {
        const emailSubject = subject?.trim() || 'Message from Carfix-Connect'
        try {
          await sendAndQueueEmail(sc, {
            to: [{ Email: recipientEmail, Name: recipientName || recipientEmail }],
            subject: emailSubject,
            html: buildEmailHtml(message),
            text: message,
            referenceTable: 'admin_contact',
          })
          results.push({ channel: 'email', ok: true, detail: recipientEmail })
        } catch (err) {
          results.push({ channel: 'email', ok: false, detail: err.message })
        }
      }

      // ── SMS ────────────────────────────────────────────────────────────
      if (ch === 'sms' && recipientPhone) {
        try {
          await sendAndQueueSms(sc, {
            phone: recipientPhone,
            message: message.trim(),
          })
          results.push({ channel: 'sms', ok: true, detail: recipientPhone })
        } catch (err) {
          results.push({ channel: 'sms', ok: false, detail: err.message })
        }
      }

      // ── In-app notification ────────────────────────────────────────────
      if (ch === 'notification' && recipientUserId) {
        try {
          const { error: notifErr } = await sc
            .from('notifications')
            .insert({
              user_id: profile.id,
              recipient_user_id: recipientUserId,
              type: 'admin_message',
              notification_type: 'admin_message',
              title: subject?.trim() || 'Message from Admin',
              message: message.trim(),
              is_read: false,
            })
          if (notifErr) throw notifErr
          results.push({ channel: 'notification', ok: true, detail: 'sent' })
        } catch (err) {
          results.push({ channel: 'notification', ok: false, detail: err.message })
        }
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No available channels for this recipient' }, { status: 400 })
    }

    const allOk   = results.every(r => r.ok)
    const summary = results.map(r => `${r.channel}: ${r.ok ? '✓' : '✗ ' + r.detail}`).join(', ')

    return NextResponse.json({
      success: allOk,
      message: channel === 'all'
        ? `Sent via ${results.filter(r => r.ok).map(r => r.channel).join(', ')}`
        : results[0]?.ok ? `${channel} sent successfully` : `Failed: ${results[0]?.detail}`,
      results,
    }, { status: allOk ? 200 : 207 })

  } catch (err) {
    console.error('Admin contact error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
