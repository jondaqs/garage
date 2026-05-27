// → src/app/api/company/fleet/assign/route.js
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET  — fetch fleet vehicles with assignment info via RPC
 * POST — assign or unassign a vehicle via RPC
 *
 * Both endpoints delegate to Supabase RPC functions that handle
 * auth checks, membership verification, and data assembly server-side.
 */

// ── Helper: resolve caller's company id ────────────────────────────────────
async function resolveCompanyId(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return { error: 'User profile not found', status: 404 }

  // Owner?
  const { data: owned } = await supabase
    .from('company_profiles')
    .select('id')
    .eq('owner_user_id', profile.id)
    .maybeSingle()
  if (owned) return { companyId: owned.id }

  // Member?
  const { data: membership } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('user_id', profile.id)
    .eq('is_active', true)
    .maybeSingle()
  if (membership) return { companyId: membership.company_id }

  return { error: 'Not associated with a company', status: 403 }
}

// ── GET: fleet with assignments (via RPC) ───────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient()
    const ctx = await resolveCompanyId(supabase)
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const { data, error: rpcErr } = await supabase
      .rpc('get_fleet_assignments', { p_company_id: ctx.companyId })

    if (rpcErr) {
      console.error('get_fleet_assignments RPC error:', rpcErr)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }

    // The RPC returns a jsonb object with success, fleet, members, canManageFleet
    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || 'RPC returned failure' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success:        true,
      fleet:          data.fleet,
      members:        data.members,
      canManageFleet: data.canManageFleet,
    })
  } catch (err) {
    console.error('Fleet assignment GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST: assign / unassign (via RPC) ───────────────────────────────────────
export async function POST(request) {
  try {
    const supabase = await createClient()
    const ctx = await resolveCompanyId(supabase)
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const body = await request.json()
    const { vehicleId, assignedUserId } = body

    if (!vehicleId) {
      return NextResponse.json({ error: 'vehicleId is required' }, { status: 400 })
    }

    const { data, error: rpcErr } = await supabase
      .rpc('assign_fleet_vehicle', {
        p_company_id:       ctx.companyId,
        p_vehicle_id:       vehicleId,
        p_assigned_user_id: assignedUserId || null,
      })

    if (rpcErr) {
      console.error('assign_fleet_vehicle RPC error:', rpcErr)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }

    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error || 'Assignment failed' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      message: data.message,
    })
  } catch (err) {
    console.error('Fleet assignment POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}