/**
 * POST /api/auth/change-password
 *
 * Handles both "change" (from settings — needs current password) and
 * "reset" (from forgot-password email link — session-only) flows.
 *
 * Before accepting a new password it checks the last 5 entries in
 * `password_history` via bcrypt.compare. If the new password matches
 * any of them, the request is rejected.
 *
 * The actual password update uses the CALLER'S session (not the
 * service role), so Supabase still enforces AAL2 when MFA is enrolled.
 * The service role client is only used for password_history table
 * operations (which are blocked from client access via RLS).
 *
 * After a successful change the new password's bcrypt hash is stored
 * in `password_history` so future changes are also checked.
 *
 * Body:
 *   { mode: 'change' | 'reset', newPassword: string, currentPassword?: string }
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient }                from '@supabase/ssr'
import { cookies }                           from 'next/headers'
import { NextResponse }                      from 'next/server'
import bcrypt                                from 'bcryptjs'

const HISTORY_DEPTH    = 5
const BCRYPT_ROUNDS    = 12
const COOLDOWN_HOURS   = 24

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
        getAll()            { return cookieStore.getAll() },
        setAll(toSet)       { try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    },
  )
}

// ── Handler ──────────────────────────────────────────────────

export async function POST(request) {
  try {
    const { mode, newPassword, currentPassword } = await request.json()

    // Basic validation
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    if (mode === 'change' && !currentPassword) {
      return NextResponse.json(
        { error: 'Current password is required.' },
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

    // ── 2. For "change" mode, verify current password ───────
    if (mode === 'change') {
      const { error: signInErr } = await admin.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      // signInWithPassword on the admin client still validates creds
      // but doesn't create a browser session.
      if (signInErr) {
        return NextResponse.json(
          { error: 'Current password is incorrect.' },
          { status: 403 },
        )
      }
    }

    // ── 3. Fetch recent password hashes ─────────────────────
    const { data: history } = await admin
      .from('password_history')
      .select('password_hash, created_at')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_DEPTH)

    // ── 4. Cooldown — prevent rapid cycling (change mode only) ─
    //    Forgot-password resets are exempt so a compromised
    //    account can always be recovered immediately.
    if (mode === 'change' && history && history.length > 0) {
      const lastChange  = new Date(history[0].created_at)
      const hoursAgo    = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60)
      if (hoursAgo < COOLDOWN_HOURS) {
        const remaining = Math.ceil(COOLDOWN_HOURS - hoursAgo)
        return NextResponse.json(
          { error: `For security, you can only change your password once every ${COOLDOWN_HOURS} hours. Please try again in about ${remaining} hour${remaining === 1 ? '' : 's'}.` },
          { status: 429 },
        )
      }
    }

    // ── 5. Compare against history ──────────────────────────
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

    // ── 6. Update password via the caller's session ────────
    // Uses the caller's own session (not the service role) so
    // Supabase enforces AAL2 when MFA is enrolled. The caller
    // must have already verified their TOTP before reaching here.
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (updateErr) {
      // Surface the AAL2 error clearly so the client can react
      if (updateErr.message?.includes('aal2')) {
        return NextResponse.json(
          { error: 'Two-factor verification is required before changing your password.' },
          { status: 403 },
        )
      }
      throw updateErr
    }

    // ── 7. Store the new hash in history ────────────────────
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await admin
      .from('password_history')
      .insert({ auth_user_id: user.id, password_hash: hash })

    // ── 8. Prune old entries beyond HISTORY_DEPTH ──────────
    if (history && history.length >= HISTORY_DEPTH) {
      // Keep only the newest HISTORY_DEPTH rows (the one we just inserted
      // makes it HISTORY_DEPTH + 1, so delete the oldest).
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
      { error: err.message || 'Failed to change password.' },
      { status: 500 },
    )
  }
}