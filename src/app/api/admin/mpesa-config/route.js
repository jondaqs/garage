/**
 * GET/POST /api/admin/mpesa-config
 * ────────────────────────────────
 * Admin-only M-Pesa Daraja API configuration.
 *
 * SECURITY: Secrets (consumer_key, consumer_secret, passkey, etc.) are ONLY
 * read from Vercel env vars — never saved to the database.
 * Database stores only: environment, sandbox_cert, production_cert (public keys).
 *
 * The actual payment flow (lib/mpesa/config.js) already reads from env vars.
 *
 * Location: src/app/api/admin/mpesa-config/route.js
 */

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
    const { data: row } = await sc
      .from('platform_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'mpesa_config')
      .maybeSingle()

    const dbConfig = row?.setting_value || {}

    return NextResponse.json({
      updated_at: row?.updated_at || null,

      // Only environment + cert status from database
      environment: dbConfig.environment || process.env.MPESA_ENV || 'sandbox',
      sandbox_cert_uploaded:    !!(dbConfig.sandbox_cert),
      production_cert_uploaded: !!(dbConfig.production_cert),

      // Non-secret env var values — prefill UI fields
      config: {
        consumer_key:  process.env.MPESA_CONSUMER_KEY  || '',
        shortcode:     process.env.MPESA_SHORTCODE     || '',
        initiator_name: process.env.MPESA_INITIATOR_NAME || '',
      },

      // Boolean flags — which secret env vars are set?
      env: {
        MPESA_CONSUMER_KEY:        !!process.env.MPESA_CONSUMER_KEY,
        MPESA_CONSUMER_SECRET:     !!process.env.MPESA_CONSUMER_SECRET,
        MPESA_SHORTCODE:           !!process.env.MPESA_SHORTCODE,
        MPESA_PASSKEY:             !!process.env.MPESA_PASSKEY,
        MPESA_CALLBACK_SECRET:     !!process.env.MPESA_CALLBACK_SECRET,
        MPESA_INITIATOR_NAME:      !!process.env.MPESA_INITIATOR_NAME,
        MPESA_SECURITY_CREDENTIAL: !!process.env.MPESA_SECURITY_CREDENTIAL,
        MPESA_ENV:                 process.env.MPESA_ENV || '',
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

    // Load DB config (environment + certs only)
    const { data: row } = await sc
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', 'mpesa_config')
      .maybeSingle()

    let dbConfig = row?.setting_value || {}

    // ── Save: only environment + certs ────────────────────────────────────
    if (action === 'save') {
      const updates = body.config || {}

      // Only persist non-secret fields
      const cleaned = {
        environment:     updates.environment || dbConfig.environment || 'sandbox',
        sandbox_cert:    dbConfig.sandbox_cert    || null,
        production_cert: dbConfig.production_cert || null,
      }

      // Handle cert uploads (new cert text in the request)
      if (updates.sandbox_cert && updates.sandbox_cert !== 'Uploaded') {
        cleaned.sandbox_cert = updates.sandbox_cert
      }
      if (updates.production_cert && updates.production_cert !== 'Uploaded') {
        cleaned.production_cert = updates.production_cert
      }

      const profileRes = await sc.from('user_profiles').select('id').eq('auth_user_id', auth.session.user.id).single()

      const { error } = await sc
        .from('platform_settings')
        .upsert({
          setting_key:   'mpesa_config',
          setting_value: cleaned,
          description:   'M-Pesa config (environment + public certs only)',
          is_public:     false,
          updated_at:    new Date().toISOString(),
          updated_by:    profileRes?.data?.id || null,
        }, { onConflict: 'setting_key' })

      if (error) throw error

      return NextResponse.json({
        success: true,
        message: 'M-Pesa environment and certificates saved. All credentials must be set in Vercel env vars.',
      })
    }

    // ── Generate callback secret ─────────────────────────────────────────
    if (action === 'generate_secret') {
      const secret = crypto.randomBytes(32).toString('hex')

      return NextResponse.json({
        success: true,
        callback_secret: secret,
        message: 'Callback secret generated. Copy this value to Vercel env vars as MPESA_CALLBACK_SECRET.',
      })
    }

    // ── Generate security credential ─────────────────────────────────────
    if (action === 'generate_credential') {
      const { password, cert } = body
      if (!password) return NextResponse.json({ error: 'Initiator password is required' }, { status: 400 })

      // Cert can come from the request (UI upload) or from database
      const env = body.environment || dbConfig.environment || 'sandbox'
      const certPem = cert
        || (env === 'production' ? dbConfig.production_cert : dbConfig.sandbox_cert)

      if (!certPem) {
        return NextResponse.json({
          error: `No ${env} certificate available. Upload the certificate first.`,
        }, { status: 400 })
      }

      try {
        const encrypted = crypto.publicEncrypt(
          { key: certPem, padding: crypto.constants.RSA_PKCS1_PADDING },
          Buffer.from(password)
        )
        const credential = encrypted.toString('base64')

        return NextResponse.json({
          success: true,
          security_credential: credential,
          message: 'Security credential generated. Copy this to Vercel env vars as MPESA_SECURITY_CREDENTIAL.',
        })
      } catch (encErr) {
        return NextResponse.json({
          error: 'Encryption failed — the certificate may be invalid. Error: ' + encErr.message,
        }, { status: 400 })
      }
    }

    // ── Test connection ──────────────────────────────────────────────────
    if (action === 'test_connection') {
      // API keys always from env vars, with optional UI overrides for testing only
      const ov = body.overrides || {}
      const consumerKey    = ov.consumer_key    || process.env.MPESA_CONSUMER_KEY
      const consumerSecret = ov.consumer_secret || process.env.MPESA_CONSUMER_SECRET
      const env = ov.environment || dbConfig.environment || process.env.MPESA_ENV || 'sandbox'
      const baseUrl = env === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke'

      if (!consumerKey || !consumerSecret) {
        return NextResponse.json({
          error: 'MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set in Vercel env vars',
        }, { status: 400 })
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[mpesa-config] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}