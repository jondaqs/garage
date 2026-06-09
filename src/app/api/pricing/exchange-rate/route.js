/**
 * GET  /api/pricing/exchange-rate?currency_code=KES
 *
 * Public (no auth required) — returns the USD→target conversion rate
 * with a forex margin applied. Used by the /pricing page.
 *
 * Emulates the existing /api/exchange-rate logic but:
 *   - No auth required (pricing is public)
 *   - Always converts FROM USD (base pricing currency)
 *   - Applies a configurable forex margin (default 2.5%)
 *   - Returns both raw rate and margined rate
 *
 * Response shape:
 *   {
 *     rate: 129.50,           // raw mid-market rate
 *     margined_rate: 132.74,  // rate + 2.5% margin
 *     margin_pct: 2.5,
 *     currency_code: "KES",
 *     currency_symbol: "KSh",
 *     source: "cached" | "external" | "identity",
 *   }
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Forex margin — what banks/forex bureaus typically charge.
// Configurable: adjust as needed (1.5–3% is typical).
const FOREX_MARGIN_PCT = 2.5

const EXCHANGERATE_HOST = 'https://api.exchangerate.host/convert'

// Use service-role client for public access (bypasses RLS)
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function resolveUsdRate(supabase, targetCode) {
  if (!targetCode || targetCode === 'USD') {
    return { rate: 1, source: 'identity' }
  }

  // Resolve currency IDs
  const { data: currencies, error: curErr } = await supabase
    .from('currencies')
    .select('id, code, symbol, display_name')
    .in('code', ['USD', targetCode.toUpperCase()])
    .eq('is_active', true)

  if (curErr) return { error: curErr.message, status: 500 }

  const usdRow    = currencies?.find(c => c.code === 'USD')
  const targetRow = currencies?.find(c => c.code === targetCode.toUpperCase())

  if (!usdRow)    return { error: 'USD currency not configured', status: 404 }
  if (!targetRow) return { error: `Currency ${targetCode} not found`, status: 404 }

  // Check cache
  const { data: cached } = await supabase.rpc('get_cached_exchange_rate', {
    p_base_currency_id:  usdRow.id,
    p_quote_currency_id: targetRow.id,
  })

  if (cached != null && Number(cached) > 0) {
    return { rate: Number(cached), source: 'cached', currency: targetRow }
  }

  // Cache miss → external fetch
  try {
    const url = `${EXCHANGERATE_HOST}?from=USD&to=${targetRow.code}&amount=1`
    const resp = await fetch(url, { headers: { accept: 'application/json' } })
    if (!resp.ok) return { error: `Rate provider returned ${resp.status}`, status: 502 }

    const json = await resp.json()
    const externalRate = Number(json?.info?.rate ?? json?.result)
    if (!externalRate || externalRate <= 0 || Number.isNaN(externalRate)) {
      return { error: `No usable rate for USD→${targetRow.code}`, status: 502 }
    }

    // Cache it (best-effort)
    await supabase.rpc('upsert_exchange_rate', {
      p_base_currency_id:  usdRow.id,
      p_quote_currency_id: targetRow.id,
      p_rate:              externalRate,
      p_source:            'external',
    }).catch(() => {})

    return { rate: externalRate, source: 'external', currency: targetRow }
  } catch (e) {
    return { error: `Rate provider unreachable: ${e.message}`, status: 502 }
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const targetCode = searchParams.get('currency_code')

    if (!targetCode) {
      return NextResponse.json({ error: 'currency_code is required' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const result = await resolveUsdRate(supabase, targetCode)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const marginedRate = result.rate * (1 + FOREX_MARGIN_PCT / 100)

    return NextResponse.json({
      rate:           Math.round(result.rate * 10000) / 10000,
      margined_rate:  Math.round(marginedRate * 10000) / 10000,
      margin_pct:     FOREX_MARGIN_PCT,
      currency_code:  result.currency?.code || targetCode.toUpperCase(),
      currency_symbol: result.currency?.symbol || '',
      display_name:   result.currency?.display_name || '',
      source:         result.source,
    })
  } catch (err) {
    console.error('GET /api/pricing/exchange-rate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}