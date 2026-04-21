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

export default function PartsTab({ workOrder, readOnly = false, onReApprovalNeeded }) {
  const supabase = createClient()

  const [reservedParts, setReservedParts] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState('')

  // Search / reserve
  const [search,        setSearch]        = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching,     setSearching]     = useState(false)
  const [showSearch,    setShowSearch]    = useState(false)
  const [qty,           setQty]           = useState({})
  const [partNotes,     setPartNotes]     = useState({})

  // Inline editing: unit_price while reserved
  const [editingPrice,  setEditingPrice]  = useState({})  // { [id]: string }

  // Inline actual price on mark-used
  const [markingUsed,   setMarkingUsed]   = useState({})  // { [id]: { actual_price: string } }

  // Toast helper
  const showToast = (msg) => { setError(msg); setTimeout(() => setError(''), 3500) }

  const statusCode    = workOrder.status?.code
  const isTerminal    = ['completed','cancelled','closed'].includes(statusCode)
  // Parts can only be transitioned after customer approves the estimate
  const customerApproved = ['approved','in_progress','quality_check','rework','completed','closed'].includes(statusCode)

  const fmt      = (n) => n != null ? `KES ${Number(n).toLocaleString()}` : '—'
  const lineTotal = (p) => {
    const price = p.unit_price ?? p.part?.unit_price
    return (p.quantity && price) ? fmt(p.quantity * price) : '—'
  }

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadParts = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('work_order_parts')
        .select(`
          id, quantity, unit_price, notes, requested_at,
          status:work_order_parts_statuses(code, display_name),
          part:spare_parts(id, name, sku, brand, unit_price, stock, category)
        `)
        .eq('work_order_id', workOrder.id)
        .order('requested_at', { ascending: false })
      if (err) throw err
      setReservedParts(data || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [workOrder.id])

  useEffect(() => { loadParts() }, [loadParts])

  // ── Search inventory ──────────────────────────────────────────────────────
  const handleSearch = useCallback(async (q) => {
    setSearch(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const { data } = await supabase
        .from('spare_parts')
        .select('id, name, sku, brand, category, stock, min_stock_level, unit_price')
        .eq('service_provider_id', workOrder.service_provider_id)
        .eq('is_active', true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%`)
        .order('name')
        .limit(20)
      setSearchResults(data || [])
    } catch {}
    finally { setSearching(false) }
  }, [workOrder.service_provider_id])

  // ── Reserve ───────────────────────────────────────────────────────────────
  const handleReserve = async (part) => {
    const quantity = parseInt(qty[part.id] || 1)
    if (!quantity || quantity < 1) { setError('Enter a valid quantity'); return }
    if (quantity > part.stock)     { setError(`Only ${part.stock} in stock`); return }
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('reserve_part_for_work_order', {
        p_work_order_id:    workOrder.id,
        p_spare_part_id:    part.id,
        p_quantity:         quantity,
        p_provider_user_id: user.id,
        p_notes:            partNotes[part.id] || null,
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
      setReservedParts(prev => prev.map(p => p.id === wopId ? { ...p, unit_price: val } : p))
      setEditingPrice(e => { const n = { ...e }; delete n[wopId]; return n })
      setSuccess('Price updated')
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
      setMarkingUsed(m => { const n = { ...m }; delete n[wopId]; return n })
      setSuccess('Part marked as installed/used')
      await loadParts()
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

  const activeTotal = reservedParts
    .filter(p => ['reserved','in_use','used'].includes(p.status?.code))
    .reduce((sum, p) => sum + (p.quantity * (p.unit_price || p.part?.unit_price || 0)), 0)

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
          {!isTerminal && !readOnly && (
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
              const isMarking   = markingUsed[p.id] !== undefined

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
                        <span>Unit: <strong>{fmt(p.unit_price ?? p.part?.unit_price)}</strong></span>
                        <span>Total: <strong className="text-gray-900">{lineTotal(p)}</strong></span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    {!isTerminal && !readOnly && !isCancelled && !isUsed && (
                      <div className="flex items-center gap-1 flex-shrink-0">

                        {/* Edit unit price — when reserved */}
                        {code === 'reserved' && !isEditing && !isMarking && (
                          <button
                            onClick={() => setEditingPrice(e => ({ ...e, [p.id]: String(p.unit_price ?? p.part?.unit_price ?? '') }))}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                            title="Edit unit price">
                            <Edit3 size={15} />
                          </button>
                        )}

                        {/* Start using — reserved → in_use */}
                        {code === 'reserved' && !isEditing && !isMarking && (
                          <button
                            onClick={() => handleStartUsing(p.id)}
                            disabled={saving}
                            className={`p-1.5 rounded-lg ${customerApproved ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-300 cursor-not-allowed'}`}
                            title={customerApproved ? 'Start using' : 'Awaiting customer approval'}>
                            <PlayCircle size={16} />
                          </button>
                        )}

                        {/* Mark installed — reserved or in_use → used */}
                        {['reserved','in_use'].includes(code) && !isEditing && !isMarking && (
                          <button
                            onClick={() => {
                              if (!customerApproved) {
                                showToast('⚠️ Cannot mark installed — customer approval pending')
                                return
                              }
                              setMarkingUsed(m => ({ ...m, [p.id]: { actual_price: '' } }))
                            }}
                            disabled={saving}
                            className={`p-1.5 rounded-lg ${customerApproved ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                            title={customerApproved ? 'Mark as installed' : 'Awaiting customer approval'}>
                            <Wrench size={15} />
                          </button>
                        )}

                        {/* Cancel / skip */}
                        {['reserved','in_use'].includes(code) && !isEditing && !isMarking && (
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
                          <label className="text-xs text-gray-500 block mb-1">Unit Price (KES)</label>
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

                  {/* Inline mark-used form */}
                  {isMarking && !readOnly && (
                    <div className="border-t border-green-100 bg-green-50 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                        <Wrench size={11} /> Confirm Part Installed
                      </p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-1">
                            Actual Unit Price (KES) <span className="text-gray-400">— leave blank to keep estimated</span>
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

          {activeTotal > 0 && (
            <div className="flex justify-end text-sm font-semibold text-gray-800 pt-1 border-t border-gray-200">
              <span className="mr-8 text-gray-500">Parts total</span>
              <span>KES {activeTotal.toLocaleString()}</span>
            </div>
          )}
        </>
      )}

      {/* Reserve Part button / search panel */}
      {!isTerminal && !readOnly && (
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
                              <span className="text-xs font-medium text-gray-700">{fmt(part.unit_price)}</span>
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