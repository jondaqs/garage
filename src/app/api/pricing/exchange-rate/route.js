/**
 * GET /api/pricing/exchange-rate?currency_code=KES
 *
 * AUTHENTICATED ONLY — returns USD→target conversion rate.
 * DB cache first → external API fallback if cache is empty.
 *
 * Public pages (pricing) use the get_public_exchange_rate RPC
 * directly via Supabase client — they don't call this endpoint.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const FOREX_MARGIN_PCT = 2.5

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveUsdRate(supabase, targetCode) {
  const code = targetCode.toUpperCase()
  if (code === 'USD') return { rate: 1, source: 'identity', currency: { code: 'USD', symbol: '$', display_name: 'US Dollar' } }

  const { data: currencies } = await supabase
    .from('currencies').select('id, code, symbol, display_name')
    .in('code', ['USD', code]).eq('is_active', true)

  const usdRow = currencies?.find(c => c.code === 'USD')
  const target = currencies?.find(c => c.code === code)
  if (!usdRow || !target) return { error: `Currency ${code} not found`, status: 404 }

  // 1. Try DB cache
  try {
    const { data: cached } = await supabase.rpc('get_cached_exchange_rate', {
      p_base_currency_id: usdRow.id, p_quote_currency_id: target.id,
    })
    if (cached != null && Number(cached) > 0) {
      return { rate: Number(cached), source: 'cached', currency: target }
    }
  } catch { /* cache miss */ }

  // 2. Try open.er-api.com
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000),
    })
    if (resp.ok) {
      const json = await resp.json()
      const rate = Number(json?.rates?.[code])
      if (rate > 0) {
        try { await supabase.rpc('upsert_exchange_rate', { p_base_currency_id: usdRow.id, p_quote_currency_id: target.id, p_rate: rate, p_source: 'open.er-api.com' }) } catch {}
        return { rate, source: 'open.er-api.com', currency: target }
      }
    }
  } catch {}

  // 3. Try exchangerate.host
  try {
    const apiKey = process.env.EXCHANGERATE_HOST_KEY || ''
    const url = apiKey
      ? `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1&access_key=${apiKey}`
      : `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1`
    const resp = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (resp.ok) {
      const json = await resp.json()
      const rate = Number(json?.info?.rate ?? json?.result ?? json?.rates?.[code])
      if (rate > 0) {
        try { await supabase.rpc('upsert_exchange_rate', { p_base_currency_id: usdRow.id, p_quote_currency_id: target.id, p_rate: rate, p_source: 'exchangerate.host' }) } catch {}
        return { rate, source: 'exchangerate.host', currency: target }
      }
    }
  } catch {}

  return { error: `Unable to resolve rate for USD→${code}`, status: 503 }
}

export async function GET(request) {
  try {
    // ── Auth required ───────────────────────────────────────────
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const authClient = await createServerClient()
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const targetCode = searchParams.get('currency_code')
    if (!targetCode) return NextResponse.json({ error: 'currency_code is required' }, { status: 400 })

    const supabase = getServiceClient()
    const result = await resolveUsdRate(supabase, targetCode)

    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })

    const marginedRate = result.rate * (1 + FOREX_MARGIN_PCT / 100)

    const response = NextResponse.json({
      rate:            Math.round(result.rate * 10000) / 10000,
      margined_rate:   Math.round(marginedRate * 10000) / 10000,
      currency_code:   result.currency?.code || targetCode.toUpperCase(),
      currency_symbol: result.currency?.symbol || '',
      display_name:    result.currency?.display_name || '',
      source:          result.source,
    })

    response.headers.set('Cache-Control', 'private, max-age=1800')
    return response
  } catch (err) {
    console.error('GET /api/pricing/exchange-rate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}