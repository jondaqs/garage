import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Personal user budget API.
 *
 * Symmetric to /api/company/budget but scoped to the caller's own
 * user_profiles row. Currency model and uniqueness rules are identical:
 *   • Every budget row carries a currency_id.
 *   • spent_amount is maintained by the update_user_spending trigger +
 *     process_payment — both are currency-aware. This route never
 *     touches spent_amount directly.
 *   • One budget per (user_id, period_start, period_end).
 *
 * Spend only counts vehicles the user individually owns
 * (vehicle_ownership.owner_user_id). Fleet vehicles paid by a company
 * member do not bleed into a personal budget; that's a deliberate
 * design choice — fleet spend belongs on the company budget.
 */

const BUDGET_SELECT = '*, currency:currencies(id, code, symbol, display_name)'

async function resolveUser(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return { error: 'User profile not found', status: 404 }

  return { userId: profile.id }
}

async function resolveCurrencyId(supabase, { currency_id, currency }) {
  if (currency_id) return currency_id
  if (!currency)   return null
  const { data } = await supabase
    .from('currencies').select('id').eq('code', currency.toUpperCase()).maybeSingle()
  return data?.id ?? null
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient()
    const resolved = await resolveUser(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const today = new Date().toISOString().split('T')[0]

    const { data: budget, error } = await supabase
      .from('user_budgets')
      .select(BUDGET_SELECT)
      .eq('user_id', resolved.userId)
      .lte('period_start', today)
      .gte('period_end', today)
      .maybeSingle()
    if (error) throw error

    const { data: history } = await supabase
      .from('user_budgets')
      .select(BUDGET_SELECT)
      .eq('user_id', resolved.userId)
      .order('period_start', { ascending: false })
      .limit(12)

    return NextResponse.json({
      success: true,
      budget:  budget || null,
      history: history || [],
    })
  } catch (error) {
    console.error('User budget GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveUser(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const body = await request.json()
    const { budget_amount, period_start, period_end } = body

    if (!budget_amount || budget_amount <= 0) {
      return NextResponse.json({ error: 'Valid budget amount is required' }, { status: 400 })
    }
    if (!period_start || !period_end) {
      return NextResponse.json({ error: 'period_start and period_end are required' }, { status: 400 })
    }
    if (period_end <= period_start) {
      return NextResponse.json({ error: 'period_end must be after period_start' }, { status: 400 })
    }

    const currency_id = await resolveCurrencyId(supabase, body)
    if (!currency_id) {
      return NextResponse.json({ error: 'Unknown or inactive currency' }, { status: 400 })
    }

    const { data: clash } = await supabase
      .from('user_budgets')
      .select('id')
      .eq('user_id', resolved.userId)
      .lte('period_start', period_end)
      .gte('period_end',   period_start)
      .maybeSingle()
    if (clash) {
      return NextResponse.json(
        { error: 'A budget already exists for an overlapping period. Edit the existing budget instead.' },
        { status: 409 }
      )
    }

    const { data: budget, error } = await supabase
      .from('user_budgets')
      .insert([{
        user_id:       resolved.userId,
        budget_amount: parseFloat(budget_amount),
        spent_amount:  0,
        period_start,
        period_end,
        currency_id,
      }])
      .select(BUDGET_SELECT).single()
    if (error) throw error

    return NextResponse.json({ success: true, budget })
  } catch (error) {
    console.error('User budget POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveUser(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const body = await request.json()
    const { id, budget_amount, period_start, period_end } = body
    if (!id) return NextResponse.json({ error: 'Budget id is required' }, { status: 400 })

    const { data: existing } = await supabase
      .from('user_budgets')
      .select('id, user_id, currency_id, period_start, period_end')
      .eq('id', id)
      .eq('user_id', resolved.userId)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 })
    }

    const updates = { updated_at: new Date().toISOString() }
    if (budget_amount !== undefined) updates.budget_amount = parseFloat(budget_amount)
    if (period_start  !== undefined) updates.period_start  = period_start
    if (period_end    !== undefined) updates.period_end    = period_end

    if (body.currency_id !== undefined || body.currency !== undefined) {
      const newCurrencyId = await resolveCurrencyId(supabase, body)
      if (!newCurrencyId) {
        return NextResponse.json({ error: 'Unknown or inactive currency' }, { status: 400 })
      }
      if (newCurrencyId !== existing.currency_id) {
        updates.currency_id  = newCurrencyId
        updates.spent_amount = 0  // currency change wipes accumulated spend
      }
    }

    const newStart = updates.period_start ?? existing.period_start
    const newEnd   = updates.period_end   ?? existing.period_end
    if (newStart !== existing.period_start || newEnd !== existing.period_end) {
      const { data: clash } = await supabase
        .from('user_budgets')
        .select('id')
        .eq('user_id', resolved.userId)
        .neq('id', id)
        .lte('period_start', newEnd)
        .gte('period_end',   newStart)
        .maybeSingle()
      if (clash) {
        return NextResponse.json(
          { error: 'Another budget overlaps the requested period.' },
          { status: 409 }
        )
      }
    }

    const { data: budget, error } = await supabase
      .from('user_budgets')
      .update(updates)
      .eq('id', id)
      .eq('user_id', resolved.userId)
      .select(BUDGET_SELECT).single()
    if (error) throw error

    return NextResponse.json({ success: true, budget })
  } catch (error) {
    console.error('User budget PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveUser(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Budget id is required' }, { status: 400 })

    const { error } = await supabase
      .from('user_budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', resolved.userId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('User budget DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}