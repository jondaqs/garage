'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus,
  ClipboardList, Search, Filter, ChevronRight, ChevronLeft,
  Car, Calendar, AlertCircle, Clock, BellRing, ClipboardCheck, CheckCircle, Store
} from 'lucide-react'
import useProviderAccess from '@/hooks/useProviderAccess'
import WriteGate from '@/components/WriteGate'
import ProviderAccessBanner from '@/components/ProviderAccessBanner'

const STATUS_COLORS = {
  intake:            'bg-gray-100 text-gray-700',
  assigned:          'bg-blue-100 text-blue-700',
  diagnosing:        'bg-purple-100 text-purple-700',
  services_estimates:'bg-blue-100 text-blue-700',
  internal_review:   'bg-violet-100 text-violet-700',
  awaiting_approval: 'bg-yellow-100 text-yellow-700',
  approved:          'bg-cyan-100 text-cyan-700',
  in_progress:       'bg-orange-100 text-orange-700',
  quality_check:     'bg-indigo-100 text-indigo-700',
  rework:            'bg-red-100 text-red-700',
  completed:         'bg-green-100 text-green-700',
  cancelled:         'bg-red-100 text-red-600',
  closed:            'bg-gray-100 text-gray-500',
  invoiced:          'bg-teal-100 text-teal-700',
  awaiting_customer_checkout: 'bg-purple-100 text-purple-700',
  checked_in:        'bg-sky-100 text-sky-700',
}

const ACTIVE_STATUSES = new Set([
  'intake', 'awaiting_approval', 'approved', 'diagnosing', 'assigned',
  'in_progress', 'rework', 'quality_check', 'completed', 'awaiting_customer_checkout',
  'services_estimates', 'internal_review', 'invoiced', 'checked_in',
])

const FILTER_OPTIONS = [
  { label: 'All',               value: 'all' },
  { label: 'Intake',            value: 'intake' },
  { label: 'In Progress',       value: 'active' },
  { label: 'Awaiting Approval', value: 'awaiting_approval' },
  { label: 'Quality Check',     value: 'quality_check' },
  { label: 'Completed',         value: 'completed' },
  { label: 'Closed',            value: 'closed' },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function ProviderWorkOrdersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [workOrders, setWorkOrders]   = useState([])
  const providerAccess = useProviderAccess()
  const [customerMap, setCustomerMap] = useState({}) // wo.id → customer name
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(25)
  const [checkoutRequestCount,  setCheckoutRequestCount]  = useState(0)
  const [checkoutDeclinedCount, setCheckoutDeclinedCount] = useState(0)
  const [estimateApprovedCount, setEstimateApprovedCount] = useState(0)

  useEffect(() => { loadWorkOrders() }, [])
  useEffect(() => { setPage(1) }, [search, statusFilter, dateFrom, dateTo, pageSize])

  const loadWorkOrders = async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
      const { data: provider } = await supabase
        .from('service_providers_secure').select('id').eq('owner_user_id', profile.id).single()

      if (!provider) { setError('No service provider found'); return }

      const { data, error: fetchErr } = await supabase
        .from('work_orders_secure')
        .select(`
          id, work_order_number, priority, opened_at, scheduled_start,
          checkout_requested, checkout_request_satisfied, checkout_declined, estimate_approved,
          walk_in_owner_name, walk_in_owner_phone, walk_in_owner_email, is_walk_in,
          vehicle:vehicles_secure(plate_number, make, model),
          status:work_order_statuses(code, display_name, sort_order),
          shop:shops_secure(name, town),
          mechanic:mechanics(user:user_profiles_secure(first_name, last_name)),
          booking:bookings_secure!booking_id(booking_number)
        `)
        .eq('service_provider_id', provider.id)
        .order('opened_at', { ascending: false })

      if (fetchErr) throw fetchErr
      setWorkOrders(data || [])
      // Debug: log first few WOs with their walk-in fields
      setCheckoutRequestCount((data || []).filter(w => w.checkout_requested && !w.checkout_request_satisfied).length)
      setCheckoutDeclinedCount((data || []).filter(w => w.checkout_declined).length)
      setEstimateApprovedCount((data || []).filter(w => w.estimate_approved && w.status?.code === 'approved').length)

      // Fetch customer names via RPC (bypasses vehicle_ownership RLS)
      const { data: custResult } = await supabase.rpc('get_provider_wo_customers', {
        p_provider_id: provider.id,
      })
      if (custResult?.success && Array.isArray(custResult.customers)) {
        const map = {}
        custResult.customers.forEach(c => {
          if (c.work_order_id && c.customer_name) {
            map[c.work_order_id] = c.customer_name
          }
        })
        setCustomerMap(map)
      } else {
      }
    } catch (err) {
      setError(err.message || 'Failed to load work orders')
    } finally {
      setLoading(false)
    }
  }

  const getCustomerName = (wo) => {
    const fromMap = customerMap[wo.id]
    const result = fromMap || wo.walk_in_owner_name || wo.walk_in_owner_phone || wo.walk_in_owner_email || ''
    if (!result) {
    }
    return result
  }

  const filtered = useMemo(() => {
    return workOrders.filter((wo) => {
      const code = wo.status?.code
      const matchStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? ACTIVE_STATUSES.has(code) : code === statusFilter)

      // Date filter
      if (dateFrom) {
        const woDate = (wo.opened_at || '').slice(0, 10)
        if (woDate < dateFrom) return false
      }
      if (dateTo) {
        const woDate = (wo.opened_at || '').slice(0, 10)
        if (woDate > dateTo) return false
      }

      const q = search.toLowerCase()
      const custName = getCustomerName(wo).toLowerCase()
      const matchSearch = !q
        || wo.work_order_number?.toLowerCase().includes(q)
        || wo.vehicle?.plate_number?.toLowerCase().includes(q)
        || wo.vehicle?.make?.toLowerCase().includes(q)
        || wo.vehicle?.model?.toLowerCase().includes(q)
        || wo.booking?.booking_number?.toLowerCase().includes(q)
        || wo.shop?.name?.toLowerCase().includes(q)
        || custName.includes(q)
      return matchStatus && matchSearch
    })
  }, [workOrders, customerMap, search, statusFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)

  const activeCount = workOrders.filter(wo =>
    !['completed', 'cancelled', 'closed'].includes(wo.status?.code)
  ).length

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-green-600" />
            Work Orders
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {workOrders.length} total · {activeCount} active
          </p>
        </div>
        <WriteGate canWrite={providerAccess.canWrite} state={providerAccess.state}>
        <button
          onClick={() => router.push('/provider/work-orders/new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex-shrink-0"
        >
          <Plus size={18} /> New Walk-In Work Order
        </button>
        </WriteGate>
      </div>

      {!providerAccess.loading && <ProviderAccessBanner {...providerAccess} />}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Banners */}
      {estimateApprovedCount > 0 && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {estimateApprovedCount} estimate{estimateApprovedCount > 1 ? 's' : ''} approved — ready to start work
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Look for the <span className="font-semibold text-green-700">Estimate Approved</span> badge below.
            </p>
          </div>
        </div>
      )}

      {checkoutRequestCount > 0 && (
        <div className="mb-4 rounded-xl border border-blue-300 bg-blue-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BellRing size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {checkoutRequestCount} work order{checkoutRequestCount > 1 ? 's' : ''} awaiting checkout submission
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Look for the <span className="font-semibold text-blue-700">Checkout Requested</span> badge.
            </p>
          </div>
        </div>
      )}

      {checkoutDeclinedCount > 0 && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ClipboardCheck size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {checkoutDeclinedCount} checkout{checkoutDeclinedCount > 1 ? 's' : ''} declined by customer
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Look for the <span className="font-semibold text-red-700">Checkout Declined</span> badge.
            </p>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search WO#, plate, vehicle, shop, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm appearance-none bg-white"
          >
            {FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 flex-shrink-0">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
          <label className="text-xs text-gray-500 flex-shrink-0">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">✕</button>
          )}
        </div>
      </div>

      {/* Results count */}
      {(search || statusFilter !== 'all' || dateFrom || dateTo) && (
        <p className="text-xs text-gray-400 mb-3">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <ClipboardList className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No work orders found</h3>
          <p className="text-gray-500 text-sm">
            {search || statusFilter !== 'all' || dateFrom || dateTo
              ? 'Try adjusting your search or filters.'
              : 'Work orders are created when you accept a booking.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((wo) => {
              const custName = getCustomerName(wo)
              return (
                <button
                  key={wo.id}
                  onClick={() => router.push(`/provider/work-orders/${wo.id}`)}
                  className="w-full bg-white rounded-lg shadow-sm p-5 text-left hover:shadow-md transition-shadow border border-transparent hover:border-green-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Top row */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-900 text-sm">
                          {wo.work_order_number || 'WO-' + wo.id.slice(0, 8).toUpperCase()}
                        </span>
                        {wo.booking?.booking_number && (
                          <span className="text-xs text-gray-400">· Booking #{wo.booking.booking_number}</span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[wo.status?.code] || 'bg-gray-100 text-gray-600'
                        }`}>
                          {wo.status?.display_name || 'Unknown'}
                        </span>
                        {wo.priority === 'urgent' && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">URGENT</span>
                        )}
                        {wo.estimate_approved && wo.status?.code === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                            <CheckCircle size={10} /> Estimate Approved
                          </span>
                        )}
                        {wo.checkout_requested && !wo.checkout_request_satisfied && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                            <BellRing size={10} /> Checkout Requested
                          </span>
                        )}
                        {wo.checkout_declined && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                            <ClipboardCheck size={10} /> Checkout Declined
                          </span>
                        )}
                      </div>

                      {/* Vehicle */}
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1.5">
                          <Car size={14} className="text-gray-400" />
                          <strong className="text-gray-900">{wo.vehicle?.plate_number}</strong>
                          {wo.vehicle?.make && <span>{wo.vehicle.make} {wo.vehicle.model}</span>}
                        </span>
                      </div>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                        {wo.shop && (
                          <span className="flex items-center gap-1">
                            <Store size={11} className="text-gray-400" />
                            {wo.shop.name}{wo.shop.town ? ` · ${wo.shop.town}` : ''}
                          </span>
                        )}
                        {custName && (
                          <span className="text-gray-600">
                            Customer: <span className="font-medium text-gray-700">{custName}</span>
                          </span>
                        )}
                        {wo.mechanic?.user && (
                          <span>Mechanic: {wo.mechanic.user.first_name} {wo.mechanic.user.last_name}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(wo.opened_at).toLocaleDateString('en-KE', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    <ChevronRight className="text-gray-400 flex-shrink-0 mt-1" size={18} />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4 bg-white rounded-lg shadow-sm px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Show</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>per page</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p
                  if (totalPages <= 7) { p = i + 1 }
                  else if (page <= 4) { p = i + 1 }
                  else if (page >= totalPages - 3) { p = totalPages - 6 + i }
                  else { p = page - 3 + i }
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded text-sm font-medium ${
                        p === page ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}>{p}</button>
                  )
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-400">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}