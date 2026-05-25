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

// ── Resolve company + admin status for the current user ────────────────────
async function resolveCompany(supabase) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return { error: 'User profile not found', status: 404 }

  const { data: owned } = await supabase
    .from('company_profiles').select('id')
    .eq('owner_user_id', profile.id).maybeSingle()

  if (owned) return { companyId: owned.id, isAdmin: true, profileId: profile.id }

  const { data: member } = await supabase
    .from('company_users').select('company_id, is_admin')
    .eq('user_id', profile.id).eq('is_active', true).maybeSingle()

  if (member) return { companyId: member.company_id, isAdmin: member.is_admin, profileId: profile.id }

  return { error: 'Not associated with a company', status: 403 }
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

// ── GET — fetch current period budget + history ────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient()
    const resolved = await resolveCompany(supabase)
    if (resolved.error) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const today = new Date().toISOString().split('T')[0]

    const { data: budget, error } = await supabase
      .from('company_budgets')
      .select(BUDGET_SELECT)
      .eq('company_id', resolved.companyId)
      .lte('period_start', today)
      .gte('period_end', today)
      .maybeSingle()
    if (error) throw error

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

    return NextResponse.json({ success: true, budget })
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
    if (!resolved.isAdmin) {
      return NextResponse.json({ error: 'Only company admins can update budgets' }, { status: 403 })
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

    return NextResponse.json({ success: true, budget })
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
    if (!resolved.isAdmin) {
      return NextResponse.json({ error: 'Only company admins can delete budgets' }, { status: 403 })
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