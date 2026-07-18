/**
 * GET /api/cron/expire-subscriptions
 * ───────────────────────────────────
 * Vercel Cron job — runs daily (6 AM EAT, before reminder-scan).
 *
 * Calls the expire_lapsed_subscriptions() RPC which:
 *   1. Finds every subscription where status = 'active' AND expiry_date < today
 *   2. Flips status → 'expired'
 *   3. Logs a subscription_history entry
 *   4. Sends an in-app notification to the subscriber
 *
 * Secured with CRON_SECRET (same secret used by other cron endpoints).
 *
 * Response:
 *   { success, expired_count, details: [...] }
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { safeCompare }                         from '@/lib/safeCompare'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request) {
  try {
    // ── Security: verify Vercel cron secret ──────────────────────────────
    const authHeader = request.headers.get('authorization')
    if (!safeCompare(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sc = getServiceClient()

    // ── Call the expire function ──────────────────────────────────────────
    const { data, error } = await sc.rpc('expire_lapsed_subscriptions')

    if (error) {
      console.error('[expire-subscriptions] RPC error:', error.message)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    const result = typeof data === 'string' ? JSON.parse(data) : data

    if (!result.success) {
      console.error('[expire-subscriptions] function error:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log(
      `[expire-subscriptions] Expired ${result.expired_count} subscription(s)`
    )

    return NextResponse.json({
      success:       true,
      expired_count: result.expired_count,
      details:       result.details,
    })

  } catch (err) {
    console.error('[expire-subscriptions] fatal error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}