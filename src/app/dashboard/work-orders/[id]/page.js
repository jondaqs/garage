'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import CustomerCommentsCard from '@/components/CustomerCommentsCard'
import CustomerRecommendationsCard from '@/components/CustomerRecommendationsCard'
import {
  ArrowLeft, CheckCircle, XCircle, MessageSquare,
  Car, MapPin, Wrench, Package, Clock, AlertCircle,
  Loader2, DollarSign, ThumbsUp, ThumbsDown, Edit3,
  ChevronDown, ChevronUp, Star, FileText, ChevronRight, Receipt, ClipboardCheck,
  AlertTriangle, ShieldAlert,
  Bell, Calendar, Gauge, RefreshCw, User} from 'lucide-react'

// Severity → colour mapping for the diagnostic-findings card.
const SEVERITY_STYLES = {
  critical: { ring: 'ring-red-300',    dot: 'bg-red-500',    label: 'bg-red-100 text-red-800'    },
  high:     { ring: 'ring-orange-300', dot: 'bg-orange-500', label: 'bg-orange-100 text-orange-800' },
  medium:   { ring: 'ring-amber-300',  dot: 'bg-amber-500',  label: 'bg-amber-100 text-amber-800' },
  low:      { ring: 'ring-slate-300',  dot: 'bg-slate-400',  label: 'bg-slate-100 text-slate-700'  },
}

const STATUS_COLORS = {
  intake:            { bg: 'bg-gray-100',    text: 'text-gray-600'   },
  assigned:          { bg: 'bg-blue-100',    text: 'text-blue-700'   },
  diagnosing:        { bg: 'bg-purple-100',  text: 'text-purple-700' },
  awaiting_approval: { bg: 'bg-yellow-100',  text: 'text-yellow-700' },
  approved:          { bg: 'bg-cyan-100',    text: 'text-cyan-700'   },
  in_progress:       { bg: 'bg-orange-100',  text: 'text-orange-700' },
  quality_check:     { bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  rework:            { bg: 'bg-red-100',     text: 'text-red-700'    },
  completed:         { bg: 'bg-green-100',   text: 'text-green-700'  },
  cancelled:         { bg: 'bg-red-100',     text: 'text-red-500'    },
  closed:            { bg: 'bg-gray-100',    text: 'text-gray-500'   },
}

export default function CustomerWorkOrderPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [wo, setWo]               = useState(null)
  const [loading, setLoading]     = useState(true)
  const [acting, setActing]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  // Review state
  const [review, setReview]             = useState({ rating: 0, title: '', body: '' })
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [existingReview, setExistingReview]   = useState(null)

  // Decision state
  const [decision, setDecision]         = useState(null)   // 'approve' | 'reject' | 'changes'
  const [approveNotes, setApproveNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [changesText, setChangesText]   = useState('')
  const [showServices, setShowServices] = useState(true)
  const [showParts, setShowParts]       = useState(false)
  const [invoiceStatus, setInvoiceStatus] = useState(null)  // null | 'draft' | 'sent' | 'paid' | 'overdue'
  const [receiptConfirmed, setReceiptConfirmed] = useState(null) // null | true | false
  const [checkoutSubmitted,   setCheckoutSubmitted]   = useState(false)
  const [checkoutRequested,   setCheckoutRequested]   = useState(false)
  const [requestingCheckout,  setRequestingCheckout]  = useState(false)
  const [checkoutReqSuccess,  setCheckoutReqSuccess]  = useState(false)
  const [refreshing,          setRefreshing]          = useState(false)

  const loadWorkOrder = useCallback(async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()

      const { data: result, error: rpcErr } = await supabase.rpc('get_customer_work_order', {
        p_work_order_id:    params.id,
        p_customer_user_id: user.id,
      })

      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setWo(result.data)

      // Check if already reviewed
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: revData } = await supabase
        .from('provider_reviews')
        .select('id, rating, title, body, created_at')
        .eq('work_order_id', params.id)
        .maybeSingle()
      if (revData) setExistingReview(revData)

      // Check if an invoice exists for this work order
      const { data: invRow } = await supabase
        .from('invoices')
        .select('id, status')
        .eq('work_order_id', params.id)
        .maybeSingle()
      setInvoiceStatus(invRow?.status || null)

      // Check if receipt is confirmed by provider
      if (invRow?.status === 'paid') {
        const { data: receiptRow } = await supabase
          .from('receipts')
          .select('confirmed')
          .eq('invoice_id', invRow.id)
          .order('paid_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setReceiptConfirmed(receiptRow?.confirmed ?? null)
      }

      // Check if provider has submitted checkout
      const { data: checkoutRow } = await supabase
        .from('work_order_checkouts')
        .select('id')
        .eq('work_order_id', params.id)
        .maybeSingle()
      setCheckoutSubmitted(!!checkoutRow)

      // Check if customer already sent a checkout request notification
      const { data: { user: authUser2 } } = await supabase.auth.getUser()
      const { data: reqNote } = await supabase
        .from('notifications')
        .select('id')
        .eq('reference_id', params.id)
        .eq('type', 'checkout_requested')
        .maybeSingle()
      setCheckoutRequested(!!reqNote)

    } catch (err) {
      setError(err.message || 'Failed to load work order')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { loadWorkOrder() }, [loadWorkOrder])

  // ── Decision handlers ────────────────────────────────────────────────────
  const handleApprove = async () => {
    setActing(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: approveNotes || null }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to approve')
      setSuccess('Estimate approved! The service provider has been notified and will begin work.')
      setDecision(null)
      await loadWorkOrder()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { setError('Please provide a reason for rejection'); return }
    setActing(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to reject')
      setSuccess('Estimate rejected. The service provider has been notified.')
      setDecision(null)
      await loadWorkOrder()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  const handleRequestChanges = async () => {
    if (!changesText.trim()) { setError('Please describe the changes you need'); return }
    setActing(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes_requested: changesText.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send')
      setSuccess('Changes requested. The service provider will revise the estimate and resubmit.')
      setDecision(null)
      setChangesText('')
      await loadWorkOrder()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  const handleSubmitReview = async () => {
    if (review.rating === 0) { setError('Please select a star rating'); return }
    setReviewSubmitting(true); setError('')
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('submit_provider_review', {
        p_work_order_id:    params.id,
        p_customer_user_id: authUser.id,
        p_rating:           review.rating,
        p_title:            review.title || null,
        p_body:             review.body  || null,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setReviewSubmitted(true)
      setSuccess('Thank you for your review!')
    } catch (err) { setError(err.message) }
    finally { setReviewSubmitting(false) }
  }

  // Currency-aware formatter. The work order's currency arrives as
  // `wo.currency_obj` from the get_customer_work_order RPC (since we updated
  // it to expose the joined currency row). Falls back to a bare number when
  // no currency is set on the work order.
  const fmt = (n) => {
    if (n == null) return '—'
    const num = Number(n).toLocaleString()
    const cur = wo?.currency_obj
    if (!cur) return num
    return `${cur.symbol || cur.code} ${num}`
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  if (!wo) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Back
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-3" size={40} />
        <h2 className="text-lg font-semibold text-red-900 mb-2">Work Order Not Found</h2>
        <p className="text-red-700 text-sm mb-4">{error || 'This work order could not be found or you do not have access.'}</p>
        <button onClick={() => router.push('/dashboard/bookings')}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          My Bookings
        </button>
      </div>
    </div>
  )

  const statusCode  = wo.status?.code
  const statusStyle = STATUS_COLORS[statusCode] || STATUS_COLORS.intake
  const isAwaiting  = statusCode === 'awaiting_approval'
  const isTerminal  = ['completed','cancelled','closed'].includes(statusCode)

  const services = wo.services || []
  const parts    = wo.parts    || []

  // Issues from the diagnostic stage. The RPC always returns `issues` for
  // every reader of the work order — they're context everyone benefits from.
  // The `can_approve_estimates` flag below decides whether *this* user gets
  // the actionable highlight on top; company members without that permission
  // still see the diagnostic-findings card, just without the highlight.
  const issues               = Array.isArray(wo.issues) ? wo.issues : []
  const canViewIssues        = wo.can_view_issues !== false
  const canApproveEstimates  = wo.can_approve_estimates !== false  // permissive default
  const approvalIssues       = issues.filter(i => i.requires_approval)
  // Highlight banner shows only when the caller can act on the estimate AND
  // the work order is awaiting approval AND there's something flagged.
  const highlightApprovalIssues =
    canApproveEstimates && isAwaiting && approvalIssues.length > 0

  const servicesTotal = services.reduce((s, sv) => s + Number(sv.actual_cost || sv.estimated_cost || 0), 0)
  const partsTotal    = parts.reduce((s, p) => s + (p.quantity * Number(p.unit_price || 0)), 0)
  const vatRate        = wo.vat_rate ?? 16
  const subtotal      = wo.subtotal || (servicesTotal + partsTotal)
  const tax           = wo.tax      || Math.round(subtotal * vatRate / 100 * 100) / 100
  const total         = wo.total_amount || (subtotal + tax)

  // ── Issue card renderer (shared between the inline list and the highlight) ──
  // Defined inline so we can pass the per-context emphasis class.
  const renderIssue = (iss, emphasised = false) => {
    const sev = SEVERITY_STYLES[iss.severity] || SEVERITY_STYLES.medium
    return (
      <div
        key={iss.id}
        className={
          'rounded-lg border bg-white p-3 ' +
          (emphasised ? 'ring-2 ' + sev.ring + ' border-transparent' : 'border-gray-200')
        }
      >
        <div className="flex items-start gap-2.5">
          <span className={'mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ' + sev.dot} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <p className="text-sm font-semibold text-gray-900">{iss.title || 'Issue'}</p>
              <span className={'text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ' + sev.label}>
                {iss.severity || 'medium'}
              </span>
              {iss.requires_approval && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 inline-flex items-center gap-1">
                  <ShieldAlert size={10} /> Needs approval
                </span>
              )}
              {iss.resolved_at && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800 inline-flex items-center gap-1">
                  <CheckCircle size={10} /> Resolved
                </span>
              )}
            </div>
            {iss.description && (
              <p className="text-xs text-gray-600 whitespace-pre-line">{iss.description}</p>
            )}
            {iss.reported_at && (
              <p className="text-[11px] text-gray-400 mt-1">
                Reported {new Date(iss.reported_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => router.push('/dashboard/bookings')}
        className="flex items-center text-gray-500 hover:text-gray-800 text-sm">
        <ArrowLeft size={16} className="mr-1" /> My Bookings
      </button>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2">
          <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {wo.work_order_number || 'Work Order'}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Opened {new Date(wo.opened_at).toLocaleDateString('en-KE', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
              {wo.status?.display_name || statusCode}
            </span>
            <button
              onClick={async () => { setRefreshing(true); await loadWorkOrder(); setRefreshing(false) }}
              disabled={refreshing}
              title="Refresh"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Key info */}
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div className="flex items-start gap-2">
            <Car size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">{wo.vehicle?.plate_number || '—'}</p>
              <p className="text-xs text-gray-500">
                {[wo.vehicle?.make, wo.vehicle?.model, wo.vehicle?.year_of_manufacture].filter(Boolean).join(' ')}
                {wo.vehicle?.color && <span className="text-gray-400"> · {wo.vehicle.color}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">{wo.service_provider?.name}</p>
              {wo.shop?.town && <p className="text-xs text-gray-500">{wo.shop.town}</p>}
            </div>
          </div>
          {/* Vehicle owner */}
          {wo.owner && (wo.owner.first_name || wo.owner.company_name) && (
            <div className="flex items-start gap-2">
              <User size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">
                  {wo.owner.owner_type === 'company'
                    ? wo.owner.company_name
                    : [wo.owner.first_name, wo.owner.last_name].filter(Boolean).join(' ')}
                </p>
                <p className="text-xs text-gray-500">
                  {wo.owner.owner_type === 'company' ? 'Fleet vehicle' : 'Owner'}
                </p>
              </div>
            </div>
          )}
          {/* Mileage */}
          {(wo.initial_mileage || wo.final_mileage) && (
            <div className="flex items-start gap-2">
              <Gauge size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">
                  {wo.initial_mileage ? `${Number(wo.initial_mileage).toLocaleString()} km` : '—'}
                  {wo.final_mileage && ` → ${Number(wo.final_mileage).toLocaleString()} km`}
                </p>
                <p className="text-xs text-gray-500">Mileage</p>
              </div>
            </div>
          )}
        </div>

        {wo.problem_description && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">
              Reported problem
            </p>
            <p className="text-sm text-gray-700">{wo.problem_description}</p>
          </div>
        )}
      </div>

      {/* ── HIGHLIGHTED REQUIRES-APPROVAL ISSUES ──────────────────────────
          Shown above the Estimate card while the work order is awaiting
          the customer's approval AND the mechanic flagged one or more
          issues as requires_approval. No separate decision flow — the
          customer reviews these here and then approves or rejects the
          estimate below using the existing buttons. ─────────────────── */}
      {highlightApprovalIssues && (
        <div className="rounded-xl border-2 border-yellow-400 bg-yellow-50 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-yellow-100 border-b border-yellow-300 flex items-center gap-2">
            <ShieldAlert className="text-yellow-700 flex-shrink-0" size={18} />
            <div className="flex-1">
              <p className="font-semibold text-yellow-900 text-sm">
                {approvalIssues.length === 1
                  ? 'The mechanic flagged 1 finding for your attention'
                  : `The mechanic flagged ${approvalIssues.length} findings for your attention`}
              </p>
              <p className="text-yellow-800 text-xs mt-0.5">
                Review these before approving the estimate. If anything concerns you, reject the estimate and explain why.
              </p>
            </div>
          </div>
          <div className="p-3 space-y-2">
            {approvalIssues.map(iss => renderIssue(iss, true))}
          </div>
        </div>
      )}

      {/* ── DIAGNOSTIC FINDINGS CARD ───────────────────────────────────
          All issues recorded against the work order. Hidden for company
          members who don't have can_approve_estimates (server returns
          can_view_issues=false and issues=null for them). ────────────── */}
      {canViewIssues && issues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle className="text-gray-500 flex-shrink-0" size={16} />
            <p className="font-semibold text-gray-900 text-sm">
              Diagnostic Findings ({issues.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            {/* When the approval-required highlight is active above, those
                issues are already shown there — don't repeat them here, but
                still show any informational/resolved issues. */}
            {issues
              .filter(iss => !(highlightApprovalIssues && iss.requires_approval))
              .map(iss => renderIssue(iss, false))}
            {/* If the filter removed everything (every issue is in the
                highlight), show a friendly pointer instead of a blank card. */}
            {highlightApprovalIssues
              && issues.every(iss => iss.requires_approval) && (
              <p className="text-xs text-gray-500 italic px-1">
                All findings are listed in the approval highlight above.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── ESTIMATE CARD (shown when awaiting_approval or already decided) ── */}
      {(isAwaiting || wo.subtotal) && (
        <div className={`rounded-xl shadow-sm overflow-hidden border ${
          isAwaiting
            ? 'border-yellow-300 bg-yellow-50'
            : statusCode === 'approved'
              ? 'border-green-300 bg-green-50'
              : 'border-gray-200 bg-white'
        }`}>
          <div className="px-5 py-4 border-b border-current border-opacity-20">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign size={16} className="text-gray-500" />
                Service Estimate
              </p>
              {isAwaiting && (
                <span className="text-xs px-2.5 py-1 bg-yellow-200 text-yellow-800 rounded-full font-medium">
                  Awaiting your approval
                </span>
              )}
              {statusCode === 'approved' && (
                <span className="text-xs px-2.5 py-1 bg-green-200 text-green-800 rounded-full font-medium flex items-center gap-1">
                  <CheckCircle size={11} /> Approved
                </span>
              )}
            </div>
            {isAwaiting && wo.estimate_sent_at && (
              <p className="text-xs text-yellow-700 mt-1">
                Sent {new Date(wo.estimate_sent_at).toLocaleDateString('en-KE', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
          </div>

          <div className="px-5 py-4">
            {/* Services breakdown */}
            {services.length > 0 && (
              <div className="mb-4">
                <button onClick={() => setShowServices(s => !s)}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Wrench size={13} className="text-gray-400" /> Services ({services.length})
                  </span>
                  {showServices ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showServices && (
                  <div className="space-y-2 ml-5">
                    {services.map((svc, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{svc.service_name}</span>
                        <span className="text-gray-900 font-medium">
                          {fmt(svc.actual_cost || svc.estimated_cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Parts breakdown */}
            {parts.length > 0 && (
              <div className="mb-4">
                <button onClick={() => setShowParts(s => !s)}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Package size={13} className="text-gray-400" /> Parts &amp; Materials ({parts.length})
                  </span>
                  {showParts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showParts && (
                  <div className="space-y-2 ml-5">
                    {parts.map((p, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{p.part_name} × {p.quantity}</span>
                        <span className="text-gray-900 font-medium">
                          {fmt(p.quantity * Number(p.unit_price || 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Totals */}
            <div className="border-t border-gray-200 pt-3 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>VAT ({vatRate}%)</span><span>{fmt(tax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-300">
                <span>Total</span><span className="text-green-700">{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DECISION PANEL (only when awaiting_approval) ── */}
      {isAwaiting && !success && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <p className="font-semibold text-gray-900 text-sm">Your Decision</p>

          {/* Decision selector buttons */}
          {!decision && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button onClick={() => setDecision('approve')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-green-200 bg-green-50 hover:border-green-400 transition-all">
                <ThumbsUp className="text-green-600" size={22} />
                <span className="text-sm font-semibold text-green-800">Approve</span>
                <span className="text-xs text-green-600 text-center">Authorise work to begin</span>
              </button>
              <button onClick={() => setDecision('changes')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-yellow-200 bg-yellow-50 hover:border-yellow-400 transition-all">
                <Edit3 className="text-yellow-600" size={22} />
                <span className="text-sm font-semibold text-yellow-800">Request Changes</span>
                <span className="text-xs text-yellow-600 text-center">Ask provider to revise</span>
              </button>
              <button onClick={() => setDecision('reject')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-red-200 bg-red-50 hover:border-red-400 transition-all">
                <ThumbsDown className="text-red-600" size={22} />
                <span className="text-sm font-semibold text-red-800">Reject</span>
                <span className="text-xs text-red-600 text-center">Cancel the service</span>
              </button>
            </div>
          )}

          {/* Approve form */}
          {decision === 'approve' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                <ThumbsUp size={15} /> Approve estimate
              </div>
              <textarea value={approveNotes}
                onChange={e => setApproveNotes(e.target.value)}
                placeholder="Optional: any notes for the service provider..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-400" />
              <div className="flex gap-2">
                <button onClick={handleApprove} disabled={acting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-semibold">
                  {acting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  Confirm Approval
                </button>
                <button onClick={() => setDecision(null)} disabled={acting}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Request changes form */}
          {decision === 'changes' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-yellow-700 font-medium">
                <Edit3 size={15} /> Request changes
              </div>
              <textarea value={changesText}
                onChange={e => setChangesText(e.target.value)}
                placeholder="Describe what changes you need (e.g. 'Please remove the air filter replacement — I just had it done' or 'The labour cost seems high for a simple oil change')..."
                rows={4}
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-yellow-400 bg-yellow-50" />
              <div className="flex gap-2">
                <button onClick={handleRequestChanges} disabled={acting || !changesText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 text-sm font-semibold">
                  {acting ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
                  Send Request
                </button>
                <button onClick={() => setDecision(null)} disabled={acting}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Reject form */}
          {decision === 'reject' && (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-semibold text-red-800 mb-1">⚠️ This will cancel the work order</p>
                <p className="text-xs text-red-700">
                  The service provider will be notified and the work order will be closed.
                  You can book a new appointment if needed.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-red-700 font-medium">
                <ThumbsDown size={15} /> Reason for rejection *
              </div>
              <textarea value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Please explain why you are rejecting this estimate..."
                rows={3}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-400 bg-red-50" />
              <div className="flex gap-2">
                <button onClick={handleReject} disabled={acting || !rejectReason.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-semibold">
                  {acting ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                  Confirm Rejection
                </button>
                <button onClick={() => setDecision(null)} disabled={acting}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STATUS INFO for non-approval statuses ── */}
      {!isAwaiting && !isTerminal && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Clock className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium text-blue-900 text-sm">Service in progress</p>
            <p className="text-blue-700 text-xs mt-0.5">
              {statusCode === 'diagnosing' && 'Your vehicle is being diagnosed. You will be notified when the estimate is ready.'}
              {statusCode === 'in_progress' && 'Work has started on your vehicle. You will be notified when it is complete.'}
              {statusCode === 'quality_check' && 'Your vehicle is undergoing quality checks before handover.'}
              {statusCode === 'rework' && 'Some items are being revisited to ensure quality. You will be notified when complete.'}
              {!['diagnosing','in_progress','quality_check','rework'].includes(statusCode) && 'Your vehicle is at the garage. You will receive updates as work progresses.'}
            </p>
          </div>
        </div>
      )}

      {isTerminal && (
        <div className={`rounded-xl p-4 flex items-start gap-3 ${
          statusCode === 'completed' || statusCode === 'closed'
            ? 'bg-green-50 border border-green-200'
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <CheckCircle className={statusCode === 'cancelled' ? 'text-gray-400' : 'text-green-600'} size={18} />
          <div>
            <p className="font-medium text-gray-900 text-sm">
              {statusCode === 'completed' && 'Service complete — your vehicle is ready for pickup'}
              {statusCode === 'closed'    && 'Work order closed'}
              {statusCode === 'cancelled' && 'Work order cancelled'}
            </p>
            {wo.estimate_approved_at && (
              <p className="text-xs text-gray-500 mt-0.5">
                You approved this estimate on{' '}
                {new Date(wo.estimate_approved_at).toLocaleDateString('en-KE', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </p>
            )}
          </div>
        </div>
      )}


      {/* ── Recommendations + Notes (read-only, collapsible) ────────────
          Both are derived/fetched read-only views of provider-authored
          content. They live above the Invoice banner so customers see them
          while reviewing what was done before paying. Each card is
          collapsed by default — they auto-hide when empty. ──────────── */}
      <CustomerRecommendationsCard recommendations={wo.recommendations} />
      <CustomerCommentsCard workOrderId={wo.id} />

      {/* ── Invoice banner ── */}
      {invoiceStatus && (
        <div className={`rounded-xl shadow-sm overflow-hidden border ${
          invoiceStatus === 'paid'
            ? 'border-green-200 bg-green-50'
            : 'border-amber-200 bg-amber-50'
        }`}>
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                invoiceStatus === 'paid' ? 'bg-green-100' : 'bg-amber-100'
              }`}>
                <FileText size={16} className={invoiceStatus === 'paid' ? 'text-green-600' : 'text-amber-600'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Invoice</p>
                <p className={`text-xs font-medium capitalize ${
                  invoiceStatus === 'paid' ? 'text-green-600' : 'text-amber-700'
                }`}>
                  {invoiceStatus === 'paid' ? '✓ Paid' : invoiceStatus === 'overdue' ? 'Overdue' : 'Awaiting Payment'}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/dashboard/work-orders/${params.id}/invoice`)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                invoiceStatus === 'paid'
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}>
              View Invoice <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Request Checkout banner ── */}
      {invoiceStatus && !checkoutSubmitted
        && !['closed', 'cancelled'].includes(statusCode) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-100 flex-shrink-0 mt-0.5">
              <ClipboardCheck size={16} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {invoiceStatus === 'paid' ? 'Checkout not yet submitted' : 'Checkout not yet submitted'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                {invoiceStatus === 'paid'
                  ? 'Payment received — the provider hasn\'t submitted the checkout form yet. You can remind them.'
                  : 'The provider has sent an invoice but hasn\'t submitted the checkout form yet. You can notify them to complete the checkout before you make payment.'}
              </p>
              {checkoutReqSuccess ? (
                <p className="mt-2 text-xs font-medium text-green-700 flex items-center gap-1">
                  <CheckCircle size={13} /> Provider notified — they will submit the checkout shortly.
                </p>
              ) : (
                <button
                  onClick={async () => {
                    setRequestingCheckout(true)
                    try {
                      const resp = await fetch(`/api/work-orders/${params.id}/request-checkout`, { method: 'POST' })
                      const data = await resp.json()
                      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send request')
                      setCheckoutRequested(true)
                      setCheckoutReqSuccess(true)
                    } catch (err) { setError(err.message) }
                    finally { setRequestingCheckout(false) }
                  }}
                  disabled={requestingCheckout || checkoutRequested}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {requestingCheckout
                    ? <><Loader2 size={13} className="animate-spin" /> Sending…</>
                    : checkoutRequested
                      ? <><CheckCircle size={13} /> Request Sent</>
                      : <><MessageSquare size={13} /> Notify Provider to Submit Checkout</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout banner ── */}
      {checkoutSubmitted && ['awaiting_customer_checkout', 'closed'].includes(statusCode) && (
        <div className="rounded-xl shadow-sm overflow-hidden border border-purple-200 bg-purple-50">
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-100">
                <ClipboardCheck size={16} className="text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Vehicle Checkout</p>
                <p className="text-xs font-medium text-purple-700">
                  {statusCode === 'closed' ? '✓ Checkout Accepted' : 'Awaiting Your Confirmation'}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/dashboard/work-orders/${params.id}/checkout`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-purple-600 text-white hover:bg-purple-700">
              View Checkout <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}


      {/* ── Receipt banner (paid only) ── */}
      {invoiceStatus === 'paid' && (
        <div className={`rounded-xl shadow-sm overflow-hidden border ${
          receiptConfirmed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        }`}>
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                receiptConfirmed ? 'bg-emerald-100' : 'bg-amber-100'
              }`}>
                <Receipt size={16} className={receiptConfirmed ? 'text-emerald-600' : 'text-amber-600'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Payment Receipt</p>
                <p className={`text-xs font-medium ${receiptConfirmed ? 'text-emerald-600' : 'text-amber-700'}`}>
                  {receiptConfirmed ? '✓ Payment Confirmed' : 'Payment done, awaiting provider confirmation'}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/dashboard/work-orders/${params.id}/receipt`)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                receiptConfirmed ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}>
              View Receipt <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Review section (completed or closed WOs only) ── */}
      {['completed','closed'].includes(statusCode) && !reviewSubmitted && (
        existingReview ? (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Star size={15} className="text-yellow-500" /> Your Review
            </p>
            <div className="flex gap-1 mb-2">
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={18}
                  className={s <= existingReview.rating ? 'text-yellow-500' : 'text-gray-200'}
                  fill={s <= existingReview.rating ? 'currentColor' : 'none'} />
              ))}
            </div>
            {existingReview.title && <p className="text-sm font-medium text-gray-800">{existingReview.title}</p>}
            {existingReview.body  && <p className="text-sm text-gray-600 mt-1">{existingReview.body}</p>}
            <p className="text-xs text-gray-400 mt-2">
              Reviewed {new Date(existingReview.created_at).toLocaleDateString('en-KE', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Star size={15} className="text-yellow-500" />
              Rate your experience
            </p>
            <p className="text-xs text-gray-500">
              How was the service at {wo.service_provider?.name}?
            </p>

            {/* Star selector */}
            <div className="flex gap-2">
              {[1,2,3,4,5].map(s => (
                <button key={s}
                  onClick={() => setReview(r => ({ ...r, rating: s }))}
                  className="p-1 transition-transform hover:scale-110">
                  <Star size={28}
                    className={s <= review.rating ? 'text-yellow-400' : 'text-gray-300'}
                    fill={s <= review.rating ? 'currentColor' : 'none'} />
                </button>
              ))}
              {review.rating > 0 && (
                <span className="text-sm text-gray-500 self-center ml-1">
                  {['','Poor','Fair','Good','Very good','Excellent'][review.rating]}
                </span>
              )}
            </div>

            <input type="text" value={review.title}
              onChange={e => setReview(r => ({ ...r, title: e.target.value }))}
              placeholder="Headline (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />

            <textarea value={review.body}
              onChange={e => setReview(r => ({ ...r, body: e.target.value }))}
              placeholder="Tell others about your experience..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-500" />

            <button onClick={handleSubmitReview} disabled={reviewSubmitting || review.rating === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-semibold">
              {reviewSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
              Submit Review
            </button>
          </div>
        )
      )}
    </div>
  )
}