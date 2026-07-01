/**
 * GET/DELETE /api/email-queue
 * ───────────────────────────
 * View email queue status and statistics, clean up old records.
 * ADMIN-ONLY — requires authenticated admin role.
 * Location: src/app/api/email-queue/route.js
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { adminLimiter } from '@/lib/rateLimiters'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ADMIN_CODES = ['admin', 'platform_admin', 'moderator', 'support']

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('user_profiles_secure')
    .select('id, user_roles(role:user_roles_lookup(code))')
    .eq('auth_user_id', session.user.id)
    .single()

  const codes = profile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
  const isAdmin = codes.some(c => ADMIN_CODES.includes(c))

  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }

  return { ok: true, session }
}

export async function GET(request) {
  const limited = adminLimiter.check(request)
  if (limited) return limited

  const auth = await requireAdmin()
  if (auth.error) return auth.error

  try {
    const sc = getServiceClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit  = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = sc
      .from('email_queue_secure')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: emails, error: emailsError, count } = await query
    if (emailsError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

    // Get statistics via RPC
    const { data: stats, error: statsError } = await sc.rpc('get_email_queue_stats')
    if (statsError) console.error('Stats error:', statsError)

    // Get counts by status
    const { data: statusCounts } = await sc
      .from('email_queue_secure')
      .select('status')

    const countsByStatus = { pending: 0, sent: 0, failed: 0 }
    statusCounts?.forEach(item => {
      if (item.status in countsByStatus) countsByStatus[item.status]++
    })

    return NextResponse.json({
      emails,
      total: count,
      limit,
      offset,
      statistics: stats?.[0] || null,
      counts: countsByStatus,
    })
  } catch (error) {
    console.error('Email queue fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request) {
  const limited2 = adminLimiter.check(request)
  if (limited2) return limited2

  const auth = await requireAdmin()
  if (auth.error) return auth.error

  try {
    const sc = getServiceClient()
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const { error } = await sc
      .from('email_queue')
      .delete()
      .eq('status', 'sent')
      .lt('sent_at', cutoffDate.toISOString())

    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

    return NextResponse.json({
      success: true,
      message: `Deleted sent emails older than ${days} days`,
    })
  } catch (error) {
    console.error('Email queue cleanup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}