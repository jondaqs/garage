// src/app/api/admin/ban-user/route.js
// Bans or unbans a user at the Supabase Auth level using the service role key.
// This prevents the user's JWT from refreshing, so their session expires within
// the token lifetime (~1 hour) even if the middleware check is bypassed.
//
// Called by admin pages after the RPC (admin_update_user_status,
// admin_update_company_status, admin_update_provider_status) succeeds.

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { adminLimiter } from '@/lib/rateLimiters'

// Service-role client — never exposed to the browser
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Standard server client — used to verify the caller is an admin
async function getCallerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
        set() {},
        remove() {},
      },
    }
  )
}

export async function POST(request) {
  const limited = adminLimiter.check(request)
  if (limited) return limited

  try {
    const { auth_user_id, action } = await request.json()

    if (!auth_user_id || !['ban', 'unban'].includes(action)) {
      return NextResponse.json(
        { error: 'Required: auth_user_id (uuid) and action ("ban" | "unban")' },
        { status: 400 }
      )
    }

    // ── Verify caller is a platform admin ─────────────────────────
    const supabase = await getCallerClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: callerProfile } = await supabase
      .from('user_profiles_secure')
      .select('id, user_roles(role:user_roles_lookup(code))')
      .eq('auth_user_id', user.id)
      .single()

    const codes = callerProfile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
    if (!codes.includes('admin') && !codes.includes('platform_admin')) {
      return NextResponse.json({ error: 'Unauthorized: admin required' }, { status: 403 })
    }

    // Prevent self-ban
    if (auth_user_id === user.id) {
      return NextResponse.json({ error: 'Cannot ban your own account' }, { status: 400 })
    }

    // ── Apply ban/unban at auth level ────────────────────────────
    const admin = getAdminClient()

    if (action === 'ban') {
      const { error } = await admin.auth.admin.updateUserById(auth_user_id, {
        ban_duration: '876600h',  // ~100 years — effectively permanent
      })
      if (error) throw error
    } else {
      const { error } = await admin.auth.admin.updateUserById(auth_user_id, {
        ban_duration: 'none',
      })
      if (error) throw error
    }

    return NextResponse.json({ success: true, action, auth_user_id })

  } catch (error) {
    console.error('Ban/unban error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}