/**
 * GET/POST /api/admin/sms-config
 * ──────────────────────────────
 * Admin-only SMS provider configuration.
 *
 * SECURITY: Only `active_provider` is saved to the database.
 * All credentials (API keys, usernames, etc.) live in Vercel env vars.
 * The UI fields prefill from env vars and can be overridden for testing,
 * but overrides are NOT persisted — they last only for that test send.
 *
 * Location: src/app/api/admin/sms-config/route.js
 */

import { NextResponse }                        from 'next/server'
import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { normalisePhone, clearSmsConfigCache } from '@/lib/sms/transport'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const { data: callerProfile } = await supabase
    .from('user_profiles_secure')
    .select('id, user_roles(role:user_roles_lookup(code))')
    .eq('auth_user_id', session.user.id)
    .single()

  const codes = callerProfile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
  if (!codes.includes('admin') && !codes.includes('platform_admin')) {
    return { error: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  }

  return { ok: true, session }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const sc = getServiceClient()

    // Read only active_provider from database
    const { data: row } = await sc
      .from('platform_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'sms_config')
      .maybeSingle()

    const savedProvider = row?.setting_value?.active_provider || null

    // Auto-detect if nothing saved
    const fallbackProvider = process.env.AT_API_KEY ? 'africastalking'
      : process.env.CELCOM_API_KEY ? 'celcom' : 'none'

    return NextResponse.json({
      active_provider: savedProvider || fallbackProvider,
      updated_at:      row?.updated_at || null,

      // Non-secret env var values — prefill UI fields
      africastalking: {
        username:  process.env.AT_USERNAME  || '',
        sender_id: process.env.AT_SENDER_ID || '',
        sandbox:   process.env.AT_SANDBOX === 'true',
      },
      celcom: {
        partner_id: process.env.CELCOM_PARTNER_ID || '',
        sender_id:  process.env.CELCOM_SENDER_ID  || '',
      },

      // Boolean flags — are secret env vars set?
      env: {
        AT_API_KEY:       !!process.env.AT_API_KEY,
        AT_USERNAME:      !!process.env.AT_USERNAME,
        AT_SANDBOX:       process.env.AT_SANDBOX || '',
        CELCOM_API_KEY:   !!process.env.CELCOM_API_KEY,
        CELCOM_PARTNER_ID:!!process.env.CELCOM_PARTNER_ID,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const sc   = getServiceClient()
    const body = await request.json()
    const { action } = body

    // ── Save: only persists active_provider ─────────────────────────────────
    if (action === 'save') {
      const activeProvider = body.active_provider || 'none'

      const profileRes = await sc.from('user_profiles').select('id').eq('auth_user_id', auth.session.user.id).single()

      const { error } = await sc
        .from('platform_settings')
        .upsert({
          setting_key:   'sms_config',
          setting_value: { active_provider: activeProvider },
          description:   'Active SMS provider (africastalking | celcom | none)',
          is_public:     false,
          updated_at:    new Date().toISOString(),
          updated_by:    profileRes?.data?.id || null,
        }, { onConflict: 'setting_key' })

      if (error) throw error
      clearSmsConfigCache()

      return NextResponse.json({
        success: true,
        message: `SMS provider set to "${activeProvider}". Credentials are read from Vercel env vars.`,
      })
    }

    // ── Test SMS: uses UI overrides for non-secrets, env for API keys ──────
    if (action === 'test_sms') {
      const { phone, provider: testProvider, overrides } = body
      const steps = []
      const log = (step, ok, detail) => steps.push({ step, ok, detail })

      // Validate phone
      if (!phone) {
        log('Input', false, 'No phone number provided')
        return NextResponse.json({ success: false, steps }, { status: 400 })
      }

      const normPhone = normalisePhone(phone)
      if (!normPhone) {
        log('Normalise', false, `Could not normalise "${phone}" to E.164`)
        return NextResponse.json({ success: false, steps }, { status: 400 })
      }
      log('Normalise', true, `${phone} → ${normPhone}`)

      // Determine provider
      const { data: row } = await sc
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'sms_config')
        .maybeSingle()

      const savedProvider = row?.setting_value?.active_provider || 'none'
      const provider = testProvider || savedProvider

      if (provider === 'none' || !provider) {
        log('Provider', false, 'No SMS provider selected — choose one and save first')
        return NextResponse.json({ success: false, steps }, { status: 400 })
      }
      log('Provider', true, provider === 'africastalking' ? "Africa's Talking" : 'Celcom Africa')

      // API key always from env
      const apiKey = provider === 'africastalking' ? process.env.AT_API_KEY : process.env.CELCOM_API_KEY
      if (!apiKey) {
        const envVar = provider === 'africastalking' ? 'AT_API_KEY' : 'CELCOM_API_KEY'
        log('Env var', false, `${envVar} is not set in Vercel environment variables`)
        return NextResponse.json({ success: false, steps }, { status: 400 })
      }
      log('Env var', true, 'API key found in environment')

      // Non-secret fields: use UI overrides if provided, fallback to env vars
      const ov = overrides || {}

      // Queue
      let queueId = null
      const testMessage = `Motiifix TEST: SMS via ${provider === 'africastalking' ? "Africa's Talking" : 'Celcom Africa'} is working! ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`

      try {
        const { data: queueData } = await sc
          .from('sms_queue')
          .insert({ recipient_phone: normPhone, message: testMessage, status: 'pending' })
          .select('id')
          .single()
        queueId = queueData?.id
        log('Queue', true, `Queued (${queueId})`)
      } catch (qErr) {
        log('Queue', false, `Queue insert failed: ${qErr.message}`)
      }

      // Send
      try {
        let results

        if (provider === 'africastalking') {
          const username  = ov.username  || process.env.AT_USERNAME  || ''
          const senderId  = ov.sender_id || process.env.AT_SENDER_ID || ''
          const sandbox   = ov.sandbox != null ? ov.sandbox : (process.env.AT_SANDBOX === 'true')

          if (!username) {
            log('Config', false, 'Username is missing — set AT_USERNAME env var or enter in the field')
            return NextResponse.json({ success: false, steps }, { status: 400 })
          }

          const baseUrl = sandbox
            ? 'https://api.sandbox.africastalking.com/version1'
            : 'https://api.africastalking.com/version1'

          log('Config', true, `Username: ${username}, Sender: ${senderId || '(default)'}, Mode: ${sandbox ? 'SANDBOX' : 'PRODUCTION'}, URL: ${baseUrl}`)

          const params = new URLSearchParams({ username, to: normPhone, message: testMessage })
          if (senderId) params.set('from', senderId)

          const res = await fetch(`${baseUrl}/messaging`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'apiKey': apiKey },
            body: params.toString(),
          })
          if (!res.ok) throw new Error(`AT HTTP ${res.status}: ${await res.text()}`)
          const data = await res.json()
          results = (data?.SMSMessageData?.Recipients ?? []).map(r => ({
            number: r.number, status: r.status, messageId: r.messageId, cost: r.cost,
          }))

        } else {
          const partnerId = ov.partner_id || process.env.CELCOM_PARTNER_ID || ''
          const senderId  = ov.sender_id  || process.env.CELCOM_SENDER_ID  || 'Motiifix'

          if (!partnerId) {
            log('Config', false, 'Partner ID is missing — set CELCOM_PARTNER_ID env var or enter in the field')
            return NextResponse.json({ success: false, steps }, { status: 400 })
          }

          log('Config', true, `Partner: ${partnerId}, Sender: ${senderId}`)

          const res = await fetch('https://isms.celcomafrica.com/api/services/sendsms/', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apikey:    apiKey,
              partnerID: partnerId,
              message:   testMessage,
              shortcode: senderId,
              mobile:    normPhone.replace('+', ''),
            }),
          })
          if (!res.ok) throw new Error(`Celcom HTTP ${res.status}: ${await res.text()}`)
          const data = await res.json()
          results = (data?.responses || []).map(r => ({
            number:    String(r.mobile || ''),
            status:    (r['response-description'] === 'Success' || r['respose-code'] === 200) ? 'Success' : (r['response-description'] || 'Failed'),
            messageId: String(r.messageid || ''),
            cost:      r.cost || '',
          }))
        }

        const first = results[0] || {}
        const ok = first.status === 'Success'
        log('Send', ok, ok
          ? `Delivered! messageId=${first.messageId}, cost=${first.cost || 'N/A'}`
          : `Failed: status="${first.status}"`)

        if (queueId) {
          await sc.from('sms_queue').update({
            status: ok ? 'sent' : 'failed',
            sent_at: ok ? new Date().toISOString() : null,
            error_message: ok ? null : first.status,
          }).eq('id', queueId)
          log('Queue update', true, ok ? 'Marked sent' : 'Marked failed')
        }

        return NextResponse.json({ success: ok, steps, atResponse: results })

      } catch (sendErr) {
        log('Send', false, sendErr.message)
        if (queueId) {
          await sc.from('sms_queue').update({ status: 'failed', error_message: sendErr.message }).eq('id', queueId)
        }
        return NextResponse.json({ success: false, steps, error: sendErr.message }, { status: 500 })
      }
    }

    // ── Check balance (Celcom only) ────────────────────────────────────────
    if (action === 'check_balance') {
      const celcomKey  = process.env.CELCOM_API_KEY
      const partnerId  = body.partner_id || process.env.CELCOM_PARTNER_ID
      if (!celcomKey)  return NextResponse.json({ success: false, error: 'CELCOM_API_KEY not set in env' }, { status: 400 })
      if (!partnerId)  return NextResponse.json({ success: false, error: 'CELCOM_PARTNER_ID not set' }, { status: 400 })

      try {
        const res = await fetch(`https://isms.celcomafrica.com/api/services/getbalance/?apikey=${encodeURIComponent(celcomKey)}&partnerID=${encodeURIComponent(partnerId)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        return NextResponse.json({ success: true, balance: data })
      } catch (e) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[sms-config] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}