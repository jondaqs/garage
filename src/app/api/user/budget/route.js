import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { writeLimiter } from '@/lib/rateLimiters'

/**
 * Personal user budget API.
 *
 * Thin wrapper over four SECURITY DEFINER RPCs (get/create/update/delete
 * _user_budget). Permission story is simple: only the budget's owner
 * can touch it. The RPC validates that.
 */

async function resolveCurrencyId(supabase, body) {
  if (body?.currency_id) return body.currency_id
  if (!body?.currency)   return null
  const { data } = await supabase
    .from('currencies').select('id').eq('code', body.currency.toUpperCase()).maybeSingle()
  return data?.id ?? null
}

async function requireAuth(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

function rpcResponse(data, rpcError, defaultStatus = 200) {
  if (rpcError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!data?.success) {
    const msg = data?.error || 'Unknown error'
    const status = /unauthor/i.test(msg)                              ? 401
                : /not found/i.test(msg)                              ? 404
                : /overlap|already exists/i.test(msg)                 ? 409
                : /required|valid|after|unknown|inactive/i.test(msg) ? 400
                : defaultStatus
    return NextResponse.json({ error: msg }, { status })
  }
  return NextResponse.json(data)
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  const supabase = await createClient()
  if (!(await requireAuth(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const recompute = new URL(request.url).searchParams.get('recompute') === '1'
  const { data, error } = await supabase.rpc('get_user_budget', { p_recompute: recompute })

  if (!error && data?.success) {
    return NextResponse.json({
      success: true,
      budget:  data.budget  || null,
      history: data.history || [],
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

  const { data, error } = await supabase.rpc('create_user_budget', {
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

  const { data, error } = await supabase.rpc('update_user_budget', {
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

  const { data, error } = await supabase.rpc('delete_user_budget', { p_id: id })
  return rpcResponse(data, error)
}