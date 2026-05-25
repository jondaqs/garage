import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Company budget API.
 *
 * Currency model:
 *   • Every budget row carries a currency_id (FK → currencies).
 *   • spent_amount is currency-scoped — only payments whose work order
 *     uses the same currency_id are credited (enforced server-side by
 *     process_payment + update_company_spending; this route doesn't
 *     touch spent_amount directly).
 *   • Strict uniqueness: one budget per (company_id, period_start,
 *     period_end). Switching currency on an existing period requires
 *     a PATCH; you can't create two budgets in the same window for
 *     different currencies.
 */

// Embed shape used in every SELECT so the client always gets the same
// currency snippet (code + symbol) without an extra round-trip.
const BUDGET_SELECT = '*, currency:currencies(id, code, symbol, display_name)'

// ── Resolve company + budget access for the current user ──────────────────
// Two access tiers:
//   canEdit — owner, is_admin, or staff_role='accountant'. Can POST/PATCH/DELETE.
//   canView — canEdit, or can_approve_payment=true (read-only access).
// Anyone outside both tiers gets a 403 even on GET. The legacy `isAdmin`
// flag is still returned in payloads for backwards-compat with callers
// that haven't been updated; new callers should use canEdit/canView.
async function resolveCompany(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return { error: 'User profile not found', status: 404 }

  // Owner — full access.
  const { data: owned } = await supabase
    .from('company_profiles').select('id')
    .eq('owner_user_id', profile.id).maybeSingle()
  if (owned) {
    return {
      companyId: owned.id, profileId: profile.id,
      canEdit:   true, canView: true,
      isAdmin:   true,   // legacy flag for older callers
    }
  }

  // Otherwise check the membership row for the relevant flags.
  const { data: member } = await supabase
    .from('company_users')
    .select('company_id, is_admin, staff_role, can_approve_payment')
    .eq('user_id', profile.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!member) return { error: 'Not associated with a company', status: 403 }

  const canEdit = !!member.is_admin || member.staff_role === 'accountant'
  const canView = canEdit || !!member.can_approve_payment

  if (!canView) return { error: 'You do not have access to budgets', status: 403 }

  return {
    companyId: member.company_id, profileId: profile.id,
    canEdit, canView,
    isAdmin: !!member.is_admin,
  }
}

// Translate a legacy `currency` text code into a currency_id when only the
// text was supplied. Lets older clients that haven't been upgraded yet
// keep working — they pass `currency: 'KES'` and we look up the row.
async function resolveCurrencyId(supabase, { currency_id, currency }) {
  if (currency_id) return currency_id
  if (!currency)   return null
  const { data } = await supabase
    .from('currencies').select('id').eq('code', currency.toUpperCase()).maybeSingle()
  return data?.id ?? null
}

// ── Recompute spent_amount from receipts ────────────────────────────────
// Why this exists: the trigger pipeline (update_company_spending +
// process_payment) only increments spent_amount on *new* payments.
// Receipts that pre-date the budget row never get credited that way,
// so the on-page progress bar shows 0 while the receipts panel
// (which queries live) shows real spend.
//
// We recompute on every successful POST/PATCH so the stored value
// converges with reality whenever the user touches the budget. Trigger
// increments still keep it live between saves; this is the corrective
// anchor that fixes the historical-spend gap.
//
// Filter shape matches the trigger:
//   • only paid invoices
//   • only company-owned vehicles
//   • only payments in the budget's currency
//   • only payments inside the budget window
async function recomputeCompanySpentAmount(supabase, budget, companyId) {
  if (!budget?.id || !budget?.currency_id || !companyId) return budget

  const { data: ownership } = await supabase
    .from('vehicle_ownership')
    .select('vehicle_id')
    .eq('owner_company_id', companyId)
  const vehicleIds = (ownership || []).map(r => r.vehicle_id)
  if (vehicleIds.length === 0) {
    // No fleet vehicles — just zero it out.
    await supabase.from('company_budgets')
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

  // Filter by currency in JS rather than via a nested PostgREST filter.
  // Nested-filter chains across multiple joins can behave inconsistently
  // depending on PostgREST version; this is rock-solid and the volume
  // is tiny (one budget period × one company's fleet).
  const total = (receipts || [])
    .filter(r => r.invoice?.work_order?.currency_id === budget.currency_id)
    .reduce((s, r) => s + Number(r.amount_paid || 0), 0)

  const { data: updated } = await supabase
    .from('company_budgets')
    .update({ spent_amount: total, updated_at: new Date().toISOString() })
    .eq('id', budget.id)
    .select(BUDGET_SELECT)
    .single()

  return updated || { ...budget, spent_amount: total }
}

// ── GET — fetch current period budget + history ────────────────────────────
// Query params:
//   ?recompute=1 — re-sync the current budget's spent_amount from receipts
//                  before returning. Use this when the on-page bar looks
//                  out of step with the receipts panel.
export async function GET(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveCompany(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const url       = new URL(request.url)
    const recompute = url.searchParams.get('recompute') === '1'

    const today = new Date().toISOString().split('T')[0]

    let { data: budget, error } = await supabase
      .from('company_budgets')
      .select(BUDGET_SELECT)
      .eq('company_id', resolved.companyId)
      .lte('period_start', today)
      .gte('period_end', today)
      .maybeSingle()
    if (error) throw error

    if (recompute && budget) {
      budget = await recomputeCompanySpentAmount(supabase, budget, resolved.companyId)
    }

    const { data: history } = await supabase
      .from('company_budgets')
      .select(BUDGET_SELECT)
      .eq('company_id', resolved.companyId)
      .order('period_start', { ascending: false })
      .limit(12)

    return NextResponse.json({
      success: true,
      budget:  budget || null,
      history: history || [],
      canEdit: resolved.canEdit,
      canView: resolved.canView,
      isAdmin: resolved.isAdmin,  // legacy, kept for any older caller
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
    if (!resolved.canEdit) {
      return NextResponse.json(
        { error: 'Only admins or accountants can set budgets' },
        { status: 403 }
      )
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

    const currency_id = await resolveCurrencyId(supabase, body)
    if (!currency_id) {
      return NextResponse.json({ error: 'Unknown or inactive currency' }, { status: 400 })
    }

    // Enforce "one budget per period" at the app layer too, so we can
    // surface a friendly error rather than a Postgres unique-violation.
    const { data: clash } = await supabase
      .from('company_budgets')
      .select('id')
      .eq('company_id',  resolved.companyId)
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
      .from('company_budgets')
      .insert([{
        company_id:    resolved.companyId,
        budget_amount: parseFloat(budget_amount),
        spent_amount:  0,
        period_start,
        period_end,
        currency,         // legacy text — kept in sync for backwards compat
        currency_id,
      }])
      .select(BUDGET_SELECT).single()
    if (error) throw error

    // Backfill spent_amount from existing receipts. Without this, any
    // payments made before this budget was created don't appear in
    // spent_amount — the trigger only credits new payments going forward.
    const synced = await recomputeCompanySpentAmount(supabase, budget, resolved.companyId)

    return NextResponse.json({ success: true, budget: synced })
  } catch (error) {
    console.error('Budget POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── PATCH — update existing budget ─────────────────────────────────────────
// Note: changing currency_id on a period that already has spend will
// invalidate spent_amount (it was accumulated against the old currency).
// We zero spent_amount on currency change so the new period starts clean —
// the trigger will rebuild it on subsequent payments.
export async function PATCH(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveCompany(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    if (!resolved.canEdit) {
      return NextResponse.json(
        { error: 'Only admins or accountants can update budgets' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, budget_amount, period_start, period_end, currency } = body
    if (!id) return NextResponse.json({ error: 'Budget id is required' }, { status: 400 })

    const { data: existing } = await supabase
      .from('company_budgets')
      .select('id, company_id, currency_id, period_start, period_end')
      .eq('id', id)
      .eq('company_id', resolved.companyId)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 })
    }

    const updates = { updated_at: new Date().toISOString() }
    if (budget_amount !== undefined) updates.budget_amount = parseFloat(budget_amount)
    if (period_start  !== undefined) updates.period_start  = period_start
    if (period_end    !== undefined) updates.period_end    = period_end
    if (currency      !== undefined) updates.currency      = currency  // legacy text

    if (body.currency_id !== undefined || currency !== undefined) {
      const newCurrencyId = await resolveCurrencyId(supabase, body)
      if (!newCurrencyId) {
        return NextResponse.json({ error: 'Unknown or inactive currency' }, { status: 400 })
      }
      if (newCurrencyId !== existing.currency_id) {
        updates.currency_id  = newCurrencyId
        updates.spent_amount = 0  // reset — see header comment
      }
    }

    // If the period is being moved, re-check for overlaps with sibling
    // rows. We need this even though the DB has a uniqueness constraint
    // because the constraint is exact-equality; overlapping-but-not-
    // identical ranges would slip through.
    const newStart = updates.period_start ?? existing.period_start
    const newEnd   = updates.period_end   ?? existing.period_end
    if (newStart !== existing.period_start || newEnd !== existing.period_end) {
      const { data: clash } = await supabase
        .from('company_budgets')
        .select('id')
        .eq('company_id', resolved.companyId)
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
      .from('company_budgets')
      .update(updates)
      .eq('id', id)
      .eq('company_id', resolved.companyId)
      .select(BUDGET_SELECT).single()
    if (error) throw error

    // Same backfill rationale as POST. Also handles the case where the
    // period was moved or the currency was changed — both reshape what
    // "spent" means and need a fresh recompute.
    const synced = await recomputeCompanySpentAmount(supabase, budget, resolved.companyId)

    return NextResponse.json({ success: true, budget: synced })
  } catch (error) {
    console.error('Budget PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// ── DELETE — remove a budget period ────────────────────────────────────────
export async function DELETE(request) {
  try {
    const supabase = await createClient()
    const resolved = await resolveCompany(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    if (!resolved.canEdit) {
      return NextResponse.json(
        { error: 'Only admins or accountants can delete budgets' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Budget id is required' }, { status: 400 })

    const { error } = await supabase
      .from('company_budgets')
      .delete()
      .eq('id', id)
      .eq('company_id', resolved.companyId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Budget DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}