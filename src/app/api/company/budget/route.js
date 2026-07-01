import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { writeLimiter } from '@/lib/rateLimiters'

/**
 * Company budget API.
 *
 * Thin wrapper over four SECURITY DEFINER RPCs:
 *   get_company_budget(recompute?)
 *   create_company_budget(period_start, period_end, amount, currency_id)
 *   update_company_budget(id, period_start?, period_end?, amount?, currency_id?)
 *   delete_company_budget(id)
 *
 * All permission checks (canEdit / canView, owner / admin / accountant /
 * payment-approver) happen inside the RPCs. RLS on company_budgets stays
 * restrictive as a defense-in-depth layer — this route does not touch
 * the table directly.
 *
 * Backwards-compat note: older callers passed `currency: "KES"` as a
 * text code. POST/PATCH still accept that; we resolve to currency_id
 * before calling the RPC.
 */

async function resolveCurrencyId(supabase, body) {
  if (body?.currency_id) return body.currency_id
  if (!body?.currency)   return null
  const { data } = await supabase
    .from('currencies').select('id').eq('code', body.currency.toUpperCase()).maybeSingle()
  return data?.id ?? null
}

// Single helper: ensure the caller is authenticated. The RPC handles
// the rest of the permission story.
async function requireAuth(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// Map an RPC payload into a NextResponse.
// RPC payloads are always { success: bool, error?: text, ... }.
function rpcResponse(data, rpcError, defaultStatus = 200) {
  if (rpcError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!data?.success) {
    // Map common business errors to clean HTTP statuses.
    const msg = data?.error || 'Unknown error'
    const status = /access|admin|accountant|unauthor/i.test(msg) ? 403
                : /not found/i.test(msg)                          ? 404
                : /overlap|already exists/i.test(msg)             ? 409
                : /required|valid|after|unknown|inactive/i.test(msg) ? 400
                : defaultStatus
    return NextResponse.json({ error: msg }, { status })
  }
  return NextResponse.json(data)
}

// ── GET ────────────────────────────────────────────────────────────────────
// Query params:
//   ?recompute=1 — re-sync spent_amount from receipts before returning.
export async function GET(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  const supabase = await createClient()
  if (!(await requireAuth(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const recompute = new URL(request.url).searchParams.get('recompute') === '1'
  const { data, error } = await supabase.rpc('get_company_budget', { p_recompute: recompute })

  if (!error && data?.success) {
    // Normalise the snake_case flags the RPC returns into the camelCase
    // shape the existing page code expects. isAdmin is kept for any
    // legacy callers; new code should read canEdit/canView.
    return NextResponse.json({
      success: true,
      budget:  data.budget  || null,
      history: data.history || [],
      canEdit: !!data.can_edit,
      canView: !!data.can_view,
      isAdmin: !!data.can_edit,  // legacy
    })
  }
  return rpcResponse(data, error)
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(request) {
  const limited2 = writeLimiter.check(request)
  if (limited2) return limited2

  const supabase = await createClient()
  if (!(await requireAuth(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const currency_id = await resolveCurrencyId(supabase, body)

  const { data, error } = await supabase.rpc('create_company_budget', {
    p_period_start:  body.period_start,
    p_period_end:    body.period_end,
    p_budget_amount: body.budget_amount,
    p_currency_id:   currency_id,
  })
  return rpcResponse(data, error)
}

// ── PATCH ──────────────────────────────────────────────────────────────────
export async function PATCH(request) {
  const limited3 = writeLimiter.check(request)
  if (limited3) return limited3

  const supabase = await createClient()
  if (!(await requireAuth(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  if (!body?.id) {
    return NextResponse.json({ error: 'Budget id is required' }, { status: 400 })
  }
  const currency_id = (body.currency_id || body.currency)
    ? await resolveCurrencyId(supabase, body)
    : null

  const { data, error } = await supabase.rpc('update_company_budget', {
    p_id:            body.id,
    p_period_start:  body.period_start  ?? null,
    p_period_end:    body.period_end    ?? null,
    p_budget_amount: body.budget_amount ?? null,
    p_currency_id:   currency_id,
  })
  return rpcResponse(data, error)
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(request) {
  const limited4 = writeLimiter.check(request)
  if (limited4) return limited4

  const supabase = await createClient()
  if (!(await requireAuth(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Budget id is required' }, { status: 400 })

  const { data, error } = await supabase.rpc('delete_company_budget', { p_id: id })
  return rpcResponse(data, error)
}