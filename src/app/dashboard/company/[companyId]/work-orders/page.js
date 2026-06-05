'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ClipboardList, Car, ChevronRight, AlertCircle,
  Loader2, Bell, Search, Building2, ClipboardCheck, CreditCard
} from 'lucide-react'

const STATUS_STYLES = {
  intake:            'bg-gray-100 text-gray-600',
  assigned:          'bg-blue-100 text-blue-700',
  diagnosing:        'bg-purple-100 text-purple-700',
  awaiting_approval: 'bg-yellow-100 text-yellow-800 font-semibold',
  approved:          'bg-cyan-100 text-cyan-700',
  in_progress:       'bg-orange-100 text-orange-700',
  quality_check:     'bg-indigo-100 text-indigo-700',
  rework:            'bg-red-100 text-red-700',
  completed:         'bg-green-100 text-green-700',
  cancelled:         'bg-gray-100 text-gray-400',
  closed:            'bg-gray-100 text-gray-400',
}

// ── "Needs action" predicates ─────────────────────────────────────────────
// Mirrors the predicates on the customer (/dashboard/work-orders) and
// company-portal (/company/work-orders) lists so company members see the
// same three customer-side action types: estimate approval, checkout-form
// review, and invoice payment.
const needsEstimateApproval = (wo) => wo.status?.code === 'awaiting_approval'
const needsCheckoutReview   = (wo) =>
  wo.checkout_requested && !wo.checkout_request_satisfied && !wo.checkout_declined
const needsPayment          = (wo) => {
  // PostgREST may return the one-to-one invoice as either an object or a
  // single-element array; normalise here so this stays robust either way.
  const inv = Array.isArray(wo.invoice) ? wo.invoice[0] : wo.invoice
  if (!inv) return false
  return ['sent', 'overdue'].includes(inv.status) && !inv.paid_at
}
const needsAnyAction = (wo) =>
  needsEstimateApproval(wo) || needsCheckoutReview(wo) || needsPayment(wo)

// The three virtual filter values that the load function must NOT translate
// into a server-side `status_id` query — they're predicate-based and resolved
// client-side after the rows arrive.
const VIRTUAL_FILTERS = new Set(['needs_action', 'checkout_pending', 'payment_pending'])

const FILTER_OPTIONS = [
  { value: 'all',               label: 'All'                       },
  { value: 'needs_action',      label: 'Needs Action'              },
  { value: 'awaiting_approval', label: 'Needs Approval'            },
  { value: 'checkout_pending',  label: 'Awaiting Checkout Review'  },
  { value: 'payment_pending',   label: 'Pending Payment'           },
  { value: 'in_progress',       label: 'In Progress'               },
  { value: 'diagnosing',        label: 'Diagnosing'                },
  { value: 'completed',         label: 'Completed'                 },
  { value: 'closed',            label: 'Closed'                    },
]

export default function CompanyDashboardWorkOrdersPage() {
  const { companyId } = useParams()
  const router        = useRouter()
  const supabase      = createClient()

  const [workOrders,  setWorkOrders]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [search,      setSearch]      = useState('')
  const [statusFilter,setFilter]      = useState('all')
  const [companyName, setCompanyName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
      if (!profile) return

      // Verify membership (owner or active member)
      const { data: owned } = await supabase
        .from('company_profiles_secure').select('id, name')
        .eq('id', companyId).eq('owner_user_id', profile.id).maybeSingle()

      const { data: mem } = await supabase
        .from('company_users').select('is_admin')
        .eq('user_id', profile.id).eq('company_id', companyId).eq('is_active', true).maybeSingle()

      if (!owned && !mem) { setError('Access denied — not a member of this company.'); setLoading(false); return }

      // Get company name
      if (owned?.name) {
        setCompanyName(owned.name)
      } else {
        const { data: co } = await supabase
          .from('company_profiles_secure').select('name').eq('id', companyId).maybeSingle()
        setCompanyName(co?.name || '')
      }

      // Get all fleet vehicle IDs
      const { data: fleet } = await supabase
        .from('vehicle_ownership').select('vehicle_id').eq('owner_company_id', companyId)
      const vehicleIds = fleet?.map(f => f.vehicle_id) || []
      if (vehicleIds.length === 0) { setWorkOrders([]); setLoading(false); return }

      // Build query
      let query = supabase
        .from('work_orders_secure')
        .select(`
          id, work_order_number, priority, opened_at, total_amount,
          estimate_sent_at, is_walk_in,
          checkout_requested, checkout_request_satisfied, checkout_declined,
          status:work_order_statuses(code, display_name),
          vehicle:vehicles_secure(plate_number, make, model),
          provider:service_providers_secure(name),
          invoice:invoices(status, paid_at, total_amount)
        `)
        .in('vehicle_id', vehicleIds)
        .order('opened_at', { ascending: false })

      // Server-side status filter only for real status codes. Virtual
      // filters (`needs_action`, `checkout_pending`, `payment_pending`)
      // are predicate-based and applied client-side after the rows arrive.
      if (statusFilter !== 'all' && !VIRTUAL_FILTERS.has(statusFilter)) {
        const { data: statusRow } = await supabase
          .from('work_order_statuses').select('id').eq('code', statusFilter).maybeSingle()
        if (statusRow) query = query.eq('status_id', statusRow.id)
      }

      const { data, error: fetchErr } = await query
      if (fetchErr) throw fetchErr
      setWorkOrders(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [companyId, statusFilter])

  useEffect(() => { load() }, [load])

  const fmt    = (n) => n ? `KES ${Number(n).toLocaleString('en-KE')}` : null
  const filtered = workOrders.filter(wo => {
    // Apply virtual filters client-side. Real status filters are already
    // applied at the server (see load()), so for those `matchStatus` only
    // needs to short-circuit on the search box.
    let matchStatus = true
    if (VIRTUAL_FILTERS.has(statusFilter)) {
      if (statusFilter === 'needs_action')     matchStatus = needsAnyAction(wo)
      else if (statusFilter === 'checkout_pending') matchStatus = needsCheckoutReview(wo)
      else if (statusFilter === 'payment_pending')  matchStatus = needsPayment(wo)
    }
    if (!matchStatus) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      wo.work_order_number?.toLowerCase().includes(q) ||
      wo.vehicle?.plate_number?.toLowerCase().includes(q) ||
      wo.vehicle?.make?.toLowerCase().includes(q) ||
      wo.vehicle?.model?.toLowerCase().includes(q) ||
      wo.provider?.name?.toLowerCase().includes(q)
    )
  })

  // Banner counts derive from the full workOrders set, not `filtered`, so
  // the banners reflect the real situation regardless of search/filter UI.
  const pendingApproval = workOrders.filter(needsEstimateApproval)
  const pendingCheckout = workOrders.filter(needsCheckoutReview)
  const pendingPayment  = workOrders.filter(needsPayment)
  const active          = workOrders.filter(wo => !['completed','cancelled','closed'].includes(wo.status?.code))

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-blue-600" />
            Fleet Work Orders
          </h1>
          {companyName && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <Building2 size={13} className="text-gray-400" />
              {companyName} · {workOrders.length} total · {active.length} active
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Pending approval banner */}
      {pendingApproval.length > 0 && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Bell className="text-yellow-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-semibold text-yellow-900 text-sm">
                {pendingApproval.length === 1
                  ? '1 estimate awaiting approval'
                  : `${pendingApproval.length} estimates awaiting approval`}
              </p>
              <p className="text-yellow-700 text-xs mt-0.5">
                Review and approve to authorise service work.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/dashboard/company/${companyId}/work-orders/${pendingApproval[0].id}`)}
            className="flex-shrink-0 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm font-semibold">
            Review Now
          </button>
        </div>
      )}

      {/* Pending checkout-acceptance banner. */}
      {pendingCheckout.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-300 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="text-blue-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-semibold text-blue-900 text-sm">
                {pendingCheckout.length === 1
                  ? '1 checkout form awaiting your review'
                  : `${pendingCheckout.length} checkout forms awaiting your review`}
              </p>
              <p className="text-blue-700 text-xs mt-0.5">
                Confirm the work was completed satisfactorily before payment is processed.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/dashboard/company/${companyId}/work-orders/${pendingCheckout[0].id}`)}
            className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold">
            Review Now
          </button>
        </div>
      )}

      {/* Pending payment banner. */}
      {pendingPayment.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CreditCard className="text-amber-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-semibold text-amber-900 text-sm">
                {pendingPayment.length === 1
                  ? '1 fleet invoice pending payment'
                  : `${pendingPayment.length} fleet invoices pending payment`}
              </p>
              <p className="text-amber-700 text-xs mt-0.5">
                Settle outstanding balances to close out fleet work orders.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/dashboard/company/${companyId}/work-orders/${pendingPayment[0].id}/invoice`)}
            className="flex-shrink-0 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-semibold">
            Pay Now
          </button>
        </div>
      )}

      {/* Search + filter bar — always visible so users can change filters
           even when the current filter yields zero results. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by vehicle, provider…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {FILTER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <ClipboardList className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {workOrders.length === 0 && statusFilter === 'all' && !search.trim()
              ? 'No work orders yet'
              : 'No matching work orders'}
          </h3>
          <p className="text-gray-500 text-sm">
            {workOrders.length === 0 && statusFilter === 'all' && !search.trim()
              ? 'Work orders appear here when a service provider accepts a fleet vehicle booking.'
              : 'Try selecting a different filter or adjusting your search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(wo => (
            <button
              key={wo.id}
              onClick={() => router.push(`/dashboard/company/${companyId}/work-orders/${wo.id}`)}
              className="w-full bg-white rounded-xl shadow-sm p-4 text-left hover:shadow-md transition-shadow border border-transparent hover:border-blue-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-semibold text-gray-900 text-sm">
                      {wo.work_order_number || 'WO-' + wo.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[wo.status?.code] || 'bg-gray-100 text-gray-500'}`}>
                      {wo.status?.display_name || wo.status?.code}
                    </span>
                    {wo.priority === 'urgent' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">URGENT</span>
                    )}
                    {wo.status?.code === 'awaiting_approval' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-900 font-bold animate-pulse">
                        Approve estimate
                      </span>
                    )}
                    {needsCheckoutReview(wo) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-900 font-bold animate-pulse">
                        Review checkout
                      </span>
                    )}
                    {needsPayment(wo) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold animate-pulse">
                        Payment due
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Car size={13} className="text-gray-400" />
                      <strong className="text-gray-900">{wo.vehicle?.plate_number}</strong>
                      {wo.vehicle?.make && (
                        <span className="text-gray-500">{wo.vehicle.make} {wo.vehicle.model}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
                    {wo.provider?.name && <span>{wo.provider.name}</span>}
                    <span>{new Date(wo.opened_at).toLocaleDateString('en-KE', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}</span>
                    {fmt(wo.total_amount) && (
                      <span className="text-blue-700 font-medium">{fmt(wo.total_amount)}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="text-gray-400 flex-shrink-0 mt-1" size={18} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}