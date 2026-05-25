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

// ── Recompute spent_amount from receipts ────────────────────────────────
// Mirror of the company-side helper. See /api/company/budget/route.js for
// the rationale. In short: the trigger only credits new payments; this
// function reconciles spent_amount with the true total of past + present
// payments in the budget's currency and window. Called on every save.
async function recomputeUserSpentAmount(supabase, budget, userId) {
  if (!budget?.id || !budget?.currency_id || !userId) return budget

  const { data: ownership } = await supabase
    .from('vehicle_ownership')
    .select('vehicle_id')
    .eq('owner_user_id', userId)
  const vehicleIds = (ownership || []).map(r => r.vehicle_id)
  if (vehicleIds.length === 0) {
    await supabase.from('user_budgets')
      .update({ spent_amount: 0, updated_at: new Date().toISOString() })
      .eq('id', budget.id)
    return { ...budget, spent_amount: 0 }
  }

  const startTs = budget.period_start + 'T00:00:00'
  const endTs   = budget.period_end   + 'T23:59:59'

  const { data: receipts, error } = await supabase
    .from('receipts')
    .select(`
      amount_paid,
      invoice:invoices!inner(
        vehicle_id, status,
        work_order:work_orders!inner(currency_id)
      )
    `)
    .gte('paid_at', startTs)
    .lte('paid_at', endTs)
    .eq('invoice.status', 'paid')
    .in('invoice.vehicle_id', vehicleIds)

  if (error) {
    console.error('recompute spend error:', error)
    return budget
  }

  // Currency filter in JS — see company-side comment for why.
  const total = (receipts || [])
    .filter(r => r.invoice?.work_order?.currency_id === budget.currency_id)
    .reduce((s, r) => s + Number(r.amount_paid || 0), 0)

  const { data: updated } = await supabase
    .from('user_budgets')
    .update({ spent_amount: total, updated_at: new Date().toISOString() })
    .eq('id', budget.id)
    .select(BUDGET_SELECT)
    .single()

  return updated || { ...budget, spent_amount: total }
}

// ── GET ────────────────────────────────────────────────────────────────────
// Query params:
//   ?recompute=1 — re-sync the current budget's spent_amount from receipts.
export async function GET(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveUser(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const url       = new URL(request.url)
    const recompute = url.searchParams.get('recompute') === '1'

    const today = new Date().toISOString().split('T')[0]

    let { data: budget, error } = await supabase
      .from('user_budgets')
      .select(BUDGET_SELECT)
      .eq('user_id', resolved.userId)
      .lte('period_start', today)
      .gte('period_end', today)
      .maybeSingle()
    if (error) throw error

    if (recompute && budget) {
      budget = await recomputeUserSpentAmount(supabase, budget, resolved.userId)
    }

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

    // Backfill spent_amount from existing receipts. Without this, any
    // payments made before this budget was created don't appear on the
    // tracker — the trigger only credits new payments going forward.
    const synced = await recomputeUserSpentAmount(supabase, budget, resolved.userId)

    return NextResponse.json({ success: true, budget: synced })
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

    // Same backfill rationale as POST. Also handles period moves and
    // currency changes — both reshape what "spent" means.
    const synced = await recomputeUserSpentAmount(supabase, budget, resolved.userId)

    return NextResponse.json({ success: true, budget: synced })
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