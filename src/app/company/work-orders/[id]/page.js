'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, CheckCircle, XCircle, MessageSquare,
  Car, MapPin, Wrench, Package, Clock, AlertCircle,
  Loader2, DollarSign, ThumbsUp, ThumbsDown, Edit3,
  ChevronDown, ChevronUp, Building2, Star
} from 'lucide-react'

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

export default function CompanyWorkOrderDetailPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [wo, setWo]             = useState(null)
  const [loading, setLoading]   = useState(true)
  const [acting, setActing]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [canApprove, setCanApprove]   = useState(false)  // only admins/owners
  const [review, setReview]             = useState({ rating: 0, title: '', body: '' })
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [existingReview, setExistingReview]   = useState(null)

  const [decision, setDecision]           = useState(null)
  const [approveNotes, setApproveNotes]   = useState('')
  const [rejectReason, setRejectReason]   = useState('')
  const [changesText, setChangesText]     = useState('')
  const [showServices, setShowServices]   = useState(true)
  const [showParts, setShowParts]         = useState(false)

  const loadWorkOrder = useCallback(async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()

      // Check if current user has approval authority (owner or admin)
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      const { data: owned } = await supabase
        .from('company_profiles').select('id').eq('owner_user_id', profile.id).maybeSingle()
      const { data: mem } = await supabase
        .from('company_users').select('is_admin')
        .eq('user_id', profile.id).eq('is_active', true).maybeSingle()

      setCanApprove(!!(owned || mem?.is_admin))

      const { data: result, error: rpcErr } = await supabase.rpc('get_customer_work_order', {
        p_work_order_id:    params.id,
        p_customer_user_id: user.id,
      })

      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setWo(result.data)

      // Check existing review for this WO
      const { data: revData } = await supabase
        .from('provider_reviews')
        .select('id, rating, title, body, created_at')
        .eq('work_order_id', params.id)
        .maybeSingle()
      if (revData) setExistingReview(revData)

    } catch (err) {
      setError(err.message || 'Failed to load work order')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { loadWorkOrder() }, [loadWorkOrder])

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
      setSuccess('Estimate approved. The service provider has been notified.')
      setDecision(null)
      await loadWorkOrder()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { setError('Please provide a reason'); return }
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
    if (!changesText.trim()) { setError('Please describe the changes needed'); return }
    setActing(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes_requested: changesText.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send')
      setSuccess('Changes requested. The provider will revise and resubmit.')
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
      setSuccess('Review submitted on behalf of your company.')
    } catch (err) { setError(err.message) }
    finally { setReviewSubmitting(false) }
  }

  const fmt = (n) => n != null ? `KES ${Number(n).toLocaleString()}` : '—'

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  if (!wo) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.push('/company/work-orders')}
        className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Fleet Work Orders
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-3" size={40} />
        <h2 className="text-lg font-semibold text-red-900 mb-2">Work Order Not Found</h2>
        <p className="text-red-700 text-sm mb-4">{error || 'This work order could not be found.'}</p>
        <button onClick={() => router.push('/company/work-orders')}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          All Work Orders
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
  const subtotal = wo.subtotal || 0
  const tax      = wo.tax      || subtotal * 0.16
  const total    = wo.total_amount || (subtotal + tax)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => router.push('/company/work-orders')}
        className="flex items-center text-gray-500 hover:text-gray-800 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Fleet Work Orders
      </button>

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
            <h1 className="text-lg font-bold text-gray-900">{wo.work_order_number}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Opened {new Date(wo.opened_at).toLocaleDateString('en-KE', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
            {wo.status?.display_name}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div className="flex items-start gap-2">
            <Car size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-900">{wo.vehicle?.plate_number}</p>
              <p className="text-xs text-gray-500">
                {[wo.vehicle?.make, wo.vehicle?.model].filter(Boolean).join(' ')}
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
        </div>

        {wo.problem_description && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Problem</p>
            <p className="text-sm text-gray-700">{wo.problem_description}</p>
          </div>
        )}

        {/* Company approver note */}
        {isAwaiting && !canApprove && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-3">
            <Building2 size={14} className="flex-shrink-0" />
            Only company owners and admins can approve estimates. Contact your company admin.
          </div>
        )}
      </div>

      {/* Estimate card */}
      {(isAwaiting || wo.subtotal) && (
        <div className={`rounded-xl shadow-sm overflow-hidden border ${
          isAwaiting ? 'border-yellow-300 bg-yellow-50'
          : statusCode === 'approved' ? 'border-blue-200 bg-blue-50'
          : 'border-gray-200 bg-white'
        }`}>
          <div className="px-5 py-4 border-b border-current border-opacity-20">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign size={16} className="text-gray-500" /> Service Estimate
              </p>
              {isAwaiting && (
                <span className="text-xs px-2.5 py-1 bg-yellow-200 text-yellow-800 rounded-full font-medium">
                  Awaiting approval
                </span>
              )}
              {statusCode === 'approved' && (
                <span className="text-xs px-2.5 py-1 bg-blue-200 text-blue-800 rounded-full font-medium flex items-center gap-1">
                  <CheckCircle size={11} /> Approved
                </span>
              )}
            </div>
          </div>

          <div className="px-5 py-4">
            {/* Services */}
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
                        <span className="font-medium">{fmt(svc.actual_cost || svc.estimated_cost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Parts */}
            {parts.length > 0 && (
              <div className="mb-4">
                <button onClick={() => setShowParts(s => !s)}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Package size={13} className="text-gray-400" /> Parts ({parts.length})
                  </span>
                  {showParts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showParts && (
                  <div className="space-y-2 ml-5">
                    {parts.map((p, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{p.part_name} × {p.quantity}</span>
                        <span className="font-medium">{fmt(p.quantity * Number(p.unit_price || 0))}</span>
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
                <span>VAT (16%)</span><span>{fmt(tax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-300">
                <span>Total</span>
                <span className="text-blue-700">{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decision panel — only for admins/owners when awaiting */}
      {isAwaiting && canApprove && !success && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <p className="font-semibold text-gray-900 text-sm">Company Decision</p>

          {!decision && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button onClick={() => setDecision('approve')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-green-200 bg-green-50 hover:border-green-400 transition-all">
                <ThumbsUp className="text-green-600" size={22} />
                <span className="text-sm font-semibold text-green-800">Approve</span>
                <span className="text-xs text-green-600 text-center">Authorise the work</span>
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

          {decision === 'approve' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-green-700 flex items-center gap-1.5">
                <ThumbsUp size={14} /> Approve on behalf of company
              </p>
              <textarea value={approveNotes} onChange={e => setApproveNotes(e.target.value)}
                placeholder="Optional notes for the service provider..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-400" />
              <div className="flex gap-2">
                <button onClick={handleApprove} disabled={acting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-semibold">
                  {acting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Confirm Approval
                </button>
                <button onClick={() => setDecision(null)} className="px-4 py-2.5 text-gray-500 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {decision === 'changes' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-yellow-700 flex items-center gap-1.5">
                <Edit3 size={14} /> Describe required changes
              </p>
              <textarea value={changesText} onChange={e => setChangesText(e.target.value)}
                placeholder="Describe the changes needed before this can be approved..."
                rows={4}
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-yellow-400 bg-yellow-50" />
              <div className="flex gap-2">
                <button onClick={handleRequestChanges} disabled={acting || !changesText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 text-sm font-semibold">
                  {acting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  Send Request
                </button>
                <button onClick={() => setDecision(null)} className="px-4 py-2.5 text-gray-500 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {decision === 'reject' && (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                <strong>This will cancel the work order.</strong> The service provider will be notified.
              </div>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                rows={3}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-400 bg-red-50" />
              <div className="flex gap-2">
                <button onClick={handleReject} disabled={acting || !rejectReason.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-semibold">
                  {acting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Rejection
                </button>
                <button onClick={() => setDecision(null)} className="px-4 py-2.5 text-gray-500 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status info */}
      {!isAwaiting && !isTerminal && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Clock className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium text-blue-900 text-sm">Service in progress</p>
            <p className="text-blue-700 text-xs mt-0.5">
              {statusCode === 'diagnosing'    && 'The vehicle is being diagnosed. You will be notified when an estimate is ready.'}
              {statusCode === 'in_progress'   && 'Work has started. You will be notified when complete.'}
              {statusCode === 'quality_check' && 'Quality checks are being performed.'}
              {statusCode === 'rework'        && 'Some items are being revisited to ensure quality.'}
              {!['diagnosing','in_progress','quality_check','rework'].includes(statusCode)
                && 'Your vehicle is at the garage. You will receive updates as work progresses.'}
            </p>
          </div>
        </div>
      )}

      {isTerminal && (
        <div className={`rounded-xl p-4 flex items-start gap-3 ${
          ['completed','closed'].includes(statusCode)
            ? 'bg-green-50 border border-green-200'
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <CheckCircle className={statusCode === 'cancelled' ? 'text-gray-400' : 'text-green-600'} size={18} />
          <div>
            <p className="font-medium text-gray-900 text-sm">
              {statusCode === 'completed' && 'Service complete — vehicle is ready for pickup'}
              {statusCode === 'closed'    && 'Work order closed'}
              {statusCode === 'cancelled' && 'Work order cancelled'}
            </p>
            {wo.estimate_approved_at && (
              <p className="text-xs text-gray-500 mt-0.5">
                Approved on {new Date(wo.estimate_approved_at).toLocaleDateString('en-KE', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Review (company admin/owner only, completed/closed WOs) ── */}
      {['completed','closed'].includes(statusCode) && canApprove && !reviewSubmitted && (
        existingReview ? (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Star size={15} className="text-yellow-500" /> Company Review
            </p>
            <div className="flex gap-1 mb-2">
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={18}
                  className={s <= existingReview.rating ? 'text-yellow-400' : 'text-gray-200'}
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
              Rate this service
            </p>
            <p className="text-xs text-gray-500">
              Leave a review on behalf of your company for {wo.service_provider?.name}.
            </p>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            <textarea value={review.body}
              onChange={e => setReview(r => ({ ...r, body: e.target.value }))}
              placeholder="Share your experience with this provider..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleSubmitReview} disabled={reviewSubmitting || review.rating === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold">
              {reviewSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
              Submit Review
            </button>
          </div>
        )
      )}
    </div>
  )
}