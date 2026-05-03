'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Wrench, CheckCircle, XCircle, AlertCircle, Loader2,
  RefreshCw, ClipboardList, Car, Send, FileText,
  Clock, Filter, ChevronDown, Bell, Receipt, AlertTriangle, BellRing, ClipboardCheck, Search
} from 'lucide-react'

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  intake:             'bg-gray-100 text-gray-600',
  assigned:           'bg-blue-100 text-blue-700',
  diagnosing:         'bg-purple-100 text-purple-700',
  services_estimates: 'bg-blue-100 text-blue-700',
  internal_review:    'bg-violet-100 text-violet-700',
  awaiting_approval:  'bg-yellow-100 text-yellow-700',
  approved:           'bg-cyan-100 text-cyan-700',
  in_progress:        'bg-orange-100 text-orange-700',
  quality_check:      'bg-indigo-100 text-indigo-700',
  rework:             'bg-red-100 text-red-700',
  completed:          'bg-green-100 text-green-700',
  cancelled:          'bg-red-100 text-red-500',
  closed:             'bg-gray-100 text-gray-500',
}

const ASSIGN_BADGE = {
  pending:      { cls: 'bg-yellow-100 text-yellow-700', label: '⏳ Awaiting response' },
  acknowledged: { cls: 'bg-green-100  text-green-700',  label: '✓ Acknowledged'       },
  declined:     { cls: 'bg-gray-100   text-gray-500',   label: 'Declined'             },
}

// ── Action-needed helpers ─────────────────────────────────────────────────────
/**
 * Returns an action badge for a WO given what the current user can do.
 * Returns null if no action is needed from this user.
 */
function getActionNeeded(wo, userRole, canSendEstimates, canSendInvoice) {
  const code = wo.status?.code
  const isFinancialRole = ['service_provider_owner','admin','accountant'].includes(userRole)
    || canSendEstimates || canSendInvoice

  if (code === 'internal_review' && canSendEstimates) {
    return { label: 'Review & send estimate', color: 'bg-violet-100 text-violet-800 border-violet-300', icon: Send, urgent: true }
  }
  if (wo.estimate_approved && code === 'approved') {
    return { label: 'Estimate approved — start service work', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle, urgent: true }
  }
  if (code === 'completed' && canSendInvoice) {
    return { label: 'Generate invoice', color: 'bg-green-100 text-green-800 border-green-300', icon: FileText, urgent: true }
  }
  if (code === 'quality_check' && canSendInvoice) {
    return { label: 'Invoice ready to generate', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: FileText, urgent: false }
  }
  if (wo.checkout_requested && !wo.checkout_request_satisfied) {
    return { label: 'Submit checkout form — customer is waiting', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: ClipboardCheck, urgent: true }
  }
  if (wo.checkout_declined) {
    return { label: 'Checkout declined — review and resubmit', color: 'bg-red-100 text-red-800 border-red-300', icon: ClipboardCheck, urgent: true }
  }
  if (wo.mechanic_assignment_status === 'pending') {
    return { label: 'Acknowledge assignment', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Bell, urgent: true }
  }
  return null
}

const FILTER_OPTIONS = [
  { value: 'action',            label: 'Action needed'     },
  { value: 'all',               label: 'All'               },
  { value: 'active',            label: 'In progress'       },
  { value: 'internal_review',   label: 'Estimate review'   },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'completed',         label: 'Completed'         },
  { value: 'history',           label: 'Closed / History'  },
]

export default function MemberWorkOrdersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [workOrders,      setWorkOrders]      = useState([])
  const [userPerms,       setUserPerms]       = useState({}) // map providerId → { role, can_send_estimates, can_send_invoice }
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshing]      = useState(false)
  const [error,           setError]           = useState('')
  const [filter,          setFilter]          = useState('action')
  const [showFilter,      setShowFilter]      = useState(false)
  const [search,          setSearch]          = useState('')
  const [acknowledging,   setAcknowledging]   = useState(null)
  const [declineReason,   setDeclineReason]   = useState('')
  const [showDeclineForm, setShowDeclineForm] = useState(null)
  const [checkoutRequestCount,  setCheckoutRequestCount]  = useState(0)
  const [checkoutDeclinedCount, setCheckoutDeclinedCount] = useState(0)
  const [estimateApprovedCount, setEstimateApprovedCount] = useState(0)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else         setRefreshing(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // ── 1. Mechanic assigned WOs ──────────────────────────────────────────
      const { data: mechResult } = await supabase.rpc(
        'get_mechanic_assigned_work_orders',
        { p_mechanic_user_id: user.id }
      )

      // ── 2. SPU member WOs (admin, accountant, manager — all provider WOs) ─
      const { data: spuResult } = await supabase.rpc(
        'get_provider_member_work_orders',
        { p_user_id: user.id }
      )

      // ── 3. Merge, dedup ───────────────────────────────────────────────────
      const mechWOs = mechResult?.work_orders || []
      const spuWOs  = spuResult?.work_orders  || []
      const seen    = new Set(mechWOs.map(w => w.id))
      const merged  = [...mechWOs, ...spuWOs.filter(w => !seen.has(w.id))]
      setWorkOrders(merged)
      setCheckoutRequestCount(
        merged.filter(w => w.checkout_requested && !w.checkout_request_satisfied).length
      )
      setCheckoutDeclinedCount(
        merged.filter(w => w.checkout_declined).length
      )
      setEstimateApprovedCount(
        merged.filter(w => w.estimate_approved && w.status?.code === 'approved').length
      )

      // ── 4. Build perms map per provider ──────────────────────────────────
      const permsMap = {}
      for (const wo of merged) {
        const pid = wo.provider?.id || wo.service_provider_id
        if (!pid || permsMap[pid]) continue
        permsMap[pid] = {
          role:               wo.role || null,
          can_send_estimates: !!wo.can_send_estimates,
          can_send_invoice:   !!wo.can_send_invoice,
        }
      }
      setUserPerms(permsMap)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const acknowledgeWO = async (woId) => {
    setAcknowledging(woId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.rpc('acknowledge_work_order_assignment', {
        p_work_order_id: woId, p_mechanic_user_id: user.id,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      await load(true)
    } catch (e) { alert(e.message) }
    finally { setAcknowledging(null) }
  }

  const declineWO = async (woId) => {
    setAcknowledging(woId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.rpc('decline_work_order_assignment', {
        p_work_order_id: woId, p_mechanic_user_id: user.id, p_decline_reason: declineReason || null,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      setShowDeclineForm(null); setDeclineReason('')
      await load(true)
    } catch (e) { alert(e.message) }
    finally { setAcknowledging(null) }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const permsFor = (wo) => {
    const pid = wo.provider?.id || wo.service_provider_id
    return userPerms[pid] || { role: wo.role, can_send_estimates: !!wo.can_send_estimates, can_send_invoice: !!wo.can_send_invoice }
  }

  const withAction = workOrders.filter(wo => {
    const p = permsFor(wo)
    return getActionNeeded(wo, p.role, p.can_send_estimates, p.can_send_invoice) !== null
  })

  const activeOrders   = workOrders.filter(w => !w.status?.is_terminal)
  const terminalOrders = workOrders.filter(w =>  w.status?.is_terminal)

  const filtered = (() => {
    const byStatus = filter === 'action'
      ? withAction
      : filter === 'all'
      ? workOrders
      : filter === 'active'
      ? activeOrders
      : filter === 'history'
      ? terminalOrders
      : workOrders.filter(w => w.status?.code === filter)

    if (!search.trim()) return byStatus
    const q = search.toLowerCase()
    return byStatus.filter(w =>
      w.work_order_number?.toLowerCase().includes(q)
      || w.vehicle?.plate_number?.toLowerCase().includes(q)
      || w.vehicle?.make?.toLowerCase().includes(q)
      || w.vehicle?.model?.toLowerCase().includes(q)
      || w.provider?.name?.toLowerCase().includes(q)
    )
  })()

  // ── Grouped by provider ───────────────────────────────────────────────────
  const grouped = filtered.reduce((acc, wo) => {
    const key = wo.provider?.name || 'Unknown Garage'
    if (!acc[key]) acc[key] = []
    acc[key].push(wo)
    return acc
  }, {})

  const actionCount = withAction.length

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Active work orders across your service provider memberships
          </p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex-shrink-0">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ── Estimate approved banner ── */}
      {estimateApprovedCount > 0 && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {estimateApprovedCount} estimate{estimateApprovedCount > 1 ? 's' : ''} approved — ready to start work
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Customer{estimateApprovedCount > 1 ? 's have' : ' has'} approved the estimate.
              Look for the <span className="font-semibold text-green-700">Estimate Approved</span> badge and begin the service work.
            </p>
          </div>
        </div>
      )}

      {/* ── Checkout request action banner ── */}
      {checkoutRequestCount > 0 && (
        <div className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BellRing size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {checkoutRequestCount} work order{checkoutRequestCount > 1 ? 's' : ''} awaiting checkout submission
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Customer{checkoutRequestCount > 1 ? 's have' : ' has'} received the invoice and requested the checkout form before making payment.
              Open the work order and complete the <span className="font-semibold text-blue-700">Checkout tab</span>.
            </p>
          </div>
        </div>
      )}

      {/* ── Checkout declined banner ── */}
      {checkoutDeclinedCount > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ClipboardCheck size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {checkoutDeclinedCount} checkout{checkoutDeclinedCount > 1 ? 's' : ''} declined by customer
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              The customer was not satisfied with the checkout. Look for the <span className="font-semibold text-red-700">Checkout Declined</span> badge,
              open the work order, review the reason and resubmit the <span className="font-semibold text-red-700">Checkout tab</span>.
            </p>
          </div>
        </div>
      )}

      {/* Summary + filter bar */}
      {workOrders.length > 0 && (
        <div className="space-y-2">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by WO number, plate, make or garage…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Action pill + counts + filter dropdown */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Action-needed pill */}
            {actionCount > 0 && (
              <button
                onClick={() => setFilter('action')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  filter === 'action'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                }`}>
                <AlertTriangle size={13} />
                {actionCount} need{actionCount === 1 ? 's' : ''} action
              </button>
            )}

            <span className="text-sm text-gray-400">{activeOrders.length} active · {terminalOrders.length} closed</span>

            {/* Filter dropdown */}
            <div className="relative ml-auto">
              <button
                onClick={() => setShowFilter(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Filter size={13} />
                {FILTER_OPTIONS.find(f => f.value === filter)?.label || 'Filter'}
                <ChevronDown size={13} />
              </button>
              {showFilter && (
                <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                  {FILTER_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => { setFilter(opt.value); setShowFilter(false) }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${filter === opt.value ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {workOrders.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ClipboardList className="mx-auto text-gray-300 mb-3" size={48} />
          <p className="font-semibold text-gray-600">No active work orders</p>
          <p className="text-sm text-gray-400 mt-1">Work orders from your service provider(s) will appear here.</p>
        </div>
      )}

      {/* Filtered empty */}
      {workOrders.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <CheckCircle className="mx-auto text-gray-300 mb-3" size={36} />
          <p className="font-semibold text-gray-600">
            {filter === 'action' ? 'No pending actions — all caught up!'
              : search ? 'No work orders match your search or filter.'
              : 'No work orders match this filter.'}
          </p>
          <button onClick={() => { setSearch(''); setFilter('all') }} className="mt-3 text-sm text-blue-600 hover:underline">
            Clear search &amp; filter
          </button>
        </div>
      )}

      {/* Work orders grouped by provider */}
      {Object.entries(grouped).map(([providerName, wos]) => {
        const provActionCount = wos.filter(wo => {
          const p = permsFor(wo)
          return getActionNeeded(wo, p.role, p.can_send_estimates, p.can_send_invoice) !== null
        }).length

        return (
          <div key={providerName}>
            {/* Provider group header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-green-600 rounded-md flex items-center justify-center flex-shrink-0">
                <Wrench size={12} className="text-white" />
              </div>
              <h2 className="text-sm font-semibold text-gray-700">{providerName}</h2>
              <span className="text-xs text-gray-400">({wos.length})</span>
              {provActionCount > 0 && (
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                  {provActionCount} action{provActionCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="space-y-3">
              {wos.map(wo => {
                const p          = permsFor(wo)
                const action     = getActionNeeded(wo, p.role, p.can_send_estimates, p.can_send_invoice)
                const assignBadge = ASSIGN_BADGE[wo.mechanic_assignment_status]
                const isPending   = wo.mechanic_assignment_status === 'pending'
                const isActioning = acknowledging === wo.id
                const ActionIcon  = action?.icon

                return (
                  <div key={wo.id}
                    className={`bg-white rounded-xl border shadow-sm overflow-hidden ${action?.urgent ? 'border-l-4 border-l-violet-500 border-gray-200' : 'border-gray-200'}`}>

                    {/* Action banner — shown when there's something to do */}
                    {action && (
                      <div className={`px-4 py-2 flex items-center gap-2 text-xs font-semibold border-b ${action.color}`}>
                        {ActionIcon && <ActionIcon size={13} />}
                        {action.label}
                        <span className="ml-auto text-xs font-normal opacity-70">
                          Open to take action →
                        </span>
                      </div>
                    )}

                    <div className="p-4">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-900">{wo.work_order_number}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[wo.status?.code] || 'bg-gray-100 text-gray-600'}`}>
                              {wo.status?.display_name}
                            </span>
                            {assignBadge && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${assignBadge.cls}`}>
                                {assignBadge.label}
                              </span>
                            )}
                            {wo.estimate_approved && wo.status?.code === 'approved' && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                                <CheckCircle size={10} /> Estimate Approved
                              </span>
                            )}
                            {wo.checkout_requested && !wo.checkout_request_satisfied && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                                <BellRing size={10} /> Checkout Requested
                              </span>
                            )}
                            {wo.checkout_declined && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                                <ClipboardCheck size={10} /> Checkout Declined
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-600">
                            <Car size={13} className="flex-shrink-0" />
                            <span className="font-medium">{wo.vehicle?.plate_number}</span>
                            {wo.vehicle?.make && (
                              <span className="text-gray-400">· {wo.vehicle.make} {wo.vehicle.model || ''}</span>
                            )}
                          </div>
                          {wo.problem_description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">
                              "{wo.problem_description}"
                            </p>
                          )}
                        </div>

                        {/* Role/perms badge */}
                        <div className="flex-shrink-0 text-right">
                          {p.role && (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">
                              {p.role.replace(/_/g, ' ')}
                            </span>
                          )}
                          {p.can_send_invoice && (
                            <div className="mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                Invoice
                              </span>
                            </div>
                          )}
                          {p.can_send_estimates && !['service_provider_owner','admin','accountant'].includes(p.role) && (
                            <div className="mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded">
                                Estimates
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      {wo.total_amount > 0 && (
                        <div className="flex items-center gap-1.5 mb-3 text-sm text-gray-600">
                          <Receipt size={13} />
                          <span>KES {Number(wo.total_amount).toLocaleString()}</span>
                        </div>
                      )}

                      {/* Decline form */}
                      {showDeclineForm === wo.id && (
                        <div className="mb-3 space-y-2">
                          <textarea
                            value={declineReason}
                            onChange={e => setDeclineReason(e.target.value)}
                            placeholder="Reason for declining (optional)..."
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-300"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => declineWO(wo.id)} disabled={isActioning}
                              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                              {isActioning ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                              Confirm Decline
                            </button>
                            <button onClick={() => { setShowDeclineForm(null); setDeclineReason('') }}
                              className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action row */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(wo.opened_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>

                        <div className="flex gap-2 flex-wrap">
                          {/* Primary: always show Open */}
                          <button
                            onClick={() => router.push(`/dashboard/my-teams/work-order/${wo.id}`)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                              action?.urgent
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}>
                            {action ? 'Open & take action' : (wo.mechanic_assignment_status === 'acknowledged' ? 'Open work order' : 'View details')}
                          </button>

                          {/* Pending mechanic assignment: acknowledge / decline */}
                          {isPending && showDeclineForm !== wo.id && (
                            <>
                              <button onClick={() => acknowledgeWO(wo.id)} disabled={isActioning}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
                                {isActioning ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                Acknowledge
                              </button>
                              <button onClick={() => setShowDeclineForm(wo.id)}
                                className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
                                Decline
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}