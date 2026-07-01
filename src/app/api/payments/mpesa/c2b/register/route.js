// src/app/api/payments/mpesa/c2b/register/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MPESA_CONFIG } from '@/lib/mpesa/config'
import { getOAuthToken } from '@/lib/mpesa/auth'

/**
 * POST /api/payments/mpesa/c2b/register
 *
 * One-time setup: registers validation and confirmation URLs with Safaricom.
 * Admin-only. Call once after deployment to enable C2B Paybill callbacks.
 *
 * Body (optional): { responseType: 'Completed' | 'Cancelled' }
 *   - Completed: accept all payments (validation URL is advisory)
 *   - Cancelled: reject payments that fail validation
 */
export async function POST(request) {
  try {
    // Admin auth
    const authClient = await createClient()
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Verify admin role — use service client for role check
    const { createClient: createSC } = await import('@supabase/supabase-js')
    const sc = createSC(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: isAdmin } = await sc.rpc('is_user_admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const responseType = body.responseType || 'Completed'

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

    if (!baseUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_BASE_URL not configured' }, { status: 500 })
    }

    const token = await getOAuthToken()

    const payload = {
      ShortCode: MPESA_CONFIG.shortcode,
      ResponseType: responseType,
      ConfirmationURL: `${baseUrl}/api/payments/mpesa/c2b/confirm`,
      ValidationURL: `${baseUrl}/api/payments/mpesa/c2b/validate`,
    }

    const res = await fetch(
      `${MPESA_CONFIG.baseUrl}/mpesa/c2b/v1/registerurl`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      }
    )

    const data = await res.json()

    console.info('[c2b-register] Response:', data)

    if (data.ResponseCode === '0' || data.ResponseDescription?.includes('success')) {
      return NextResponse.json({
        success: true,
        message: 'C2B URLs registered successfully',
        confirmationUrl: payload.ConfirmationURL,
        validationUrl: payload.ValidationURL,
        responseType,
        safaricomResponse: data,
      })
    }

    return NextResponse.json({
      success: false,
      error: data.errorMessage || data.ResponseDescription || 'Registration failed',
      safaricomResponse: data,
    }, { status: 502 })
  } catch (err) {
    console.error('[c2b-register] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}