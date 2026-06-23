// src/app/api/admin/mpesa-config/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/admin/mpesa-config
 * Load saved M-Pesa configuration (admin only).
 * Masks sensitive fields for display.
 */
export async function GET(request) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 })

    const sc = getServiceClient()
    const { data: isAdmin } = await sc.rpc('is_user_admin')
    if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { data: row } = await sc
      .from('platform_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'mpesa_config')
      .maybeSingle()

    const config = row?.setting_value || {}

    // Mask sensitive values for display
    const masked = {
      ...config,
      consumer_secret: config.consumer_secret ? '••••' + config.consumer_secret.slice(-4) : '',
      passkey: config.passkey ? '••••' + config.passkey.slice(-4) : '',
      callback_secret: config.callback_secret ? '••••' + config.callback_secret.slice(-4) : '',
      security_credential: config.security_credential ? '••••' + config.security_credential.slice(-8) : '',
      // Certificates are not secret but large — just show status
      sandbox_cert: config.sandbox_cert ? 'Uploaded' : '',
      production_cert: config.production_cert ? 'Uploaded' : '',
    }

    return NextResponse.json({ config: masked, updated_at: row?.updated_at })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/admin/mpesa-config
 *
 * Actions:
 *   { action: 'save', config: { ... } }           — save all settings
 *   { action: 'generate_secret' }                  — generate callback secret
 *   { action: 'generate_credential', password }    — generate security credential
 *   { action: 'test_connection' }                  — test OAuth token
 */
export async function POST(request) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 })

    const sc = getServiceClient()
    const { data: isAdmin } = await sc.rpc('is_user_admin')
    if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await request.json()
    const { action } = body

    // Load existing config
    const { data: row } = await sc
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', 'mpesa_config')
      .maybeSingle()

    let config = row?.setting_value || {}

    // ── Generate callback secret ────────────────────────────────
    if (action === 'generate_secret') {
      const secret = crypto.randomBytes(32).toString('hex')
      config.callback_secret = secret
      await upsertConfig(sc, config, user.id)

      // Also set env var for current runtime (won't persist across deploys)
      process.env.MPESA_CALLBACK_SECRET = secret

      return NextResponse.json({
        success: true,
        callback_secret: secret,
        message: 'Callback secret generated. Add this to your Vercel environment variables as MPESA_CALLBACK_SECRET.',
      })
    }

    // ── Generate security credential ────────────────────────────
    if (action === 'generate_credential') {
      const { password } = body
      if (!password) return NextResponse.json({ error: 'Initiator password is required' }, { status: 400 })

      const env = config.environment || 'sandbox'
      const certPem = env === 'production' ? config.production_cert : config.sandbox_cert

      if (!certPem) {
        return NextResponse.json({
          error: `No ${env} certificate uploaded. Upload the certificate first.`,
        }, { status: 400 })
      }

      try {
        const encrypted = crypto.publicEncrypt(
          { key: certPem, padding: crypto.constants.RSA_PKCS1_PADDING },
          Buffer.from(password)
        )
        const credential = encrypted.toString('base64')

        config.security_credential = credential
        config.initiator_name = config.initiator_name || body.initiator_name || ''
        await upsertConfig(sc, config, user.id)

        return NextResponse.json({
          success: true,
          security_credential: credential,
          message: 'Security credential generated. Add this to your Vercel environment variables as MPESA_SECURITY_CREDENTIAL.',
        })
      } catch (encErr) {
        return NextResponse.json({
          error: 'Encryption failed — the certificate may be invalid or corrupted. Error: ' + encErr.message,
        }, { status: 400 })
      }
    }

    // ── Test connection ─────────────────────────────────────────
    if (action === 'test_connection') {
      const consumerKey = config.consumer_key || process.env.MPESA_CONSUMER_KEY
      const consumerSecret = config.consumer_secret || process.env.MPESA_CONSUMER_SECRET
      const env = config.environment || process.env.MPESA_ENV || 'sandbox'
      const baseUrl = env === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke'

      if (!consumerKey || !consumerSecret) {
        return NextResponse.json({ error: 'Consumer Key and Secret are required' }, { status: 400 })
      }

      try {
        const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
        const res = await fetch(
          `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
          {
            method: 'GET',
            headers: { Authorization: `Basic ${credentials}` },
            signal: AbortSignal.timeout(10000),
          }
        )

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return NextResponse.json({
            success: false,
            error: `OAuth failed: ${res.status} — ${text}`,
            environment: env,
          })
        }

        const data = await res.json()
        return NextResponse.json({
          success: true,
          message: `Connection to ${env} API successful. Token expires in ${data.expires_in}s.`,
          environment: env,
        })
      } catch (e) {
        return NextResponse.json({
          success: false,
          error: `Connection failed: ${e.message}`,
          environment: env,
        })
      }
    }

    // ── Save config ─────────────────────────────────────────────
    if (action === 'save') {
      const updates = body.config || {}

      // Merge — don't overwrite masked/unchanged sensitive fields
      if (updates.consumer_secret?.startsWith('••••')) delete updates.consumer_secret
      if (updates.passkey?.startsWith('••••')) delete updates.passkey
      if (updates.callback_secret?.startsWith('••••')) delete updates.callback_secret
      if (updates.security_credential?.startsWith('••••')) delete updates.security_credential
      if (updates.sandbox_cert === 'Uploaded') delete updates.sandbox_cert
      if (updates.production_cert === 'Uploaded') delete updates.production_cert

      config = { ...config, ...updates }
      await upsertConfig(sc, config, user.id)

      return NextResponse.json({
        success: true,
        message: 'M-Pesa configuration saved. Remember to also update your Vercel environment variables.',
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[mpesa-config] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function upsertConfig(sc, config, userId) {
  const profileRes = await sc.from('user_profiles').select('id').eq('auth_user_id', userId).single()

  const { error } = await sc
    .from('platform_settings')
    .upsert({
      setting_key: 'mpesa_config',
      setting_value: config,
      description: 'M-Pesa Daraja API configuration',
      is_public: false,
      updated_at: new Date().toISOString(),
      updated_by: profileRes?.data?.id || null,
    }, { onConflict: 'setting_key' })

  if (error) throw error
}