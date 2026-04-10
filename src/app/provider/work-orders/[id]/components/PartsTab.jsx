'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Plus, X, AlertTriangle, CheckCircle,
  AlertCircle, Package, Loader2
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

export default function PartsTab({ workOrder }) {
  const supabase = createClient()

  const [reservedParts, setReservedParts] = useState([])
  const [inventory, setInventory]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState('')

  // Search state
  const [search, setSearch]               = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const [showSearch, setShowSearch]       = useState(false)
  const [qty, setQty]                     = useState({})    // { partId: quantity }
  const [partNotes, setPartNotes]         = useState({})

  const isTerminal = ['completed','cancelled','closed'].includes(workOrder.status?.code)

  const loadReservedParts = useCallback(async () => {
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
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [workOrder.id])

  useEffect(() => { loadReservedParts() }, [loadReservedParts])

  const handleSearch = useCallback(async (q) => {
    setSearch(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      // Get provider id for this work order
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

  const handleReserve = async (part) => {
    const quantity = parseInt(qty[part.id] || 1)
    if (!quantity || quantity < 1) { setError('Enter a valid quantity'); return }
    if (quantity > part.stock) {
      setError(`Only ${part.stock} in stock`); return
    }
    setSaving(true)
    setError('')
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
      setSuccess(`${part.name} × ${quantity} reserved. Stock remaining: ${data.remaining_stock}`)
      setShowSearch(false)
      setSearch('')
      setSearchResults([])
      setQty({})
      await loadReservedParts()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRelease = async (wopId, partName) => {
    if (!confirm(`Release reservation for ${partName}? Stock will be returned.`)) return
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('release_part_reservation', {
        p_work_order_part_id: wopId,
        p_provider_user_id:   user.id,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setSuccess(`Reservation released — ${data.stock_restored} unit(s) returned to stock`)
      await loadReservedParts()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n) => n != null ? `KES ${Number(n).toLocaleString()}` : '—'
  const lineTotal = (p) =>
    p.quantity && p.unit_price ? fmt(p.quantity * p.unit_price) : '—'

  const activeTotal = reservedParts
    .filter(p => ['reserved','in_use'].includes(p.status?.code))
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

      {/* Reserved parts list */}
      {reservedParts.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Package size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No parts reserved yet.</p>
          {!isTerminal && (
            <button onClick={() => setShowSearch(true)}
              className="mt-3 text-sm text-green-600 hover:text-green-700 font-medium">
              + Reserve a part from inventory
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Part</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  {!isTerminal && <th className="py-2 px-3" />}
                </tr>
              </thead>
              <tbody>
                {reservedParts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3">
                      <p className="font-medium text-gray-900">{p.part?.name}</p>
                      {p.part?.brand && (
                        <p className="text-xs text-gray-400">{p.part.brand}{p.part.sku ? ` · ${p.part.sku}` : ''}</p>
                      )}
                      {p.notes && <p className="text-xs text-gray-400 italic mt-0.5">{p.notes}</p>}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-900">{p.quantity}</td>
                    <td className="py-3 px-3 text-right text-gray-600">{fmt(p.unit_price || p.part?.unit_price)}</td>
                    <td className="py-3 px-3 text-right font-medium text-gray-900">{lineTotal(p)}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PART_STATUS_STYLES[p.status?.code] || ''}`}>
                        {p.status?.display_name}
                      </span>
                    </td>
                    {!isTerminal && (
                      <td className="py-3 px-3">
                        {p.status?.code === 'reserved' && (
                          <button onClick={() => handleRelease(p.id, p.part?.name)}
                            disabled={saving}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded" title="Release reservation">
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {activeTotal > 0 && (
            <div className="flex justify-end text-sm font-semibold text-gray-800 pt-1 border-t border-gray-200">
              <span className="mr-8 text-gray-500">Parts total</span>
              <span>KES {activeTotal.toLocaleString()}</span>
            </div>
          )}
        </>
      )}

      {/* Add part */}
      {!isTerminal && (
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
                  className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input
                  type="text"
                  value={search}
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
                      <div key={part.id}
                        className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 text-sm">{part.name}</p>
                            <p className="text-xs text-gray-400">
                              {[part.brand, part.sku, part.category].filter(Boolean).join(' · ')}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs font-medium text-gray-700">
                                {fmt(part.unit_price)}
                              </span>
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
                                min={1}
                                max={part.stock}
                                className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                              />
                              <button
                                onClick={() => handleReserve(part)}
                                disabled={saving}
                                className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                              >
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