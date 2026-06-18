/**
 * GET  /api/pricing/exchange-rate?currency_code=KES
 *
 * Returns USD→target conversion rate with forex margin.
 * Multi-provider fallback: DB cache → open.er-api.com → hardcoded emergency rates.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const FOREX_MARGIN_PCT = 2.5

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

  const code = targetCode.toUpperCase()

  // Resolve currency IDs
  const { data: currencies, error: curErr } = await supabase
    .from('currencies')
    .select('id, code, symbol, display_name')
    .in('code', ['USD', code])
    .eq('is_active', true)

  if (curErr) return { error: curErr.message, status: 500 }

  const usdRow    = currencies?.find(c => c.code === 'USD')
  const targetRow = currencies?.find(c => c.code === code)

  if (!usdRow)    return { error: 'USD currency not configured', status: 404 }
  if (!targetRow) return { error: `Currency ${code} not found`, status: 404 }

  // ── 1. Check DB cache ──
  try {
    const { data: cached } = await supabase.rpc('get_cached_exchange_rate', {
      p_base_currency_id:  usdRow.id,
      p_quote_currency_id: targetRow.id,
    })
    if (cached != null && Number(cached) > 0) {
      return { rate: Number(cached), source: 'cached', currency: targetRow }
    }
  } catch (e) {
    console.warn('[exchange-rate] cache lookup failed:', e.message)
  }

  // ── 2. Try open.er-api.com (free, no API key) ──
  try {
    const resp = await fetch(`https://open.er-api.com/v6/latest/USD`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (resp.ok) {
      const json = await resp.json()
      const externalRate = Number(json?.rates?.[code])
      if (externalRate && externalRate > 0) {
        // Cache it
        await supabase.rpc('upsert_exchange_rate', {
          p_base_currency_id:  usdRow.id,
          p_quote_currency_id: targetRow.id,
          p_rate:              externalRate,
          p_source:            'open.er-api.com',
        }).catch(() => {})
        return { rate: externalRate, source: 'external', currency: targetRow }
      }
    }
  } catch (e) {
    console.warn('[exchange-rate] open.er-api.com failed:', e.message)
  }

  // ── 3. Try exchangerate.host (legacy, may need API key) ──
  try {
    const apiKey = process.env.EXCHANGERATE_HOST_KEY || ''
    const url = apiKey
      ? `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1&access_key=${apiKey}`
      : `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1`
    const resp = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (resp.ok) {
      const json = await resp.json()
      const rate = Number(json?.info?.rate ?? json?.result)
      if (rate && rate > 0) {
        await supabase.rpc('upsert_exchange_rate', {
          p_base_currency_id:  usdRow.id,
          p_quote_currency_id: targetRow.id,
          p_rate:              rate,
          p_source:            'exchangerate.host',
        }).catch(() => {})
        return { rate, source: 'external', currency: targetRow }
      }
    }
  } catch (e) {
    console.warn('[exchange-rate] exchangerate.host failed:', e.message)
  }

  // ── 4. Nothing worked — DB cache was empty and external APIs failed ──
  return { error: `Unable to resolve rate for USD→${code}. Refresh rates from admin dashboard.`, status: 503 }
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