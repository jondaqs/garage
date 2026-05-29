// → src/app/dashboard/my-teams/provider/[providerId]/inventory/page.js
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Package, Plus, Search, AlertCircle, Loader2, X, Check,
  ChevronDown, ChevronLeft, ChevronRight, Edit3, Trash2, Eye, ArrowUpDown, BarChart3
} from 'lucide-react'

export default function MemberInventoryPage() {
  const { providerId } = useParams()
  const router         = useRouter()

  // ── Core state ────────────────────────────────────────────────────────────
  const [inventory, setInventory]       = useState([])
  const [stats, setStats]               = useState(null)
  const [providerInfo, setProviderInfo] = useState(null)
  const [shops, setShops]               = useState([])
  const [currencies, setCurrencies]     = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [canManage, setCanManage]       = useState(false)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm]         = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus]     = useState('all')
  const [page, setPage]                     = useState(1)
  const [pageSize, setPageSize]             = useState(5)

  // ── Modal state ───────────────────────────────────────────────────────────
  const [modalMode, setModalMode]     = useState(null) // 'add' | 'edit' | 'view' | 'adjust' | null
  const [selectedItem, setSelectedItem] = useState(null)
  const [saving, setSaving]           = useState(false)
  const [actionMsg, setActionMsg]     = useState(null)

  // ── Form state (add/edit) ─────────────────────────────────────────────────
  const emptyForm = {
    name: '', description: '', sku: '', part_number: '', barcode: '',
    brand: '', manufacturer: '', model: '', warranty_months: '',
    category: '', location_in_shop: '', shop_id: '',
    stock: '0', min_stock_level: '0', reorder_level: '', reorder_quantity: '',
    unit_price: '0', cost_price: '', currency: 'KES', currency_id: '',
    supplier_name: '', supplier_contact: '',
    condition: 'new', is_consumable: false, oem_part: false,
  }
  const [form, setForm] = useState(emptyForm)

  // Adjust stock form
  const [adjustQty, setAdjustQty]     = useState('')
  const [adjustType, setAdjustType]   = useState('add') // add | remove | set

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/member/inventory?providerId=${providerId}`)
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || 'Failed to load'); return }
      setInventory(data.inventory || [])
      setStats(data.stats || null)
      setProviderInfo(data.provider || null)
      setShops(data.shops || [])
      setCurrencies(data.currencies || [])
      setCanManage(!!data.canManage)
    } catch {
      setError('Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [providerId])

  useEffect(() => { loadData() }, [loadData])

  // ── Derived ───────────────────────────────────────────────────────────────
  const categories = useMemo(() =>
    [...new Set(inventory.map(i => i.category).filter(Boolean))].sort(),
  [inventory])

  const filtered = useMemo(() => {
    let items = [...inventory]
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      items = items.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.sku || '').toLowerCase().includes(q) ||
        (i.part_number || '').toLowerCase().includes(q) ||
        (i.brand || '').toLowerCase().includes(q)
      )
    }
    if (filterCategory !== 'all') items = items.filter(i => i.category === filterCategory)
    if (filterStatus === 'in_stock')     items = items.filter(i => i.stock > i.min_stock_level)
    if (filterStatus === 'low_stock')    items = items.filter(i => i.stock > 0 && i.stock <= i.min_stock_level)
    if (filterStatus === 'out_of_stock') items = items.filter(i => i.stock === 0)
    return items
  }, [inventory, searchTerm, filterCategory, filterStatus])

  useEffect(() => { setPage(1) }, [searchTerm, filterCategory, filterStatus, pageSize])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)

  // ── Actions ───────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm)
    setSelectedItem(null)
    setModalMode('add')
  }

  const openEdit = (item) => {
    setForm({
      name: item.name || '', description: item.description || '',
      sku: item.sku || '', part_number: item.part_number || '', barcode: item.barcode || '',
      brand: item.brand || '', manufacturer: item.manufacturer || '', model: item.model || '',
      warranty_months: item.warranty_months?.toString() || '',
      category: item.category || '', location_in_shop: item.location_in_shop || '',
      shop_id: item.shop_id || '',
      stock: item.stock?.toString() || '0', min_stock_level: item.min_stock_level?.toString() || '0',
      reorder_level: item.reorder_level?.toString() || '', reorder_quantity: item.reorder_quantity?.toString() || '',
      unit_price: item.unit_price?.toString() || '0', cost_price: item.cost_price?.toString() || '',
      currency: item.currency || 'KES', currency_id: item.currency_id || '',
      supplier_name: item.supplier_name || '', supplier_contact: item.supplier_contact || '',
      condition: item.condition || 'new',
      is_consumable: !!item.is_consumable, oem_part: !!item.oem_part,
    })
    setSelectedItem(item)
    setModalMode('edit')
  }

  const openView = (item) => { setSelectedItem(item); setModalMode('view') }

  const openAdjust = (item) => {
    setSelectedItem(item)
    setAdjustQty('')
    setAdjustType('add')
    setModalMode('adjust')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setActionMsg({ type: 'error', text: 'Part name is required' }); return }
    setSaving(true)
    setActionMsg(null)
    try {
      const isEdit = modalMode === 'edit' && selectedItem
      const url    = isEdit ? `/api/member/inventory/${selectedItem.id}` : '/api/member/inventory'
      const method = isEdit ? 'PUT' : 'POST'
      const payload = isEdit ? { ...form } : { providerId, ...form }

      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setActionMsg({ type: 'error', text: data.error || 'Save failed' }); return }

      setActionMsg({ type: 'success', text: isEdit ? 'Item updated' : 'Item added' })
      setModalMode(null)
      await loadData()
    } catch {
      setActionMsg({ type: 'error', text: 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  const handleAdjust = async () => {
    const qty = parseInt(adjustQty)
    if (isNaN(qty) || qty < 0) { setActionMsg({ type: 'error', text: 'Enter a valid quantity' }); return }
    const newStock = adjustType === 'add'
      ? selectedItem.stock + qty
      : adjustType === 'remove'
        ? Math.max(0, selectedItem.stock - qty)
        : qty
    setSaving(true)
    try {
      const res = await fetch(`/api/member/inventory/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selectedItem, stock: newStock }),
      })
      const data = await res.json()
      if (!res.ok) { setActionMsg({ type: 'error', text: data.error || 'Adjust failed' }); return }
      setActionMsg({ type: 'success', text: `Stock updated to ${newStock}` })
      setModalMode(null)
      await loadData()
    } catch {
      setActionMsg({ type: 'error', text: 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return
    try {
      const res = await fetch(`/api/member/inventory/${item.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setActionMsg({ type: 'error', text: d.error || 'Delete failed' }); return }
      setActionMsg({ type: 'success', text: 'Item deleted' })
      await loadData()
    } catch {
      setActionMsg({ type: 'error', text: 'Network error' })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stockBadge = (item) => {
    if (item.stock === 0)                   return { label: 'Out of Stock', cls: 'bg-red-50 text-red-700 border-red-200' }
    if (item.stock <= item.min_stock_level) return { label: 'Low Stock',    cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
    return { label: 'In Stock', cls: 'bg-green-50 text-green-700 border-green-200' }
  }

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <div className="text-center">
        <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading inventory…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-800">Failed to load</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
          <button onClick={loadData} className="mt-3 text-sm font-medium text-red-700 underline underline-offset-2">Try again</button>
        </div>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            Inventory
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {providerInfo?.name ? `${providerInfo.name} — ` : ''}Spare parts &amp; stock levels
          </p>
        </div>
        {canManage && (
          <button onClick={openAdd}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" /> Add Part
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total',     value: stats.totalItems,    icon: '📦', color: 'blue'   },
            { label: 'Active',    value: stats.activeItems,   icon: '✅', color: 'green'  },
            { label: 'Low Stock', value: stats.lowStockItems, icon: '⚠️', color: 'yellow' },
            { label: 'Out',       value: stats.outOfStockItems, icon: '❌', color: 'red' },
            { label: 'Value',     value: `KES ${(stats.totalValue || 0).toLocaleString()}`, icon: '💰', color: 'purple' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-4 ${
              s.color === 'blue' ? 'bg-blue-50 border-blue-200' :
              s.color === 'green' ? 'bg-green-50 border-green-200' :
              s.color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
              s.color === 'red' ? 'bg-red-50 border-red-200' :
              'bg-purple-50 border-purple-200'
            }`}>
              <p className="text-xs font-medium text-gray-500">{s.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action message */}
      {actionMsg && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 text-sm font-medium ${
          actionMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200'
                                       : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {actionMsg.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMsg.text}
          <button onClick={() => setActionMsg(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search name, SKU, part #, brand…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Status</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package className="h-12 w-12 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm font-medium text-gray-900">
            {inventory.length === 0 ? 'No inventory items yet' : 'No matching items'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Desktop */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Part</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Category</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Stock</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Price</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  {canManage && <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(item => {
                  const sb = stockBadge(item)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          {[item.part_number && `PN: ${item.part_number}`, item.sku && `SKU: ${item.sku}`, item.brand].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {item.category ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">{item.category}</span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-gray-900">{item.stock}</p>
                        <p className="text-[11px] text-gray-400">Min: {item.min_stock_level}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        {item.currency} {(item.unit_price || 0).toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${sb.cls}`}>{sb.label}</span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => openView(item)} title="View"
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openAdjust(item)} title="Adjust stock"
                              className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openEdit(item)} title="Edit"
                              className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors">
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item)} title="Delete"
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-gray-100">
            {paginated.map(item => {
              const sb = stockBadge(item)
              return (
                <div key={item.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.brand}{item.part_number ? ` · ${item.part_number}` : ''}</p>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full border ${sb.cls}`}>{sb.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>Stock: <b>{item.stock}</b></span>
                    <span>{item.currency} {(item.unit_price || 0).toLocaleString()}</span>
                    {item.category && <span className="px-1.5 py-0.5 bg-gray-100 rounded">{item.category}</span>}
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => openView(item)} className="text-xs text-gray-600 hover:text-gray-800 font-medium">View</button>
                      <button onClick={() => openAdjust(item)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Adjust</button>
                      <button onClick={() => openEdit(item)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                      <button onClick={() => handleDelete(item)} className="text-xs text-red-600 hover:text-red-800 font-medium">Delete</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Show</span>
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
              {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p; if (totalPages <= 5) p = i + 1; else if (page <= 3) p = i + 1; else if (page >= totalPages - 2) p = totalPages - 4 + i; else p = page - 2 + i
              return <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded text-sm font-medium ${p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
          <p className="text-xs text-gray-400">{(page-1)*pageSize+1}–{Math.min(page*pageSize, filtered.length)} of {filtered.length}</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         MODALS
         ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── View Modal ─────────────────────────────────────────────────────── */}
      {modalMode === 'view' && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModalMode(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{selectedItem.name}</h2>
              <button onClick={() => setModalMode(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              {[
                ['Part Number', selectedItem.part_number],
                ['SKU', selectedItem.sku],
                ['Brand', selectedItem.brand],
                ['Category', selectedItem.category],
                ['Stock', selectedItem.stock],
                ['Min Stock', selectedItem.min_stock_level],
                ['Unit Price', `${selectedItem.currency} ${(selectedItem.unit_price || 0).toLocaleString()}`],
                ['Cost Price', selectedItem.cost_price ? `${selectedItem.currency} ${selectedItem.cost_price.toLocaleString()}` : null],
                ['Condition', selectedItem.condition],
                ['Location', selectedItem.location_in_shop],
                ['Supplier', selectedItem.supplier_name],
                ['Description', selectedItem.description],
              ].filter(([, v]) => v != null && v !== '').map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900 text-right max-w-[60%]">{val}</span>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              {canManage && (
                <button onClick={() => { setModalMode(null); openEdit(selectedItem) }}
                  className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">
                  Edit
                </button>
              )}
              <button onClick={() => setModalMode(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Adjust Stock Modal ─────────────────────────────────────────────── */}
      {modalMode === 'adjust' && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModalMode(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Adjust Stock</h2>
              <p className="text-sm text-gray-500 mt-0.5">{selectedItem.name} — current: <b>{selectedItem.stock}</b></p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-2">
                {['add', 'remove', 'set'].map(t => (
                  <button key={t} onClick={() => setAdjustType(t)}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      adjustType === t ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {t === 'add' ? '+ Add' : t === 'remove' ? '− Remove' : '= Set'}
                  </button>
                ))}
              </div>
              <input type="number" min="0" value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                placeholder="Quantity" autoFocus
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {adjustQty && !isNaN(parseInt(adjustQty)) && (
                <p className="text-sm text-gray-500">
                  New stock: <b>{
                    adjustType === 'add' ? selectedItem.stock + parseInt(adjustQty) :
                    adjustType === 'remove' ? Math.max(0, selectedItem.stock - parseInt(adjustQty)) :
                    parseInt(adjustQty)
                  }</b>
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setModalMode(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleAdjust} disabled={saving || !adjustQty}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ───────────────────────────────────────────────── */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModalMode(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {modalMode === 'add' ? 'Add New Part' : `Edit: ${selectedItem?.name}`}
              </h2>
              <button onClick={() => setModalMode(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-400" /></button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Basic info */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Basic Information</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Part Number</label>
                    <input value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                    <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
                    <input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                    <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                      list="categories-list"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <datalist id="categories-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </fieldset>

              {/* Stock */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Stock &amp; Pricing</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stock</label>
                    <input type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Stock</label>
                    <input type="number" min="0" value={form.min_stock_level} onChange={e => setForm({ ...form, min_stock_level: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price</label>
                    <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price</label>
                    <input type="number" min="0" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </fieldset>

              {/* Supplier */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Supplier</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name</label>
                    <input value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Contact</label>
                    <input value={form.supplier_contact} onChange={e => setForm({ ...form, supplier_contact: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </fieldset>

              {/* Extra */}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Additional</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                    <select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="new">New</option>
                      <option value="used">Used</option>
                      <option value="refurbished">Refurbished</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 pt-5">
                    <input type="checkbox" checked={form.is_consumable} onChange={e => setForm({ ...form, is_consumable: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">Consumable</span>
                  </label>
                  <label className="flex items-center gap-2 pt-5">
                    <input type="checkbox" checked={form.oem_part} onChange={e => setForm({ ...form, oem_part: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">OEM Part</span>
                  </label>
                </div>
              </fieldset>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={() => setModalMode(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {modalMode === 'add' ? 'Add Part' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}