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

export async function POST(request) {
  try {
    const supabase = await createClient()
    const sc       = getServiceClient()

    // Auth check — must be admin
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await sc
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    const { data: adminRole } = await sc
      .from('user_roles')
      .select('id')
      .eq('user_id', profile?.id)
      .eq('role_id', (await sc.from('user_roles_lookup').select('id').eq('code', 'admin').single()).data?.id)
      .maybeSingle()

    if (!adminRole) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { channel, recipientEmail, recipientPhone, recipientUserId, recipientName, subject, message } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // ── Email ────────────────────────────────────────────────────────────
    if (channel === 'email') {
      if (!recipientEmail) {
        return NextResponse.json({ error: 'No email address available' }, { status: 400 })
      }
      if (!subject?.trim()) {
        return NextResponse.json({ error: 'Subject is required for email' }, { status: 400 })
      }

      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1e40af;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:18px;">Carfix-Connect</h2>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p style="color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
            <p style="color:#9ca3af;font-size:12px;">This message was sent by the Carfix-Connect admin team.</p>
          </div>
        </div>
      `

      await sendAndQueueEmail(sc, {
        to: [{ Email: recipientEmail, Name: recipientName || recipientEmail }],
        subject: subject.trim(),
        html,
        text: message,
        referenceTable: 'admin_contact',
      })

      return NextResponse.json({ success: true, message: `Email sent to ${recipientEmail}` })
    }

    // ── SMS ──────────────────────────────────────────────────────────────
    if (channel === 'sms') {
      if (!recipientPhone) {
        return NextResponse.json({ error: 'No phone number available' }, { status: 400 })
      }

      await sendAndQueueSms(sc, {
        phone: recipientPhone,
        message: message.trim(),
      })

      return NextResponse.json({ success: true, message: `SMS sent to ${recipientPhone}` })
    }

    // ── In-app notification ──────────────────────────────────────────────
    if (channel === 'notification') {
      if (!recipientUserId) {
        return NextResponse.json({ error: 'No user profile to notify' }, { status: 400 })
      }

      const { error: notifErr } = await sc
        .from('notifications')
        .insert({
          user_id: profile.id,
          recipient_user_id: recipientUserId,
          type: 'admin_message',
          notification_type: 'admin_message',
          title: 'Message from Admin',
          message: message.trim(),
          is_read: false,
        })

      if (notifErr) throw notifErr

      return NextResponse.json({ success: true, message: 'In-app notification sent' })
    }

    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })

  } catch (err) {
    console.error('Admin contact error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
