/**
 * GET/POST /api/admin/sms-config
 * ──────────────────────────────
 * Admin-only SMS provider configuration.
 *
 * GET  — load saved config (masks secrets)
 * POST — actions: save | test_sms | check_balance
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

async function verifyAdmin(sc) {
  const { data: isAdmin } = await sc.rpc('is_user_admin')
  return !!isAdmin
}

// ─── Mask sensitive fields for display ────────────────────────────────────────

function maskConfig(config) {
  if (!config) return {}
  const mask = (val) => val ? '••••' + val.slice(-4) : ''
  return {
    ...config,
    africastalking: config.africastalking ? {
      ...config.africastalking,
      api_key: mask(config.africastalking.api_key),
    } : {},
    celcom: config.celcom ? {
      ...config.celcom,
      api_key: mask(config.celcom.api_key),
    } : {},
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 })

    const sc = getServiceClient()
    if (!(await verifyAdmin(sc))) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const { data: row } = await sc
      .from('platform_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'sms_config')
      .maybeSingle()

    return NextResponse.json({
      config: maskConfig(row?.setting_value || null),
      updated_at: row?.updated_at || null,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 })

    const sc = getServiceClient()
    if (!(await verifyAdmin(sc))) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    // ── Save config ────────────────────────────────────────────────────────
    if (action === 'save') {
      const incoming = body.config || {}

      // Load existing to preserve masked secrets
      const { data: existingRow } = await sc
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'sms_config')
        .maybeSingle()

      const existing = existingRow?.setting_value || {}

      // Merge: keep existing secrets if incoming has masked values
      const merged = {
        active_provider: incoming.active_provider || existing.active_provider || 'none',
        africastalking: {
          api_key:   incoming.africastalking?.api_key?.startsWith('••••')
            ? existing.africastalking?.api_key || ''
            : (incoming.africastalking?.api_key || ''),
          username:  incoming.africastalking?.username  ?? existing.africastalking?.username ?? '',
          sender_id: incoming.africastalking?.sender_id ?? existing.africastalking?.sender_id ?? '',
          sandbox:   incoming.africastalking?.sandbox   ?? existing.africastalking?.sandbox ?? false,
        },
        celcom: {
          api_key:    incoming.celcom?.api_key?.startsWith('••••')
            ? existing.celcom?.api_key || ''
            : (incoming.celcom?.api_key || ''),
          partner_id: incoming.celcom?.partner_id ?? existing.celcom?.partner_id ?? '',
          sender_id:  incoming.celcom?.sender_id  ?? existing.celcom?.sender_id ?? '',
        },
      }

      const profileRes = await sc.from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      const { error } = await sc
        .from('platform_settings')
        .upsert({
          setting_key:   'sms_config',
          setting_value: merged,
          description:   'SMS provider configuration (Africa\'s Talking / Celcom Africa)',
          is_public:     false,
          updated_at:    new Date().toISOString(),
          updated_by:    profileRes?.data?.id || null,
        }, { onConflict: 'setting_key' })

      if (error) throw error

      // Clear transport cache so next SMS uses new config
      clearSmsConfigCache()

      return NextResponse.json({
        success: true,
        message: 'SMS configuration saved.',
        config: maskConfig(merged),
      })
    }

    // ── Test SMS ───────────────────────────────────────────────────────────
    if (action === 'test_sms') {
      const { phone, provider: testProvider } = body
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

      // Load real (unmasked) config
      const { data: row } = await sc
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'sms_config')
        .maybeSingle()

      const config = row?.setting_value || {}
      const provider = testProvider || config.active_provider || 'none'

      if (provider === 'none' || !provider) {
        log('Provider', false, 'No SMS provider configured')
        return NextResponse.json({ success: false, steps }, { status: 400 })
      }
      log('Provider', true, provider === 'africastalking' ? "Africa's Talking" : 'Celcom Africa')

      const providerConfig = config[provider] || {}

      // Check credentials
      if (provider === 'africastalking') {
        if (!providerConfig.api_key || !providerConfig.username) {
          log('Credentials', false, 'API Key or Username is missing')
          return NextResponse.json({ success: false, steps }, { status: 400 })
        }
        const isSandbox = providerConfig.sandbox === true
        log('Credentials', true, `Username: ${providerConfig.username}, Sender: ${providerConfig.sender_id || '(default)'}, Mode: ${isSandbox ? 'SANDBOX (no real delivery)' : 'PRODUCTION'}`)
      } else {
        if (!providerConfig.api_key || !providerConfig.partner_id) {
          log('Credentials', false, 'API Key or Partner ID is missing')
          return NextResponse.json({ success: false, steps }, { status: 400 })
        }
        log('Credentials', true, `Partner: ${providerConfig.partner_id}, Sender: ${providerConfig.sender_id || 'Motiifix'}`)
      }

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
          const { sandbox, api_key, username, sender_id } = providerConfig
          const baseUrl = sandbox
            ? 'https://api.sandbox.africastalking.com/version1'
            : 'https://api.africastalking.com/version1'

          const params = new URLSearchParams({ username, to: normPhone, message: testMessage })
          if (sender_id) params.set('from', sender_id)

          const res = await fetch(`${baseUrl}/messaging`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'apiKey': api_key },
            body: params.toString(),
          })
          if (!res.ok) throw new Error(`AT HTTP ${res.status}: ${await res.text()}`)
          const data = await res.json()
          results = data?.SMSMessageData?.Recipients ?? []
          results = results.map(r => ({ number: r.number, status: r.status, messageId: r.messageId, cost: r.cost }))

        } else {
          const res = await fetch('https://isms.celcomafrica.com/api/services/sendsms/', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apikey: providerConfig.api_key,
              partnerID: providerConfig.partner_id,
              message: testMessage,
              shortcode: providerConfig.sender_id || 'Motiifix',
              mobile: normPhone.replace('+', ''),
            }),
          })
          if (!res.ok) throw new Error(`Celcom HTTP ${res.status}: ${await res.text()}`)
          const data = await res.json()
          const responses = data?.responses || []
          results = responses.map(r => ({
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

        // Update queue
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

    // ── Check balance (AT only) ────────────────────────────────────────────
    if (action === 'check_balance') {
      const { data: row } = await sc
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'sms_config')
        .maybeSingle()

      const config = row?.setting_value || {}
      const provider = body.provider || config.active_provider

      if (provider === 'celcom') {
        try {
          const celConfig = config.celcom || {}
          const res = await fetch(`https://isms.celcomafrica.com/api/services/getbalance/?apikey=${encodeURIComponent(celConfig.api_key)}&partnerID=${encodeURIComponent(celConfig.partner_id)}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          return NextResponse.json({ success: true, balance: data })
        } catch (e) {
          return NextResponse.json({ success: false, error: e.message }, { status: 500 })
        }
      }

      return NextResponse.json({ success: false, error: 'Balance check not supported for this provider' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[sms-config] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}