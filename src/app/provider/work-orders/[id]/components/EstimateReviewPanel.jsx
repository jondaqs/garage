'use client'

/**
 * EstimateReviewPanel
 * ───────────────────
 * Shown when work order is in `internal_review` status.
 * canSend users (owner, admin, accountant, can_send_estimates) can:
 *   - View the full line-item breakdown
 *   - Edit service estimated_cost and part unit_price inline
 *   - Send estimates to the customer
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle, AlertCircle, Loader2, Send, Eye,
  ChevronDown, ChevronUp, AlertTriangle, Edit3, X, Check
} from 'lucide-react'

export default function EstimateReviewPanel({
  workOrder,
  onSent,
  canSend = false,
  estimate: estimateProp = null,
}) {
  const supabase   = createClient()
  const statusCode = workOrder?.status?.code

  const [services,        setServices]        = useState([])
  const [parts,           setParts]           = useState([])
  const [estimateLoading, setEstimateLoading] = useState(!estimateProp)
  const [expanded,        setExpanded]        = useState(false)
  const [sending,         setSending]         = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState('')
  const [notes,           setNotes]           = useState('')
  // inline editing state: { id, field, value }
  const [editing,         setEditing]         = useState(null)
  const [saving,          setSaving]          = useState(false)

  const [vatRate, setVatRate] = useState(workOrder?.vat_rate ?? 16)

  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

  // ── Computed totals from live services/parts state ───────────────────────
  const servicesTotal = services
    .filter(s => !['cancelled', 'skipped'].includes(s.status?.code))
    .reduce((sum, s) => sum + Number(s.estimated_cost || 0), 0)

  const partsTotal = parts
    .filter(p => ['reserved', 'in_use'].includes(p.status?.code))
    .reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.unit_price || 0), 0)

  const subtotal = servicesTotal + partsTotal
  const tax      = Math.round(subtotal * vatRate / 100 * 100) / 100
  const total    = Math.round((subtotal + tax) * 100) / 100

  // derive summary-compatible object for display
  const estimate = services.length > 0 || parts.length > 0
    ? { services_total: servicesTotal, parts_total: partsTotal, subtotal, tax, total }
    : estimateProp

  // ── Load line items (also drives totals) ─────────────────────────────────
  const fetchBreakdown = useCallback(async () => {
    try {
      const [{ data: svcs }, { data: pts }] = await Promise.all([
        supabase
          .from('work_order_services')
          .select('id, estimated_cost, notes, status:work_order_services_statuses!status_id(code), service:services(name)')
          .eq('work_order_id', workOrder.id),
        supabase
          .from('work_order_parts')
          .select('id, quantity, unit_price, status:work_order_parts_statuses!status_id(code), spare_part:spare_parts(name, unit_price)')
          .eq('work_order_id', workOrder.id),
      ])
      setServices(svcs || [])
      setParts(pts || [])
    } catch {}
    finally { setEstimateLoading(false) }
  }, [workOrder.id])

  useEffect(() => {
    if (statusCode === 'internal_review') fetchBreakdown()
  }, [statusCode, fetchBreakdown])

  // ── Inline price edit handlers ────────────────────────────────────────────
  const startEdit = (id, field, currentValue) => {
    setEditing({ id, field, value: String(currentValue ?? '') })
  }

  const cancelEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    const newVal = parseFloat(editing.value)
    if (isNaN(newVal) || newVal < 0) { setError('Enter a valid price (≥ 0)'); return }
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (editing.field === 'estimated_cost') {
        const { data: result, error: rpcErr } = await supabase.rpc(
          'update_service_estimated_cost',
          { p_wos_id: editing.id, p_estimated_cost: newVal, p_caller_auth_uid: user.id }
        )
        if (rpcErr) throw rpcErr
        if (!result.success) throw new Error(result.error)
        setServices(prev => prev.map(s =>
          s.id === editing.id ? { ...s, estimated_cost: newVal } : s
        ))
      } else if (editing.field === 'unit_price') {
        const { data: result, error: rpcErr } = await supabase.rpc(
          'update_part_unit_price',
          { p_wop_id: editing.id, p_unit_price: newVal, p_caller_auth_uid: user.id }
        )
        if (rpcErr) throw rpcErr
        if (!result.success) throw new Error(result.error)
        setParts(prev => prev.map(p =>
          p.id === editing.id ? { ...p, unit_price: newVal } : p
        ))
      }
      setEditing(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Send estimate ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!window.confirm('Send this estimate to the customer for approval?')) return
    setSending(true); setError(''); setSuccess('')
    try {
      const resp = await fetch(`/api/work-orders/${workOrder.id}/send-estimate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ notes: notes || null }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send estimate')
      setSuccess(`Estimate sent to customer for approval.${data.email_sent ? ' Email delivered.' : ''}${data.sms_sent ? ' SMS delivered.' : ''}`)
      onSent?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (statusCode !== 'internal_review') return null

  const hasItems    = services.length > 0 || parts.length > 0
  const activeServices = services.filter(s => !['cancelled','skipped'].includes(s.status?.code))
  const activeParts    = parts.filter(p => ['reserved','in_use'].includes(p.status?.code))

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-violet-100 border-b border-violet-200">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-violet-900">Internal Estimate Review</p>
        </div>
        {canSend ? (
          <span className="text-xs bg-violet-600 text-white px-2 py-0.5 rounded-full font-medium">
            Action required
          </span>
        ) : (
          <span className="text-xs bg-violet-200 text-violet-700 px-2 py-0.5 rounded-full">
            Pending review
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">

        {/* Feedback */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={15} />
            <span className="text-red-700">{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
            <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={15} />
            <span className="text-green-700">{success}</span>
          </div>
        )}

        {/* Context message */}
        {!success && (
          <p className="text-xs text-violet-700">
            {canSend
              ? 'Review the line items below. You can adjust prices inline before sending to the customer.'
              : 'Estimates have been submitted for internal review. An authorised member will review and send to the customer.'}
          </p>
        )}

        {/* Loading */}
        {estimateLoading && (
          <div className="flex items-center gap-2 text-xs text-violet-500 italic">
            <Loader2 size={12} className="animate-spin" /> Loading estimate…
          </div>
        )}

        {/* No items */}
        {!estimateLoading && !hasItems && !success && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            No estimate data found. Ensure the mechanic has added services and parts before sending.
          </div>
        )}

        {/* Estimate card */}
        {!estimateLoading && hasItems && !success && (
          <div className="bg-white rounded-lg border border-violet-200 overflow-hidden">

            {/* Toggle header */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Estimate Breakdown
              </p>
              <div className="flex items-center gap-1 text-xs text-violet-600">
                <Eye size={12} />
                {expanded ? 'Collapse' : 'Expand & edit prices'}
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
            </button>

            {/* Summary totals — always visible */}
            <div className="px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Services ({activeServices.length})</span>
                <span className="font-medium">{fmt(servicesTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Parts ({activeParts.length})</span>
                <span className="font-medium">{fmt(partsTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  VAT
                  {canSend ? (
                    <>
                      {' ('}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={vatRate}
                        onChange={async (e) => {
                          const rate = parseFloat(e.target.value) || 0
                          setVatRate(rate)
                          // Persist to work_orders
                          await supabase
                            .from('work_orders')
                            .update({ vat_rate: rate, updated_at: new Date().toISOString() })
                            .eq('id', workOrder.id)
                        }}
                        className="w-12 px-1 py-0.5 border border-violet-300 rounded text-xs text-center focus:ring-1 focus:ring-violet-500"
                      />
                      {'%)'}
                    </>
                  ) : (
                    <span> {vatRate}%</span>
                  )}
                </span>
                <span>{fmt(tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2">
                <span>Total</span>
                <span className="text-violet-800 text-base">{fmt(total)}</span>
              </div>
            </div>

            {/* Expanded editable line items */}
            {expanded && (
              <div className="border-t border-gray-100 bg-gray-50">

                {/* Services */}
                {services.length > 0 && (
                  <div className="px-4 pt-3 pb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Services</p>
                    <div className="space-y-1.5">
                      {services.map(s => {
                        const isCancelled = ['cancelled','skipped'].includes(s.status?.code)
                        const isEditingThis = editing?.id === s.id && editing?.field === 'estimated_cost'
                        return (
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 ${
                              isCancelled ? 'opacity-40' : 'bg-white border border-gray-100'
                            }`}
                          >
                            <span className="flex-1 text-gray-700 truncate">{s.service?.name || 'Service'}</span>

                            {isCancelled && (
                              <span className="text-gray-400 italic">cancelled</span>
                            )}

                            {!isCancelled && !isEditingThis && (
                              <>
                                <span className="font-medium text-gray-900 tabular-nums">{fmt(s.estimated_cost)}</span>
                                {canSend && (
                                  <button
                                    onClick={() => startEdit(s.id, 'estimated_cost', s.estimated_cost)}
                                    className="p-0.5 text-gray-400 hover:text-violet-600 rounded"
                                    title="Edit price"
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                )}
                              </>
                            )}

                            {!isCancelled && isEditingThis && (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 text-xs">KES</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={editing.value}
                                  onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                                  autoFocus
                                  className="w-24 px-2 py-0.5 border border-violet-400 rounded text-xs focus:ring-1 focus:ring-violet-500 text-right"
                                />
                                <button
                                  onClick={saveEdit}
                                  disabled={saving}
                                  className="p-0.5 text-green-600 hover:text-green-800 disabled:opacity-50"
                                  title="Save"
                                >
                                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-0.5 text-gray-400 hover:text-gray-600"
                                  title="Cancel"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Parts */}
                {parts.length > 0 && (
                  <div className="px-4 pt-2 pb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Parts</p>
                    <div className="space-y-1.5">
                      {parts.map(p => {
                        const isInactive  = !['reserved','in_use'].includes(p.status?.code)
                        const isEditingThis = editing?.id === p.id && editing?.field === 'unit_price'
                        const lineTotal   = Number(p.quantity || 0) * Number(p.unit_price || 0)
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 ${
                              isInactive ? 'opacity-40' : 'bg-white border border-gray-100'
                            }`}
                          >
                            <span className="flex-1 text-gray-700 truncate">
                              {p.spare_part?.name || 'Part'}
                              <span className="text-gray-400 ml-1">× {p.quantity}</span>
                            </span>

                            {isInactive && (
                              <span className="text-gray-400 italic">{p.status?.code}</span>
                            )}

                            {!isInactive && !isEditingThis && (
                              <>
                                <div className="text-right">
                                  <div className="font-medium text-gray-900 tabular-nums">{fmt(lineTotal)}</div>
                                  <div className="text-gray-400">{fmt(p.unit_price)} ea.</div>
                                </div>
                                {canSend && (
                                  <button
                                    onClick={() => startEdit(p.id, 'unit_price', p.unit_price ?? p.spare_part?.unit_price)}
                                    className="p-0.5 text-gray-400 hover:text-violet-600 rounded"
                                    title="Edit unit price"
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                )}
                              </>
                            )}

                            {!isInactive && isEditingThis && (
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 text-xs">KES</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={editing.value}
                                  onChange={e => setEditing(prev => ({ ...prev, value: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                                  autoFocus
                                  className="w-24 px-2 py-0.5 border border-violet-400 rounded text-xs focus:ring-1 focus:ring-violet-500 text-right"
                                />
                                <button
                                  onClick={saveEdit}
                                  disabled={saving}
                                  className="p-0.5 text-green-600 hover:text-green-800 disabled:opacity-50"
                                  title="Save"
                                >
                                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-0.5 text-gray-400 hover:text-gray-600"
                                  title="Cancel"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {canSend && (
                  <div className="px-4 pb-3">
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Edit3 size={9} /> Click the pencil icon on any line to edit its price. Totals update automatically.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Zero total warning */}
        {!estimateLoading && hasItems && total === 0 && canSend && !sending && !success && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            Estimate total is zero. Add pricing to services and parts before sending.
          </div>
        )}

        {/* Notes */}
        {canSend && !success && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Internal note (optional — not sent to customer)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Verified parts pricing, approved for sending…"
              className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-violet-400 bg-white"
            />
          </div>
        )}

        {/* Send button */}
        {canSend && !success && (
          <button
            onClick={handleSend}
            disabled={sending || total === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {sending ? (
              <><Loader2 size={14} className="animate-spin" /> Sending to customer…</>
            ) : (
              <><Send size={14} /> Send Estimates to Customer</>
            )}
          </button>
        )}

      </div>
    </div>
  )
}