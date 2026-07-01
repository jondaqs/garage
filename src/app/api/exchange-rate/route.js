/**
 * GET  /api/exchange-rate?base_currency_id=...&quote_currency_id=...
 * POST /api/exchange-rate { base_currency_id, quote_currency_id }
 *
 * Returns today's exchange rate for converting `base` into `quote`.
 *
 * Strategy:
 *   1. Same currency? → return rate=1, source='identity'
 *   2. Check public.exchange_rates for today's row (one DB call via RPC)
 *   3. On miss, fetch from exchangerate.host (no API key required)
 *   4. Persist via upsert_exchange_rate RPC
 *   5. Return the rate plus its source so the UI can label "cached"/"live"
 *
 * Response shape:
 *   { rate: number, source: 'identity'|'cached'|'external', cached_at: iso }
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// External provider — free, no key, supports almost every ISO 4217 code.
// Returns shape:
//   { motd: {...}, success: true, query: {...}, info: { rate: 0.0077 } }
const EXCHANGERATE_HOST = 'https://api.exchangerate.host/convert'

async function resolveRate(supabase, baseId, quoteId) {
  if (!baseId || !quoteId) {
    return { error: 'base_currency_id and quote_currency_id are required', status: 400 }
  }
  if (baseId === quoteId) {
    return { rate: 1, source: 'identity', cached_at: new Date().toISOString() }
  }

  // 1. Look up both currencies' codes — the external API speaks codes, not uuids.
  const { data: rows, error: lookupErr } = await supabase
    .from('currencies')
    .select('id, code')
    .in('id', [baseId, quoteId])
  if (lookupErr) return { error: 'Exchange rate lookup failed', status: 500 }

  const baseRow  = rows?.find(r => r.id === baseId)
  const quoteRow = rows?.find(r => r.id === quoteId)
  if (!baseRow || !quoteRow) {
    return { error: 'Unknown currency_id', status: 404 }
  }

  // 2. Try cache via RPC. Returns the rate or NULL.
  const { data: cached, error: rpcErr } = await supabase.rpc('get_cached_exchange_rate', {
    p_base_currency_id:  baseId,
    p_quote_currency_id: quoteId,
  })
  if (rpcErr) return { error: 'Exchange rate update failed', status: 500 }
  if (cached != null) {
    return { rate: Number(cached), source: 'cached', cached_at: new Date().toISOString() }
  }

  // 3. Cache miss → external fetch.
  let externalRate
  try {
    const url = `${EXCHANGERATE_HOST}?from=${baseRow.code}&to=${quoteRow.code}&amount=1`
    const resp = await fetch(url, { headers: { 'accept': 'application/json' } })
    if (!resp.ok) {
      return { error: `Rate provider returned ${resp.status}`, status: 502 }
    }
    const json = await resp.json()
    // exchangerate.host shape: { success, info: { rate }, result, ... }
    // Some endpoints also expose `result` directly (1 unit converted). Prefer rate.
    externalRate = Number(json?.info?.rate ?? json?.result)
    if (!externalRate || externalRate <= 0 || Number.isNaN(externalRate)) {
      return { error: `Rate provider returned no usable rate (${baseRow.code}->${quoteRow.code})`, status: 502 }
    }
  } catch (e) {
    return { error: 'Rate provider unreachable', status: 502 }
  }

  // 4. Persist (best-effort; if the upsert fails we still return the live rate).
  const { error: upErr } = await supabase.rpc('upsert_exchange_rate', {
    p_base_currency_id:  baseId,
    p_quote_currency_id: quoteId,
    p_rate:              externalRate,
    p_source:            'external',
  })
  if (upErr) {
    console.warn('[exchange-rate] cache upsert failed (non-fatal):', upErr.message)
  }

  return { rate: externalRate, source: 'external', cached_at: new Date().toISOString() }
}

export async function GET(request) {
  try {
    const supabase = await createClient()

    // Require auth — same posture as the rest of the inventory/work-order APIs.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const result = await resolveRate(
      supabase,
      searchParams.get('base_currency_id'),
      searchParams.get('quote_currency_id'),
    )
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (err) {
    console.error('GET /api/exchange-rate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { base_currency_id, quote_currency_id } = await request.json()
    const result = await resolveRate(supabase, base_currency_id, quote_currency_id)
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (err) {
    console.error('POST /api/exchange-rate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}