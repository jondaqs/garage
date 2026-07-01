/**
 * POST /api/auth/change-password
 *
 * Handles the forgot-password reset flow. Called by the reset-password
 * page after the user clicks the email link and (if MFA is enrolled)
 * verifies their TOTP code.
 *
 * Security layers:
 *  1. Password history — rejects if the new password matches any of the
 *     last 5 stored bcrypt hashes.
 *  2. Cooldown — enforces a 24-hour gap between password changes.
 *  3. Account lock — if 3+ changes are detected within 24 hours the
 *     account is temporarily banned for 24 hours via Supabase admin API.
 *
 * The actual password update uses the CALLER'S session (not the
 * service role), so Supabase still enforces AAL2 when MFA is enrolled.
 * The service role client is only used for password_history table
 * operations and the emergency account ban.
 *
 * Body: { newPassword: string }
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient }                from '@supabase/ssr'
import { cookies }                           from 'next/headers'
import { NextResponse }                      from 'next/server'
import bcrypt                                from 'bcryptjs'
import { rateLimit }                         from '@/lib/rateLimiter'

const HISTORY_DEPTH  = 5
const BCRYPT_ROUNDS  = 12
const COOLDOWN_HOURS = 24

// 5 attempts per 15 minutes per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many password reset attempts. Please try again later.' })

// ── Supabase clients ─────────────────────────────────────────

function getServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getCallerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()      { return cookieStore.getAll() },
        setAll(toSet) { try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    },
  )
}

// ── Handler ──────────────────────────────────────────────────

export async function POST(request) {
  // Rate limit check
  const limited = limiter.check(request)
  if (limited) return limited

  try {
    const { newPassword } = await request.json()

    // Basic validation
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    // ── 1. Identify the caller ──────────────────────────────
    const supabase = await getCallerClient()
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const admin = getServiceClient()

    // ── 2. Fetch recent password hashes ─────────────────────
    const { data: history } = await admin
      .from('password_history')
      .select('password_hash, created_at')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_DEPTH)

    // ── 3. Suspicious-activity check & cooldown ─────────────
    if (history && history.length > 0) {
      const now    = Date.now()
      const dayMs  = 24 * 60 * 60 * 1000
      const changesIn24h = history.filter(
        h => (now - new Date(h.created_at).getTime()) < dayMs,
      ).length

      // 3+ password changes in 24 hours → lock the account
      if (changesIn24h >= 3) {
        await admin.auth.admin.updateUserById(user.id, {
          ban_duration: '24h',
        })
        try { await supabase.auth.signOut() } catch {}
        return NextResponse.json(
          { error: 'Your account has been temporarily locked due to unusual password activity. Please contact support or try again after 24 hours.' },
          { status: 423 },
        )
      }

      // Cooldown — at least COOLDOWN_HOURS between changes
      const lastChange = new Date(history[0].created_at)
      const hoursAgo   = (now - lastChange.getTime()) / (1000 * 60 * 60)
      if (hoursAgo < COOLDOWN_HOURS) {
        const remaining = Math.ceil(COOLDOWN_HOURS - hoursAgo)
        return NextResponse.json(
          { error: `For security, you can only change your password once every ${COOLDOWN_HOURS} hours. Please try again in about ${remaining} hour${remaining === 1 ? '' : 's'}.` },
          { status: 429 },
        )
      }
    }

    // ── 4. Compare against history ──────────────────────────
    if (history && history.length > 0) {
      for (const entry of history) {
        const isReused = await bcrypt.compare(newPassword, entry.password_hash)
        if (isReused) {
          return NextResponse.json(
            { error: 'This password has been used before. Please choose a different password.' },
            { status: 422 },
          )
        }
      }
    }

    // ── 5. Update password via the caller's session ─────────
    // Uses the caller's own session (not the service role) so
    // Supabase still enforces AAL2 when MFA is enrolled.
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (updateErr) {
      if (updateErr.message?.includes('aal2')) {
        return NextResponse.json(
          { error: 'Two-factor verification is required before changing your password.' },
          { status: 403 },
        )
      }
      throw updateErr
    }

    // ── 6. Store the new hash in history ────────────────────
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await admin
      .from('password_history')
      .insert({ auth_user_id: user.id, password_hash: hash })

    // ── 7. Prune old entries beyond HISTORY_DEPTH ───────────
    if (history && history.length >= HISTORY_DEPTH) {
      const { data: allRows } = await admin
        .from('password_history')
        .select('id, created_at')
        .eq('auth_user_id', user.id)
        .order('created_at', { ascending: false })

      if (allRows && allRows.length > HISTORY_DEPTH) {
        const idsToDelete = allRows.slice(HISTORY_DEPTH).map(r => r.id)
        await admin
          .from('password_history')
          .delete()
          .in('id', idsToDelete)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    
    return NextResponse.json(
      { error: 'Failed to reset password.' },
      { status: 500 },
    )
  }
}