/**
 * GET  /api/pricing/exchange-rate?currency_code=KES
 *
 * Returns USD→target conversion rate with forex margin.
 * Fallback chain: DB cache (RPC) → open.er-api.com → exchangerate.host → 503
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
  const errors = [] // collect debug info

  // Resolve currency records
  const { data: currencies, error: curErr } = await supabase
    .from('currencies')
    .select('id, code, symbol, display_name')
    .in('code', ['USD', code])
    .eq('is_active', true)

  if (curErr) {
    return { error: `Currency lookup failed: ${curErr.message}`, status: 500 }
  }

  const usdRow    = currencies?.find(c => c.code === 'USD')
  const targetRow = currencies?.find(c => c.code === code)

  if (!usdRow)    return { error: 'USD currency not configured in database', status: 404 }
  if (!targetRow) return { error: `Currency ${code} not found in database`, status: 404 }

  // ── 1. Check DB cache via RPC ──
  try {
    const { data: cached, error: cacheErr } = await supabase.rpc('get_cached_exchange_rate', {
      p_base_currency_id:  usdRow.id,
      p_quote_currency_id: targetRow.id,
    })
    if (cacheErr) {
      errors.push(`cache_rpc: ${cacheErr.message}`)
      console.warn('[exchange-rate] cache RPC error:', cacheErr.message)
    } else if (cached != null && Number(cached) > 0) {
      console.log(`[exchange-rate] cache hit: USD→${code} = ${cached}`)
      return { rate: Number(cached), source: 'cached', currency: targetRow }
    } else {
      errors.push('cache_rpc: returned null or 0')
    }
  } catch (e) {
    errors.push(`cache_rpc_exception: ${e.message}`)
    console.warn('[exchange-rate] cache RPC exception:', e.message)
  }

  // ── 2. Try open.er-api.com (free, no key) ──
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (resp.ok) {
      const json = await resp.json()
      const externalRate = Number(json?.rates?.[code])
      if (externalRate && externalRate > 0) {
        console.log(`[exchange-rate] open.er-api: USD→${code} = ${externalRate}`)
        // Cache via RPC
        try {
          await supabase.rpc('upsert_exchange_rate', {
            p_base_currency_id:  usdRow.id,
            p_quote_currency_id: targetRow.id,
            p_rate:              externalRate,
            p_source:            'open.er-api.com',
          })
        } catch (ce) { console.warn('[exchange-rate] cache upsert failed:', ce.message) }
        return { rate: externalRate, source: 'external', currency: targetRow }
      } else {
        errors.push(`open_er_api: no rate for ${code} in response`)
      }
    } else {
      errors.push(`open_er_api: HTTP ${resp.status}`)
      console.warn('[exchange-rate] open.er-api status:', resp.status)
    }
  } catch (e) {
    errors.push(`open_er_api: ${e.message}`)
    console.warn('[exchange-rate] open.er-api failed:', e.message)
  }

  // ── 3. Try exchangerate.host ──
  try {
    const apiKey = process.env.EXCHANGERATE_HOST_KEY || ''
    const url = apiKey
      ? `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1&access_key=${apiKey}`
      : `https://api.exchangerate.host/convert?from=USD&to=${code}&amount=1`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (resp.ok) {
      const json = await resp.json()
      const rate = Number(json?.info?.rate ?? json?.result ?? json?.rates?.[code])
      if (rate && rate > 0) {
        console.log(`[exchange-rate] exchangerate.host: USD→${code} = ${rate}`)
        try {
          await supabase.rpc('upsert_exchange_rate', {
            p_base_currency_id:  usdRow.id,
            p_quote_currency_id: targetRow.id,
            p_rate:              rate,
            p_source:            'exchangerate.host',
          })
        } catch (ce) { console.warn('[exchange-rate] cache upsert failed:', ce.message) }
        return { rate, source: 'external', currency: targetRow }
      } else {
        errors.push(`exchangerate_host: parsed rate is ${rate}, raw: ${JSON.stringify(json).substring(0, 150)}`)
        console.warn('[exchange-rate] exchangerate.host no valid rate:', JSON.stringify(json).substring(0, 200))
      }
    } else {
      errors.push(`exchangerate_host: HTTP ${resp.status}`)
      console.warn('[exchange-rate] exchangerate.host status:', resp.status)
    }
  } catch (e) {
    errors.push(`exchangerate_host: ${e.message}`)
    console.warn('[exchange-rate] exchangerate.host failed:', e.message)
  }

  // ── 4. All failed — return debug info ──
  console.error(`[exchange-rate] ALL SOURCES FAILED for USD→${code}:`, errors)
  return {
    error: `Unable to resolve rate for USD→${code}. Refresh rates from admin dashboard. Debug: ${errors.join(' | ')}`,
    status: 503,
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
      rate:            Math.round(result.rate * 10000) / 10000,
      margined_rate:   Math.round(marginedRate * 10000) / 10000,
      margin_pct:      FOREX_MARGIN_PCT,
      currency_code:   result.currency?.code || targetCode.toUpperCase(),
      currency_symbol: result.currency?.symbol || '',
      display_name:    result.currency?.display_name || '',
      source:          result.source,
    })
  } catch (err) {
    console.error('GET /api/pricing/exchange-rate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}