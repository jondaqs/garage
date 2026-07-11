'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Plus, X, AlertTriangle, CheckCircle,
  AlertCircle, Package, Loader2, PlayCircle,
  SkipForward, Edit3, Wrench
} from 'lucide-react'

const PART_STATUS_STYLES = {
  requested:     'bg-gray-100 text-gray-600',
  reserved:      'bg-blue-100 text-blue-700',
  pending_order: 'bg-yellow-100 text-yellow-700',
  in_use:        'bg-orange-100 text-orange-700',
  used:          'bg-green-100 text-green-700',
  returned:      'bg-gray-100 text-gray-500',
  cancelled:     'bg-red-100 text-red-500 line-through',
}

export default function PartsTab({ workOrder, readOnly = false, onReApprovalNeeded, isAdminOrOwner = false }) {
  const supabase = createClient()

  const [reservedParts, setReservedParts] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState('')

  // Work order's own currency (the conversion target) — fetched once on mount.
  const [woCurrency, setWoCurrency] = useState(null)

  // Search / reserve
  const [search,        setSearch]        = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching,     setSearching]     = useState(false)
  const [showSearch,    setShowSearch]    = useState(false)
  const [qty,           setQty]           = useState({})
  const [partNotes,     setPartNotes]     = useState({})

  // Shop scoping: when this work order has a shop_id and the toggle is on,
  // inventory search results are restricted to parts assigned to the same
  // shop (parts with shop_id IS NULL are also excluded, since "assigned to
  // shop X" means strictly equal). Defaults ON when the WO has a shop so
  // mechanics see their local stock first; toggle off to widen the search
  // to the provider's full inventory across all shops.
  const woShopId = workOrder.shop_id || null
  const [restrictToShop, setRestrictToShop] = useState(!!woShopId)

  // Inline editing: unit_price while reserved
  const [editingPrice,  setEditingPrice]  = useState({})  // { [id]: string }
  // Inline editing: exchange_rate while reserved (independent toggle so the
  // provider can adjust the rate without re-entering the price).
  const [editingRate,   setEditingRate]   = useState({})  // { [id]: string }

  // Inline actual price on mark-used
  const [markingUsed,   setMarkingUsed]   = useState({})  // { [id]: { actual_price: string } }

  // Toast helper
  const showToast = (msg) => { setError(msg); setTimeout(() => setError(''), 3500) }

  const statusCode    = workOrder.status?.code
  const isTerminal    = ['completed','cancelled','closed','awaiting_customer_checkout'].includes(statusCode)
  const isLocked      = isTerminal && !isAdminOrOwner
  // Parts can only be transitioned after customer approves the estimate
  const customerApproved = ['approved','in_progress','quality_check','rework','completed','awaiting_customer_checkout','closed'].includes(statusCode)

  // Format a numeric value with the appropriate currency code/symbol.
  // Falls back to bare number if no currency is available.
  const fmt = (n, currency) => {
    if (n == null) return '—'
    const num = Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (!currency) return num
    return `${currency.symbol || currency.code} ${num}`
  }

  // Resolve a part-line's currency. Snapshot on work_order_parts (currency_id +
  // line_currency joined as `line_currency`) is the source of truth for the
  // line's original currency; falls back to the inventory currency for legacy
  // rows reserved before the snapshot column existed.
  const lineCurrency = (p) => p.line_currency || p.part?.currency || null

  // Total in the line's original currency.
  const lineTotal = (p) => {
    const price = p.unit_price ?? p.part?.unit_price
    return (p.quantity && price) ? fmt(p.quantity * price, lineCurrency(p)) : '—'
  }

  // Total in the work order's currency, applying the snapshotted exchange rate.
  // Returns null when no conversion is needed (same currency) or no rate is
  // available — the caller can decide whether to show the line.
  const convertedLineTotal = (p) => {
    const price = p.unit_price ?? p.part?.unit_price
    if (!p.quantity || !price) return null
    const lc = lineCurrency(p)
    // Same currency or work order currency unknown — no conversion to render.
    if (!woCurrency || !lc || lc.id === woCurrency.id) return null
    const rate = Number(p.exchange_rate)
    if (!rate || Number.isNaN(rate) || rate <= 0) return null
    return p.quantity * price * rate
  }

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadParts = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('work_order_parts')
        .select(`
          id, quantity, unit_price, notes, requested_at,
          currency_id, exchange_rate,
          line_currency:currencies!work_order_parts_currency_id_fkey(id, code, symbol, display_name),
          status:work_order_parts_statuses(code, display_name),
          part:spare_parts(
            id, name, sku, brand, unit_price, stock, category,
            currency:currencies(id, code, symbol, display_name)
          )
        `)
        .eq('work_order_id', workOrder.id)
        .order('requested_at', { ascending: false })
      if (err) throw err
      setReservedParts(data || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [workOrder.id])

  // Fetch this work order's own currency once. We do it separately because
  // the parent page passes us `workOrder` with currency_id but no joined
  // currencies row; keeping the join here means PartsTab is self-contained.
  useEffect(() => {
    let cancelled = false
    async function loadWoCurrency () {
      if (!workOrder.currency_id) { setWoCurrency(null); return }
      const { data } = await supabase
        .from('currencies')
        .select('id, code, symbol, display_name')
        .eq('id', workOrder.currency_id)
        .single()
      if (!cancelled) setWoCurrency(data || null)
    }
    loadWoCurrency()
    return () => { cancelled = true }
  }, [workOrder.currency_id])

  useEffect(() => { loadParts() }, [loadParts])

  // ── Search inventory ──────────────────────────────────────────────────────
  const handleSearch = useCallback(async (q) => {
    setSearch(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      let query = supabase
        .from('spare_parts')
        .select(`
          id, name, sku, brand, category, stock, min_stock_level, unit_price, shop_id,
          currency:currencies(id, code, symbol, display_name)
        `)
        .eq('service_provider_id', workOrder.service_provider_id)
        .eq('is_active', true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%`)

      // Optional shop-scope filter. .eq with a uuid won't match NULL rows,
      // so unassigned inventory (shop_id IS NULL) is correctly excluded when
      // the toggle is on.
      if (restrictToShop && woShopId) {
        query = query.eq('shop_id', woShopId)
      }

      const { data } = await query.order('name').limit(20)
      setSearchResults(data || [])
    } catch {}
    finally { setSearching(false) }
  }, [workOrder.service_provider_id, restrictToShop, woShopId, supabase])

  // Re-run the current search when the shop-scope toggle flips so results
  // refresh without the user having to retype. Guarded on >=2 chars to
  // match handleSearch's own guard above.
  useEffect(() => {
    if (search.trim().length >= 2) handleSearch(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictToShop])

  // ── Reserve ───────────────────────────────────────────────────────────────
  const handleReserve = async (part) => {
    const quantity = parseInt(qty[part.id] || 1)
    if (!quantity || quantity < 1) { setError('Enter a valid quantity'); return }
    if (quantity > part.stock)     { setError(`Only ${part.stock} in stock`); return }
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Resolve the exchange rate if the part is in a different currency than
      // the work order. The API hits the cache first; only the first lookup
      // of the day per currency pair touches the external provider.
      let exchangeRate = null
      const partCurrencyId = part.currency?.id || null
      const woCurrencyId   = woCurrency?.id    || null
      if (partCurrencyId && woCurrencyId && partCurrencyId !== woCurrencyId) {
        const resp = await fetch(
          `/api/exchange-rate?base_currency_id=${partCurrencyId}&quote_currency_id=${woCurrencyId}`
        )
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}))
          throw new Error(`Couldn't fetch exchange rate (${part.currency.code}→${woCurrency.code}): ${errBody.error || resp.statusText}`)
        }
        const body = await resp.json()
        exchangeRate = body.rate
      }

      const { data, error: rpcErr } = await supabase.rpc('reserve_part_for_work_order', {
        p_work_order_id:    workOrder.id,
        p_spare_part_id:    part.id,
        p_quantity:         quantity,
        p_provider_user_id: user.id,
        p_notes:            partNotes[part.id] || null,
        p_exchange_rate:    exchangeRate,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setShowSearch(false); setSearch(''); setSearchResults([]); setQty({})
      await loadParts()
      if (customerApproved) {
        setSuccess(`${part.name} × ${quantity} reserved. Since the customer already approved the estimate, re-approval is required.`)
        onReApprovalNeeded?.()
      } else {
        setSuccess(`${part.name} × ${quantity} reserved. Stock remaining: ${data.remaining_stock}`)
      }
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Release (return to stock) ─────────────────────────────────────────────
  const handleRelease = async (wopId, partName) => {
    if (!confirm(`Release reservation for ${partName}? Stock will be returned.`)) return
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('release_part_reservation', {
        p_work_order_part_id: wopId,
        p_provider_user_id:   user.id,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setSuccess(`Reservation released — ${data.stock_restored} unit(s) returned to stock`)
      await loadParts()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Save edited unit price ────────────────────────────────────────────────
  const handleSavePrice = async (wopId) => {
    const val = parseFloat(editingPrice[wopId])
    if (isNaN(val) || val < 0) { setError('Enter a valid price'); return }
    setSaving(true); setError('')
    try {
      const { error: upErr } = await supabase
        .from('work_order_parts')
        .update({ unit_price: val })
        .eq('id', wopId)
      if (upErr) throw upErr
      const orig = reservedParts.find(p => p.id === wopId)?.unit_price
      setReservedParts(prev => prev.map(p => p.id === wopId ? { ...p, unit_price: val } : p))
      setEditingPrice(e => { const n = { ...e }; delete n[wopId]; return n })
      if (customerApproved && orig !== null && val !== Number(orig)) {
        setSuccess('Price updated. Actual price differs from estimate — customer re-approval required.')
        onReApprovalNeeded?.()
      } else {
        setSuccess('Price updated')
      }
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // Save an overridden exchange rate on a single work_order_parts row. Used
  // when the provider wants to peg a line at a manually-agreed rate (e.g.
  // they bought the imported part at a different FX than today's market).
  const handleSaveRate = async (wopId) => {
    const val = parseFloat(editingRate[wopId])
    if (isNaN(val) || val <= 0) { setError('Enter a positive exchange rate'); return }
    setSaving(true); setError('')
    try {
      const { error: upErr } = await supabase
        .from('work_order_parts')
        .update({ exchange_rate: val })
        .eq('id', wopId)
      if (upErr) throw upErr
      const orig = reservedParts.find(p => p.id === wopId)?.exchange_rate
      setReservedParts(prev => prev.map(p => p.id === wopId ? { ...p, exchange_rate: val } : p))
      setEditingRate(e => { const n = { ...e }; delete n[wopId]; return n })
      if (customerApproved && orig !== null && val !== Number(orig)) {
        setSuccess('Exchange rate updated. Converted total changed — customer re-approval required.')
        onReApprovalNeeded?.()
      } else {
        setSuccess('Exchange rate updated')
      }
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Transition: reserved → in_use ────────────────────────────────────────
  const handleStartUsing = async (wopId) => {
    if (!customerApproved) {
      showToast('⚠️ Cannot start — customer estimate approval is pending')
      return
    }
    setSaving(true); setError('')
    try {
      const { data: statusRow } = await supabase
        .from('work_order_parts_statuses').select('id').eq('code', 'in_use').single()
      const { error: upErr } = await supabase
        .from('work_order_parts')
        .update({ status_id: statusRow.id })
        .eq('id', wopId)
      if (upErr) throw upErr
      setSuccess('Part marked as in use')
      await loadParts()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Transition: reserved/in_use → used (installed) ───────────────────────
  const handleMarkUsed = async (wopId) => {
    if (!customerApproved) {
      showToast('⚠️ Cannot mark installed — customer estimate approval is pending')
      return
    }
    const actualPrice = markingUsed[wopId]?.actual_price
      ? parseFloat(markingUsed[wopId].actual_price)
      : null
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('mark_part_used', {
        p_work_order_part_id: wopId,
        p_provider_user_id:   user.id,
        p_mechanic_id:        null,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      // If actual price provided, update it
      if (actualPrice !== null) {
        await supabase.from('work_order_parts').update({ unit_price: actualPrice }).eq('id', wopId)
      }
      const originalPrice = reservedParts.find(p => p.id === wopId)?.unit_price
      const priceChanged  = actualPrice !== null && originalPrice !== null && actualPrice !== Number(originalPrice)
      setMarkingUsed(m => { const n = { ...m }; delete n[wopId]; return n })
      await loadParts()
      if (priceChanged) {
        setSuccess('Part marked as installed. Actual price differs from estimate — customer re-approval required.')
        onReApprovalNeeded?.()
      } else {
        setSuccess('Part marked as installed/used')
      }
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Cancel part ───────────────────────────────────────────────────────────
  const handleCancel = async (wopId, partName) => {
    if (!confirm(`Cancel ${partName}? If reserved, stock will be returned.`)) return
    setSaving(true); setError('')
    try {
      const part = reservedParts.find(p => p.id === wopId)
      // If reserved, release first (returns stock)
      if (part?.status?.code === 'reserved') {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error: rpcErr } = await supabase.rpc('release_part_reservation', {
          p_work_order_part_id: wopId,
          p_provider_user_id:   user.id,
        })
        if (rpcErr) throw rpcErr
        if (!data.success) throw new Error(data.error)
      } else {
        // For in_use: just update status to cancelled
        const { data: statusRow } = await supabase
          .from('work_order_parts_statuses').select('id').eq('code', 'cancelled').single()
        const { error: upErr } = await supabase
          .from('work_order_parts')
          .update({ status_id: statusRow.id })
          .eq('id', wopId)
        if (upErr) throw upErr
      }
      setSuccess(`${partName} cancelled`)
      await loadParts()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // Group active lines by their snapshotted currency, summing each independently.
  // We never sum across currencies without conversion — that would be meaningless.
  const activeLines = reservedParts.filter(p => ['reserved','in_use','used'].includes(p.status?.code))
  const totalsByCurrency = activeLines.reduce((acc, p) => {
    const price = p.unit_price || p.part?.unit_price || 0
    const cur   = lineCurrency(p)
    const key   = cur?.id || '__none__'
    if (!acc[key]) acc[key] = { currency: cur, total: 0 }
    acc[key].total += p.quantity * price
    return acc
  }, {})
  const totalEntries    = Object.values(totalsByCurrency)
  const isMixedCurrency = totalEntries.length > 1

  // Grand total in the work order's own currency. Sum each line's converted
  // total (lines in wo currency contribute directly, lines in other currencies
  // are converted via their snapshotted exchange_rate). We surface this only
  // when (a) work order has a known currency and (b) every conversion succeeds.
  let woGrandTotal      = null
  let conversionGap     = false
  if (woCurrency) {
    woGrandTotal = 0
    for (const p of activeLines) {
      const price = p.unit_price || p.part?.unit_price || 0
      const qty   = p.quantity || 0
      const lc    = lineCurrency(p)
      if (!lc || lc.id === woCurrency.id) {
        woGrandTotal += qty * price
      } else if (p.exchange_rate && p.exchange_rate > 0) {
        woGrandTotal += qty * price * Number(p.exchange_rate)
      } else {
        conversionGap = true
      }
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-red-700">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-sm">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-green-700">{success}</span>
        </div>
      )}

      {/* Lock notice — estimate not yet approved */}
      {!customerApproved && !readOnly && statusCode !== 'intake' && statusCode !== 'assigned' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={15} />
          <span className="text-amber-700">
            Part transitions are locked — awaiting customer estimate approval before parts can be used.
          </span>
        </div>
      )}

      {/* Parts list */}
      {reservedParts.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Package size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No parts reserved yet.</p>
          {!isLocked && !readOnly && (
            <button onClick={() => setShowSearch(true)}
              className="mt-3 text-sm text-green-600 hover:text-green-700 font-medium">
              + Reserve a part from inventory
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {reservedParts.map((p) => {
              const code       = p.status?.code
              const isCancelled = code === 'cancelled'
              const isUsed      = code === 'used'
              const isEditing   = editingPrice[p.id] !== undefined
              const isEditingRt = editingRate[p.id]  !== undefined
              const isMarking   = markingUsed[p.id]  !== undefined
              // Does this line need an exchange rate (currencies differ)?
              const lc          = lineCurrency(p)
              const needsRate   = woCurrency && lc && lc.id !== woCurrency.id

              return (
                <div key={p.id}
                  className={`rounded-xl border bg-white overflow-hidden ${isCancelled ? 'opacity-60' : ''}`}>

                  {/* Main row */}
                  <div className="flex items-start gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{p.part?.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PART_STATUS_STYLES[code] || ''}`}>
                          {p.status?.display_name}
                        </span>
                      </div>
                      {p.part?.brand && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.part.brand}{p.part.sku ? ` · ${p.part.sku}` : ''}
                        </p>
                      )}
                      {p.notes && (
                        <p className="text-xs text-gray-500 italic mt-0.5">{p.notes}</p>
                      )}
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                        <span>Qty: <strong>{p.quantity}</strong></span>
                        <span>Unit: <strong>{fmt(p.unit_price ?? p.part?.unit_price, lineCurrency(p))}</strong></span>
                        <span>Total: <strong className="text-gray-900">{lineTotal(p)}</strong></span>
                      </div>
                      {/* Conversion line — shown only when line is in a different
                          currency than the work order AND we have a rate to convert. */}
                      {(() => {
                        const lc       = lineCurrency(p)
                        const needsXR  = woCurrency && lc && lc.id !== woCurrency.id
                        if (!needsXR) return null
                        const converted = convertedLineTotal(p)
                        const rate = p.exchange_rate
                        return (
                          <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-flex">
                            <span>≈ <strong className="text-gray-700">{converted != null ? fmt(converted, woCurrency) : '— (rate missing)'}</strong></span>
                            <span>Rate: <strong>1 {lc.code} = {rate ?? '?'} {woCurrency.code}</strong></span>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Action buttons */}
                    {!isLocked && !readOnly && !isCancelled && !isUsed && (
                      <div className="flex items-center gap-1 flex-shrink-0">

                        {/* Edit unit price — when reserved */}
                        {code === 'reserved' && !isEditing && !isEditingRt && !isMarking && (
                          <button
                            onClick={() => setEditingPrice(e => ({ ...e, [p.id]: String(p.unit_price ?? p.part?.unit_price ?? '') }))}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                            title="Edit unit price">
                            <Edit3 size={15} />
                          </button>
                        )}

                        {/* Edit exchange rate — only when reserved AND currencies differ */}
                        {code === 'reserved' && needsRate && !isEditing && !isEditingRt && !isMarking && (
                          <button
                            onClick={() => setEditingRate(e => ({ ...e, [p.id]: String(p.exchange_rate ?? '') }))}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                            title="Edit exchange rate">
                            <span className="text-[10px] font-bold tracking-tight">FX</span>
                          </button>
                        )}

                        {/* Start using — reserved → in_use */}
                        {code === 'reserved' && !isEditing && !isEditingRt && !isMarking && (
                          <button
                            onClick={() => handleStartUsing(p.id)}
                            disabled={saving}
                            className={`p-1.5 rounded-lg ${customerApproved ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-300 cursor-not-allowed'}`}
                            title={customerApproved ? 'Start using' : 'Awaiting customer approval'}>
                            <PlayCircle size={16} />
                          </button>
                        )}

                        {/* Mark installed — reserved or in_use → used */}
                        {['reserved','in_use'].includes(code) && !isEditing && !isEditingRt && !isMarking && (
                          <button
                            onClick={() => {
                              if (!customerApproved) {
                                showToast('⚠️ Cannot mark installed — customer approval pending')
                                return
                              }
                              setMarkingUsed(m => ({ ...m, [p.id]: { actual_price: String(p.unit_price ?? p.part?.unit_price ?? '') } }))
                            }}
                            disabled={saving}
                            className={`p-1.5 rounded-lg ${customerApproved ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                            title={customerApproved ? 'Mark as installed' : 'Awaiting customer approval'}>
                            <Wrench size={15} />
                          </button>
                        )}

                        {/* Cancel / skip */}
                        {['reserved','in_use'].includes(code) && !isEditing && !isEditingRt && !isMarking && (
                          <button
                            onClick={() => handleCancel(p.id, p.part?.name)}
                            disabled={saving}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            title="Cancel / skip this part">
                            <SkipForward size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inline price editor (reserved state) */}
                  {isEditing && !readOnly && (
                    <div className="border-t border-blue-100 bg-blue-50 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                        <Edit3 size={11} /> Edit Unit Price
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-1">Unit Price ({lineCurrency(p)?.code || lineCurrency(p)?.symbol || 'currency'})</label>
                          <input
                            type="number" min="0"
                            value={editingPrice[p.id]}
                            onChange={e => setEditingPrice(ed => ({ ...ed, [p.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleSavePrice(p.id); if (e.key === 'Escape') setEditingPrice(ed => { const n = {...ed}; delete n[p.id]; return n }) }}
                            autoFocus
                            placeholder="0"
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-400"
                          />
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button onClick={() => handleSavePrice(p.id)} disabled={saving}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                            Save
                          </button>
                          <button onClick={() => setEditingPrice(ed => { const n = {...ed}; delete n[p.id]; return n })}
                            className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline exchange-rate editor — appears when the FX button
                      is clicked. Provider can override the auto-fetched rate. */}
                  {isEditingRt && !readOnly && needsRate && (
                    <div className="border-t border-amber-100 bg-amber-50 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                        <span className="font-bold">FX</span> Edit Exchange Rate
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-1">
                            1 {lineCurrency(p)?.code} = ? {woCurrency?.code}
                          </label>
                          <input
                            type="number" min="0" step="0.000001"
                            value={editingRate[p.id]}
                            onChange={e => setEditingRate(ed => ({ ...ed, [p.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveRate(p.id); if (e.key === 'Escape') setEditingRate(ed => { const n = {...ed}; delete n[p.id]; return n }) }}
                            autoFocus
                            placeholder={`e.g. ${p.exchange_rate ?? '130.00'}`}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-amber-400"
                          />
                          {editingRate[p.id] && parseFloat(editingRate[p.id]) > 0 && p.unit_price && p.quantity && (
                            <p className="text-[11px] text-amber-700 mt-1">
                              New line total: {fmt(
                                p.quantity * (p.unit_price ?? p.part?.unit_price) * parseFloat(editingRate[p.id]),
                                woCurrency
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button onClick={() => handleSaveRate(p.id)} disabled={saving}
                            className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                            Save
                          </button>
                          <button onClick={() => setEditingRate(ed => { const n = {...ed}; delete n[p.id]; return n })}
                            className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline mark-used form */}
                  {isMarking && !readOnly && (
                    <div className="border-t border-green-100 bg-green-50 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                        <Wrench size={11} /> Confirm Part Installed
                      </p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-1">
                            Actual Unit Price ({p.part?.currency?.code || p.part?.currency?.symbol || 'currency'}) <span className="text-gray-400">— leave blank to keep estimated</span>
                          </label>
                          <input
                            type="number" min="0"
                            value={markingUsed[p.id]?.actual_price}
                            onChange={e => setMarkingUsed(m => ({ ...m, [p.id]: { actual_price: e.target.value } }))}
                            placeholder={`${p.unit_price ?? p.part?.unit_price ?? 0} (current)`}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-green-400"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleMarkUsed(p.id)} disabled={saving}
                            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                            Mark Installed
                          </button>
                          <button onClick={() => setMarkingUsed(m => { const n = {...m}; delete n[p.id]; return n })}
                            className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {totalEntries.length > 0 && (
            <div className="pt-1 border-t border-gray-200 space-y-1">
              {isMixedCurrency && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2 inline-block">
                  ⚠ Parts use different currencies — per-currency subtotals shown below.
                </p>
              )}

              {totalEntries.map(({ currency, total }, i) => (
                <div key={currency?.id || i} className="flex justify-end text-sm font-medium text-gray-700">
                  <span className="mr-8 text-gray-500">Subtotal ({currency?.code || 'unknown'})</span>
                  <span>{fmt(total, currency)}</span>
                </div>
              ))}

              {/* Grand total in the work order's currency. Shown when (a) we
                  know the work order currency, and (b) either the lines are all
                  in that currency, or every cross-currency line carries an
                  exchange rate so the conversion is complete. */}
              {woCurrency && woGrandTotal != null && (
                <div className="flex justify-end text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span className="mr-8 text-gray-600 text-sm font-semibold">
                    Total in {woCurrency.code} (work order)
                  </span>
                  <span>{fmt(woGrandTotal, woCurrency)}</span>
                </div>
              )}
              {conversionGap && (
                <p className="text-[11px] text-red-600 text-right">
                  ⚠ Some cross-currency lines have no exchange rate — grand total is incomplete. Click the FX icon to set one.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Reserve Part button / search panel */}
      {!isLocked && !readOnly && (
        <div>
          {!showSearch ? (
            <button onClick={() => setShowSearch(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors">
              <Plus size={16} /> Reserve Part from Inventory
            </button>
          ) : (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Search inventory</p>
                <button onClick={() => { setShowSearch(false); setSearch(''); setSearchResults([]) }}
                  className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input
                  type="text" value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search by name, SKU, brand..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={14} />
                )}
              </div>

              {/* Shop-scope toggle. Only relevant when the work order is
                  bound to a shop; otherwise the toggle is meaningless and
                  we hide it. Defaults ON when a shop is set. */}
              {woShopId && (
                <label className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-white border border-gray-200 cursor-pointer select-none">
                  <span className="text-xs text-gray-700">
                    Limit to{' '}
                    <span className="font-semibold">
                      {workOrder.shop?.name || 'this shop'}
                    </span>{' '}
                    inventory
                  </span>
                  <span className="relative inline-flex items-center flex-shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={restrictToShop}
                      onChange={e => setRestrictToShop(e.target.checked)}
                    />
                    <span className="w-9 h-5 bg-gray-200 peer-checked:bg-green-500 rounded-full transition-colors" />
                    <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow" />
                  </span>
                </label>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {searchResults.map((part) => {
                    const isLow = part.stock <= part.min_stock_level && part.stock > 0
                    const isOut = part.stock === 0
                    return (
                      <div key={part.id} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 text-sm">{part.name}</p>
                            <p className="text-xs text-gray-400">
                              {[part.brand, part.sku, part.category].filter(Boolean).join(' · ')}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs font-medium text-gray-700">{fmt(part.unit_price, part.currency)}</span>
                              <span className={`text-xs flex items-center gap-1 ${
                                isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-green-700'
                              }`}>
                                {(isOut || isLow) && <AlertTriangle size={11} />}
                                {isOut ? 'Out of stock' : `${part.stock} in stock`}
                              </span>
                            </div>
                          </div>
                          {!isOut && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <input
                                type="number"
                                value={qty[part.id] || 1}
                                onChange={e => setQty(q => ({ ...q, [part.id]: e.target.value }))}
                                min={1} max={part.stock}
                                className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                              />
                              <button
                                onClick={() => handleReserve(part)}
                                disabled={saving}
                                className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                                Reserve
                              </button>
                            </div>
                          )}
                        </div>
                        <input
                          type="text"
                          value={partNotes[part.id] || ''}
                          onChange={e => setPartNotes(n => ({ ...n, [part.id]: e.target.value }))}
                          placeholder="Notes (optional)"
                          className="mt-2 w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-600"
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              {search.length >= 2 && searchResults.length === 0 && !searching && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No parts found matching "{search}". Check the{' '}
                  <a href="/provider/inventory" className="text-blue-600 hover:underline">inventory page</a>.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}