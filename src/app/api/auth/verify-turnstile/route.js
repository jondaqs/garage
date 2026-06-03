/**
 * POST /api/auth/verify-turnstile
 *
 * Verifies a Cloudflare Turnstile token server-side.
 * The secret key is kept in TURNSTILE_SECRET_KEY (never exposed to the client).
 *
 * Body: { token: string }
 * Returns: { success: true } or { error: string }
 */

import { NextResponse } from 'next/server'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function POST(request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: 'Please complete the security check.' },
        { status: 400 },
      )
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY
    if (!secretKey) {
      console.error('TURNSTILE_SECRET_KEY is not set')
      return NextResponse.json(
        { error: 'Server configuration error.' },
        { status: 500 },
      )
    }

    // Verify with Cloudflare
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
      }),
    })

    const data = await res.json()

    if (!data.success) {
      return NextResponse.json(
        { error: 'Security verification failed. Please try again.' },
        { status: 403 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Turnstile verification error!')
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 500 },
    )
  }
}