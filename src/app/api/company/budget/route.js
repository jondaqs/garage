import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ── Resolve company ID + admin status for the current user ──────────────────
async function resolveCompany(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return { error: 'User profile not found', status: 404 }

  // Owner first
  const { data: owned } = await supabase
    .from('company_profiles').select('id')
    .eq('owner_user_id', profile.id).maybeSingle()

  if (owned) return { companyId: owned.id, isAdmin: true, profileId: profile.id }

  // Member
  const { data: member } = await supabase
    .from('company_users').select('company_id, is_admin')
    .eq('user_id', profile.id).eq('is_active', true).maybeSingle()

  if (member) return { companyId: member.company_id, isAdmin: member.is_admin, profileId: profile.id }

  return { error: 'Not associated with a company', status: 403 }
}

// ── GET — fetch current period budget ──────────────────────────────────────
export async function GET(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveCompany(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const today = new Date().toISOString().split('T')[0]

    const { data: budget, error } = await supabase
      .from('company_budgets')
      .select('*')
      .eq('company_id', resolved.companyId)
      .lte('period_start', today)
      .gte('period_end', today)
      .maybeSingle()

    if (error) throw error

    // Also fetch all budget periods for history
    const { data: history } = await supabase
      .from('company_budgets')
      .select('*')
      .eq('company_id', resolved.companyId)
      .order('period_start', { ascending: false })
      .limit(12)

    return NextResponse.json({
      success: true,
      budget:  budget || null,
      history: history || [],
      isAdmin: resolved.isAdmin,
    })

  } catch (error) {
    console.error('Budget GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── POST — create new budget period ────────────────────────────────────────
export async function POST(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveCompany(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    if (!resolved.isAdmin) {
      return NextResponse.json({ error: 'Only company admins can set budgets' }, { status: 403 })
    }

    const body = await request.json()
    const { budget_amount, period_start, period_end, currency = 'KES' } = body

    if (!budget_amount || budget_amount <= 0) {
      return NextResponse.json({ error: 'Valid budget amount is required' }, { status: 400 })
    }
    if (!period_start || !period_end) {
      return NextResponse.json({ error: 'period_start and period_end are required' }, { status: 400 })
    }
    if (period_end <= period_start) {
      return NextResponse.json({ error: 'period_end must be after period_start' }, { status: 400 })
    }

    const { data: budget, error } = await supabase
      .from('company_budgets')
      .insert([{
        company_id:    resolved.companyId,
        budget_amount: parseFloat(budget_amount),
        spent_amount:  0,
        period_start,
        period_end,
        currency,
      }])
      .select().single()

    if (error) throw error

    return NextResponse.json({ success: true, budget })

  } catch (error) {
    console.error('Budget POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PATCH — update existing budget ─────────────────────────────────────────
export async function PATCH(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveCompany(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    if (!resolved.isAdmin) {
      return NextResponse.json({ error: 'Only company admins can update budgets' }, { status: 403 })
    }

    const body = await request.json()
    const { id, budget_amount, period_start, period_end, currency } = body

    if (!id) return NextResponse.json({ error: 'Budget id is required' }, { status: 400 })

    const updates = {}
    if (budget_amount !== undefined) updates.budget_amount = parseFloat(budget_amount)
    if (period_start !== undefined)  updates.period_start  = period_start
    if (period_end !== undefined)    updates.period_end    = period_end
    if (currency !== undefined)      updates.currency      = currency
    updates.updated_at = new Date().toISOString()

    const { data: budget, error } = await supabase
      .from('company_budgets')
      .update(updates)
      .eq('id', id)
      .eq('company_id', resolved.companyId)   // ensures company ownership
      .select().single()

    if (error) throw error

    return NextResponse.json({ success: true, budget })

  } catch (error) {
    console.error('Budget PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}