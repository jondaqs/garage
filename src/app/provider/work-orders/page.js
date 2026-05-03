'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus,
  ClipboardList, Search, Filter, ChevronRight,
  Car, Calendar, AlertCircle, Clock, BellRing, ClipboardCheck, CheckCircle
} from 'lucide-react'

const STATUS_COLORS = {
  intake:            'bg-gray-100 text-gray-700',
  assigned:          'bg-blue-100 text-blue-700',
  diagnosing:        'bg-purple-100 text-purple-700',
  awaiting_approval: 'bg-yellow-100 text-yellow-700',
  approved:          'bg-cyan-100 text-cyan-700',
  in_progress:       'bg-orange-100 text-orange-700',
  quality_check:     'bg-indigo-100 text-indigo-700',
  rework:            'bg-red-100 text-red-700',
  completed:         'bg-green-100 text-green-700',
  cancelled:         'bg-red-100 text-red-600',
  closed:            'bg-gray-100 text-gray-500',
}

const FILTER_OPTIONS = [
  { label: 'All',             value: 'all' },
  { label: 'Intake',          value: 'intake' },
  { label: 'In Progress',     value: 'in_progress' },
  { label: 'Awaiting Approval', value: 'awaiting_approval' },
  { label: 'Quality Check',   value: 'quality_check' },
  { label: 'Completed',       value: 'completed' },
  { label: 'Closed',          value: 'closed' },
]

export default function ProviderWorkOrdersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [workOrders, setWorkOrders]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [checkoutRequestCount,  setCheckoutRequestCount]  = useState(0)
  const [checkoutDeclinedCount, setCheckoutDeclinedCount] = useState(0)
  const [estimateApprovedCount, setEstimateApprovedCount] = useState(0)

  useEffect(() => { loadWorkOrders() }, [])

  const loadWorkOrders = async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { data: provider } = await supabase
        .from('service_providers').select('id').eq('owner_user_id', profile.id).single()

      if (!provider) { setError('No service provider found'); return }

      const { data, error: fetchErr } = await supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          priority,
          opened_at,
          scheduled_start,
          checkout_requested,
          checkout_request_satisfied,
          checkout_declined,
          estimate_approved,
          vehicle:vehicles(plate_number, make, model),
          status:work_order_statuses(code, display_name, sort_order),
          shop:shops(name, town),
          mechanic:mechanics(user:user_profiles(first_name, last_name)),
          booking:bookings!booking_id(booking_number)
        `)
        .eq('service_provider_id', provider.id)
        .order('opened_at', { ascending: false })

      if (fetchErr) throw fetchErr
      setWorkOrders(data || [])
      setCheckoutRequestCount(
        (data || []).filter(w => w.checkout_requested && !w.checkout_request_satisfied).length
      )
      setCheckoutDeclinedCount(
        (data || []).filter(w => w.checkout_declined).length
      )
      setEstimateApprovedCount(
        (data || []).filter(w => w.estimate_approved && w.status?.code === 'approved').length
      )
    } catch (err) {
      setError(err.message || 'Failed to load work orders')
    } finally {
      setLoading(false)
    }
  }

  const filtered = workOrders.filter((wo) => {
    const matchStatus = statusFilter === 'all' || wo.status?.code === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q
      || wo.work_order_number?.toLowerCase().includes(q)
      || wo.vehicle?.plate_number?.toLowerCase().includes(q)
      || wo.vehicle?.make?.toLowerCase().includes(q)
      || wo.vehicle?.model?.toLowerCase().includes(q)
      || wo.booking?.booking_number?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

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
        <button
          onClick={() => router.push('/provider/work-orders/new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex-shrink-0"
        >
          <Plus size={18} /> New Walk-In Work Order
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* ── Estimate approved banner ── */}
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
              Customer{estimateApprovedCount > 1 ? 's have' : ' has'} approved the estimate.
              Look for the <span className="font-semibold text-green-700">Estimate Approved</span> badge and begin the service work.
            </p>
          </div>
        </div>
      )}

      {/* ── Checkout request action banner ── */}
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
              Customer{checkoutRequestCount > 1 ? 's have' : ' has'} received the invoice and requested the checkout form before making payment.
              Look for the <span className="font-semibold text-blue-700">Checkout Requested</span> badge below and open the work order to complete the checkout tab.
            </p>
          </div>
        </div>
      )}

      {/* ── Checkout declined banner ── */}
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
              The customer was not satisfied with the checkout. Look for the <span className="font-semibold text-red-700">Checkout Declined</span> badge,
              open the work order, review the reason and resubmit the checkout form.
            </p>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by WO number, plate, vehicle..."
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
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <ClipboardList className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No work orders found</h3>
          <p className="text-gray-500 text-sm">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Work orders are created when you accept a booking.'}
          </p>
          {!search && statusFilter === 'all' && (
            <button
              onClick={() => router.push('/provider/bookings')}
              className="mt-4 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              View Bookings
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((wo) => (
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
                      <span className="text-xs text-gray-400">
                        · Booking #{wo.booking.booking_number}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_COLORS[wo.status?.code] || 'bg-gray-100 text-gray-600'
                    }`}>
                      {wo.status?.display_name || 'Unknown'}
                    </span>
                    {wo.priority === 'urgent' && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                        URGENT
                      </span>
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
                      {wo.vehicle?.make && (
                        <span>{wo.vehicle.make} {wo.vehicle.model}</span>
                      )}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                    {wo.shop && (
                      <span>{wo.shop.name}{wo.shop.town ? ` · ${wo.shop.town}` : ''}</span>
                    )}
                    {wo.mechanic?.user && (
                      <span>
                        Mechanic: {wo.mechanic.user.first_name} {wo.mechanic.user.last_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {wo.scheduled_start
                        ? new Date(wo.scheduled_start).toLocaleDateString('en-KE', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })
                        : new Date(wo.opened_at).toLocaleDateString('en-KE', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })
                      }
                    </span>
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