'use client'

/**
 * EstimateReviewPanel
 * ───────────────────
 * Shown when work order is in `internal_review` status.
 * Visible to: service_provider_owner, admin, accountant (via SPU role),
 *             or any SPU/mechanic with can_send_estimates = true.
 *
 * Props:
 *   workOrder      – WO object (needs at minimum: id, work_order_number, status.code)
 *   onSent         – callback after successful send (e.g. reload parent)
 *   canSend        – boolean: current user is authorised to send
 *   estimate       – pre-fetched estimate object (or null to fetch internally)
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle, AlertCircle, Loader2, Send, Eye,
  ChevronDown, ChevronUp, FileText, AlertTriangle
} from 'lucide-react'

export default function EstimateReviewPanel({
  workOrder,
  onSent,
  canSend = false,
  estimate: estimateProp = null,
}) {
  const supabase   = createClient()
  const statusCode = workOrder?.status?.code

  const [estimate,       setEstimate]       = useState(estimateProp)
  const [estimateLoading,setEstimateLoading] = useState(!estimateProp)
  const [services,       setServices]        = useState([])
  const [parts,          setParts]           = useState([])
  const [expanded,       setExpanded]        = useState(false)
  const [sending,        setSending]         = useState(false)
  const [error,          setError]           = useState('')
  const [success,        setSuccess]         = useState('')
  const [notes,          setNotes]           = useState('')

  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

  // ── Fetch estimate — direct query so all SPU roles (accountant, admin) work ──
  // calculate_work_order_estimate RPC is staff-only (checks mechanics table).
  // We calculate directly from work_order_services + work_order_parts instead.
  const fetchEstimate = useCallback(async () => {
    if (estimateProp) { setEstimate(estimateProp); return }
    try {
      const [{ data: svcs }, { data: parts }] = await Promise.all([
        supabase
          .from('work_order_services')
          .select('estimated_cost, status:work_order_services_statuses!status_id(code)')
          .eq('work_order_id', workOrder.id),
        supabase
          .from('work_order_parts')
          .select('quantity, unit_price, status:work_order_parts_statuses!status_id(code)')
          .eq('work_order_id', workOrder.id),
      ])
      const servicesTotal = (svcs || [])
        .filter(s => !['cancelled','skipped'].includes(s.status?.code))
        .reduce((sum, s) => sum + Number(s.estimated_cost || 0), 0)
      const partsTotal = (parts || [])
        .filter(p => ['reserved','in_use'].includes(p.status?.code))
        .reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.unit_price || 0), 0)
      const subtotal = servicesTotal + partsTotal
      const tax      = Math.round(subtotal * 0.16 * 100) / 100
      const total    = Math.round(subtotal * 1.16 * 100) / 100
      setEstimate({ success: true, services_total: servicesTotal, parts_total: partsTotal, subtotal, tax, total })
    } catch {}
    finally { setEstimateLoading(false) }
  }, [workOrder.id, estimateProp])

  // ── Fetch line-item breakdown for expanded view ─────────────────────────
  const fetchBreakdown = useCallback(async () => {
    try {
      const [{ data: svcs }, { data: pts }] = await Promise.all([
        supabase
          .from('work_order_services')
          .select('id, estimated_cost, notes, service:services(name)')
          .eq('work_order_id', workOrder.id),
        supabase
          .from('work_order_parts')
          .select('id, quantity, spare_part:spare_parts(name, unit_price)')
          .eq('work_order_id', workOrder.id),
      ])
      setServices(svcs || [])
      setParts(pts || [])
    } catch {}
  }, [workOrder.id])

  useEffect(() => {
    if (statusCode === 'internal_review') {
      fetchEstimate()
    }
  }, [statusCode, fetchEstimate])

  useEffect(() => {
    if (expanded) fetchBreakdown()
  }, [expanded, fetchBreakdown])

  // ── Send estimate to customer ───────────────────────────────────────────
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
              ? 'A mechanic has submitted estimates for this work order. Review the breakdown below, then send to the customer for approval.'
              : 'Estimates have been submitted for internal review. An authorised member (owner, admin, or accountant) will review and send to the customer.'}
          </p>
        )}

        {/* Estimate summary card */}
        {estimate && !success && (
          <div className="bg-white rounded-lg border border-violet-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Estimate Summary
                </p>
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
                >
                  <Eye size={12} />
                  {expanded ? 'Hide' : 'View'} breakdown
                  {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            </div>

            <div className="px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Services</span>
                <span className="font-medium">{fmt(estimate.services_total)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Parts</span>
                <span className="font-medium">{fmt(estimate.parts_total)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>VAT 16%</span>
                <span>{fmt(estimate.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2">
                <span>Total</span>
                <span className="text-violet-800 text-base">{fmt(estimate.total)}</span>
              </div>
            </div>

            {/* Expanded line items */}
            {expanded && (
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                {services.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Services</p>
                    <div className="space-y-1">
                      {services.map(s => (
                        <div key={s.id} className="flex justify-between text-xs text-gray-700">
                          <span>{s.service?.name || 'Service'}</span>
                          <span className="font-medium">{fmt(s.estimated_cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {parts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Parts</p>
                    <div className="space-y-1">
                      {parts.map(p => (
                        <div key={p.id} className="flex justify-between text-xs text-gray-700">
                          <span>{p.spare_part?.name || 'Part'} × {p.quantity}</span>
                          <span className="font-medium">{fmt((p.spare_part?.unit_price || 0) * p.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {services.length === 0 && parts.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No line items loaded.</p>
                )}
              </div>
            )}
          </div>
        )}

        {estimateLoading && !success && (
          <div className="flex items-center gap-2 text-xs text-violet-500 italic">
            <Loader2 size={12} className="animate-spin" /> Loading estimate…
          </div>
        )}
        {!estimateLoading && !estimate && !success && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            No estimate data found. Ensure the mechanic has added services and parts before sending.
          </div>
        )}

        {/* Notes for accountant before sending */}
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
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {sending ? (
              <><Loader2 size={14} className="animate-spin" /> Sending to customer…</>
            ) : (
              <><Send size={14} /> Send Estimates to Customer</>
            )}
          </button>
        )}

        {/* Warning if estimate loaded but has zero value */}
        {!estimateLoading && estimate && estimate.total === 0 && canSend && !sending && !success && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            Estimate total is zero. Ensure services and parts have been added with pricing before sending.
          </div>
        )}
      </div>
    </div>
  )
}