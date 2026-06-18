/**
 * POST /api/admin/refresh-exchange-rates
 *
 * Admin-triggered rate refresh. Fetches current USD rates for all active
 * currencies and caches them in the exchange_rates table.
 * Called from the admin dashboard — no cron, no scheduled automation.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sc = getServiceClient()
    const results = { updated: 0, failed: 0, skipped: 0, errors: [] }

    // Get all active currencies except USD
    const { data: currencies, error: curErr } = await sc
      .from('currencies').select('id, code, symbol')
      .eq('is_active', true).neq('code', 'USD')

    if (curErr) throw new Error(`Failed to fetch currencies: ${curErr.message}`)

    const { data: usdRow } = await sc
      .from('currencies').select('id').eq('code', 'USD').eq('is_active', true).single()

    if (!usdRow) throw new Error('USD currency not configured')

    // Fetch all rates in one call
    let allRates = null
    let source = ''

    // Try open.er-api.com
    try {
      const resp = await fetch('https://open.er-api.com/v6/latest/USD', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      if (resp.ok) {
        const json = await resp.json()
        allRates = json?.rates || null
        source = 'open.er-api.com'
      }
    } catch (e) { console.warn('[refresh-rates] open.er-api.com failed:', e.message) }

    // Fallback: exchangerate.host
    if (!allRates) {
      try {
        const apiKey = process.env.EXCHANGERATE_HOST_KEY || ''
        const url = apiKey
          ? `https://api.exchangerate.host/latest?base=USD&access_key=${apiKey}`
          : `https://api.exchangerate.host/latest?base=USD`
        const resp = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        if (resp.ok) {
          const json = await resp.json()
          allRates = json?.rates || null
          source = 'exchangerate.host'
        }
      } catch (e) { console.warn('[refresh-rates] exchangerate.host failed:', e.message) }
    }

    if (!allRates) {
      return NextResponse.json({
        success: false,
        error: 'All rate providers failed. No rates updated.',
      }, { status: 502 })
    }

    // Upsert each rate
    for (const currency of (currencies || [])) {
      const rate = allRates[currency.code]
      if (!rate || rate <= 0) { results.skipped++; continue }

      try {
        const { error } = await sc.rpc('upsert_exchange_rate', {
          p_base_currency_id: usdRow.id,
          p_quote_currency_id: currency.id,
          p_rate: Number(rate),
          p_source: source,
        })
        if (error) throw error
        results.updated++
      } catch (e) {
        results.failed++
        results.errors.push(`${currency.code}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true, ...results,
      total_currencies: currencies?.length || 0,
      source,
      refreshed_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[refresh-rates] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}