/**
 * GET /api/pricing/exchange-rate?currency_code=KES
 *
 * Returns USD→target conversion rate with forex margin.
 *
 * PUBLIC (unauthenticated): reads from DB cache only — cron keeps it fresh.
 * AUTHENTICATED: DB cache first → external API fallback if cache is stale.
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

/**
 * Read rate from DB cache (exchange_rates table via RPC).
 * Returns { rate, source, currency } or null if not cached.
 */
async function readCachedRate(supabase, targetCode) {
  const code = targetCode.toUpperCase()

  const { data: currencies } = await supabase
    .from('currencies')
    .select('id, code, symbol, display_name')
    .in('code', ['USD', code])
    .eq('is_active', true)

  const usdRow    = currencies?.find(c => c.code === 'USD')
  const targetRow = currencies?.find(c => c.code === code)

  if (!usdRow || !targetRow) return null

  try {
    const { data: cached, error } = await supabase.rpc('get_cached_exchange_rate', {
      p_base_currency_id:  usdRow.id,
      p_quote_currency_id: targetRow.id,
    })
    if (!error && cached != null && Number(cached) > 0) {
      return { rate: Number(cached), source: 'cached', currency: targetRow }
    }
  } catch { /* cache miss */ }

  return null
}

/**
 * Fetch from external APIs and cache the result.
 * Only called for authenticated users when DB cache is empty.
 */
async function fetchAndCacheRate(supabase, targetCode) {
  const code = targetCode.toUpperCase()

  const { data: currencies } = await supabase
    .from('currencies')
    .select('id, code, symbol, display_name')
    .in('code', ['USD', code])
    .eq('is_active', true)

  const usdRow    = currencies?.find(c => c.code === 'USD')
  const targetRow = currencies?.find(c => c.code === code)

  if (!usdRow || !targetRow) {
    return { error: `Currency ${code} not found`, status: 404 }
  }

  // Try open.er-api.com
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (resp.ok) {
      const json = await resp.json()
      const externalRate = Number(json?.rates?.[code])
      if (externalRate && externalRate > 0) {
        try {
          await supabase.rpc('upsert_exchange_rate', {
            p_base_currency_id: usdRow.id, p_quote_currency_id: targetRow.id,
            p_rate: externalRate, p_source: 'open.er-api.com',
          })
        } catch { /* cache write failed */ }
        return { rate: externalRate, source: 'external', currency: targetRow }
      }
    }
  } catch { /* open.er-api failed */ }

  // Try exchangerate.host
  try {
    const apiKey = process.env.EXCHANGERATE_HOST_KEY || ''
    const url = apiKey
      ? `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1&access_key=${apiKey}`
      : `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1`
    const resp = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (resp.ok) {
      const json = await resp.json()
      const rate = Number(json?.info?.rate ?? json?.result ?? json?.rates?.[code])
      if (rate && rate > 0) {
        try {
          await supabase.rpc('upsert_exchange_rate', {
            p_base_currency_id: usdRow.id, p_quote_currency_id: targetRow.id,
            p_rate: rate, p_source: 'exchangerate.host',
          })
        } catch { /* cache write failed */ }
        return { rate, source: 'external', currency: targetRow }
      }
    }
  } catch { /* exchangerate.host failed */ }

  return { error: `Unable to resolve rate for USD→${code}`, status: 503 }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const targetCode = searchParams.get('currency_code')

    if (!targetCode) {
      return NextResponse.json({ error: 'currency_code is required' }, { status: 400 })
    }

    if (targetCode.toUpperCase() === 'USD') {
      return NextResponse.json({
        rate: 1, margined_rate: 1,
        currency_code: 'USD', currency_symbol: '$', display_name: 'US Dollar',
        source: 'identity',
      })
    }

    const supabase = getServiceClient()

    // ── Check auth ──────────────────────────────────────────────────
    let isAuthenticated = false
    try {
      const { createClient: createServerClient } = await import('@/lib/supabase/server')
      const authClient = await createServerClient()
      const { data: { user } } = await authClient.auth.getUser()
      isAuthenticated = !!user
    } catch { /* not authenticated */ }

    // ── 1. Always try DB cache first ────────────────────────────────
    let result = await readCachedRate(supabase, targetCode)

    // ── 2. Authenticated users get external fallback if cache is empty
    if (!result && isAuthenticated) {
      const external = await fetchAndCacheRate(supabase, targetCode)
      if (external.error) {
        return NextResponse.json({ error: external.error }, { status: external.status })
      }
      result = external
    }

    // ── 3. Public with no cache → tell them rates aren't available yet
    if (!result) {
      return NextResponse.json({
        error: 'Exchange rate not available yet. Rates are updated automatically — please try again shortly.',
      }, { status: 503 })
    }

    const marginedRate = result.rate * (1 + FOREX_MARGIN_PCT / 100)

    const response = NextResponse.json({
      rate:            Math.round(result.rate * 10000) / 10000,
      margined_rate:   Math.round(marginedRate * 10000) / 10000,
      currency_code:   result.currency?.code || targetCode.toUpperCase(),
      currency_symbol: result.currency?.symbol || '',
      display_name:    result.currency?.display_name || '',
      source:          result.source,
    })

    // Public: aggressive CDN cache (1 hour). Private: shorter cache.
    response.headers.set('Cache-Control',
      isAuthenticated ? 'private, max-age=1800' : 'public, max-age=3600, s-maxage=3600'
    )

    return response
  } catch (err) {
    console.error('GET /api/pricing/exchange-rate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}