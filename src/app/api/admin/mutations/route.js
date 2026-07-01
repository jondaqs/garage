// src/app/api/admin/mutations/route.js
// Generic admin mutation endpoint — replaces client-side admin writes.
// Every mutation is validated against a strict table+operation whitelist,
// admin auth is verified server-side, and actions are auto-logged.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { adminLimiter } from '@/lib/rateLimiters'

// ── Whitelist: only these table+operation combos are allowed ──────────────
const ALLOWED = {
  // Lookup table CRUD (admin/settings)
  service_provider_types:       ['insert', 'update'],
  services:                     ['insert', 'update'],
  currencies:                   ['insert', 'update'],
  booking_types:                ['insert', 'update'],
  booking_statuses:             ['insert', 'update'],
  work_order_statuses:          ['insert', 'update'],
  work_order_services_statuses: ['insert', 'update'],
  work_order_parts_statuses:    ['insert', 'update'],
  genders:                      ['insert', 'update'],
  platform_settings:            ['update'],

  // Subscription config
  subscription_pricing_tiers:   ['insert', 'update'],
  subscription_packages:        ['update'],
  subscription_shop_tiers:      ['update'],
  subscription_period_discounts:['insert', 'update'],
  subscription_trial_config:    ['update'],

  // Admin actions
  admin_action_logs:            ['insert'],
  provider_rejections:          ['insert'],

  // Support
  support_ticket_messages:      ['insert'],
}

// Tables where auto-audit-logging is skipped (because the table IS the log)
const SKIP_AUDIT = new Set(['admin_action_logs', 'support_ticket_messages'])

export async function POST(request) {
  const limited = adminLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const body = await request.json()

    const { table, operation, data, id, filters } = body

    // ── 1. Validate input ──────────────────────────────────────────────
    if (!table || !operation || !data) {
      return NextResponse.json(
        { error: 'table, operation, and data are required' },
        { status: 400 }
      )
    }

    if (!['insert', 'update'].includes(operation)) {
      return NextResponse.json(
        { error: 'operation must be insert or update' },
        { status: 400 }
      )
    }

    // ── 2. Check whitelist ─────────────────────────────────────────────
    const allowed = ALLOWED[table]
    if (!allowed || !allowed.includes(operation)) {
      return NextResponse.json(
        { error: `${operation} on ${table} is not permitted` },
        { status: 403 }
      )
    }

    // ── 3. Verify admin auth ───────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Server-side admin check — does NOT rely on client claims
    const { data: isAdmin } = await supabase.rpc('is_user_admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // ── 4. Execute mutation ────────────────────────────────────────────
    let result, error

    if (operation === 'insert') {
      // Inject admin_user_id for action logs
      const insertData = table === 'admin_action_logs'
        ? { ...data, admin_user_id: profile.id }
        : data

      const query = supabase.from(table).insert(insertData).select()
      const res = await query
      result = res.data
      error = res.error
    }

    if (operation === 'update') {
      if (!id && !filters) {
        return NextResponse.json(
          { error: 'id or filters required for update' },
          { status: 400 }
        )
      }

      let query = supabase.from(table).update(data)

      if (id) {
        query = query.eq('id', id)
      } else if (filters) {
        // filters is an object like { setting_key: 'sms_config' }
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value)
        }
      }

      const res = await query.select()
      result = res.data
      error = res.error
    }

    if (error) {
      console.error(`Admin mutation error [${table}.${operation}]:`, error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // ── 5. Auto-log admin action (skip if this IS the log table) ──────
    if (!SKIP_AUDIT.has(table)) {
      await supabase.from('admin_action_logs').insert({
        admin_user_id: profile.id,
        action_type:   `${operation}_${table}`,
        target_type:   table,
        target_id:     id || result?.[0]?.id || null,
      }).then(() => {}).catch(e =>
        console.warn('Audit log failed (non-fatal):', e.message)
      )
    }

    return NextResponse.json({ success: true, data: result })

  } catch (err) {
    console.error('Admin mutation error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
