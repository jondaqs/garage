/**
 * GET/DELETE /api/sms-queue
 * ─────────────────────────
 * View SMS queue status and statistics, clean up old records.
 * ADMIN-ONLY — requires authenticated admin role.
 * Location: src/app/api/sms-queue/route.js
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
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('user_profiles_secure')
    .select('id, user_roles(role:user_roles_lookup(code))')
    .eq('auth_user_id', user.id)
    .single()

  const codes = profile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
  const isAdmin = codes.some(c => ADMIN_CODES.includes(c))

  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }

  return { ok: true, user }
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
      .from('sms_queue_secure')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: messages, error, count } = await query
    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

    // Get counts by status
    const { data: allRows } = await sc
      .from('sms_queue_secure')
      .select('status')

    const counts = { pending: 0, sent: 0, failed: 0, skipped: 0 }
    allRows?.forEach(row => {
      if (row.status in counts) counts[row.status]++
    })

    const total = Object.values(counts).reduce((a, b) => a + b, 0)

    return NextResponse.json({
      messages,
      total: count,
      limit,
      offset,
      statistics: {
        total_messages:   total,
        sent_messages:    counts.sent,
        pending_messages: counts.pending,
        failed_messages:  counts.failed,
        skipped_messages: counts.skipped,
      },
      counts,
    })
  } catch (error) {
    console.error('SMS queue fetch error:', error)
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
      .from('sms_queue')
      .delete()
      .eq('status', 'sent')
      .lt('sent_at', cutoffDate.toISOString())

    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

    return NextResponse.json({
      success: true,
      message: `Deleted sent SMS records older than ${days} days`,
    })
  } catch (error) {
    console.error('SMS queue cleanup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}