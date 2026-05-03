'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ClipboardList, Car, ChevronRight, AlertCircle,
  Loader2, Bell, Search, Filter
} from 'lucide-react'

const ACTIVE_STATUSES = new Set([
  'intake', 'awaiting_approval', 'approved', 'diagnosing',
  'in_progress', 'rework', 'quality_check', 'completed', 'awaiting_customer_checkout',
])

const FILTER_OPTIONS = [
  { label: 'All',               value: 'all' },
  { label: 'In Progress',       value: 'active' },
  { label: 'Awaiting Approval', value: 'awaiting_approval' },
  { label: 'Quality Check',     value: 'quality_check' },
  { label: 'Completed',         value: 'completed' },
  { label: 'Closed',            value: 'closed' },
]

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

export default function CustomerWorkOrdersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [workOrders,    setWorkOrders]    = useState([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('all')

  useEffect(() => { loadWorkOrders() }, [])

  const loadWorkOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      // Get vehicles directly owned by this user (individual ownership)
      const { data: owned } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_user_id', profile.id)

      // Get fleet vehicles explicitly assigned to this user
      // (not all company vehicles — only ones assigned to this individual)
      const { data: assigned } = await supabase
        .from('company_vehicle_assignments')
        .select('vehicle_id')
        .eq('assigned_to_user_id', profile.id)
        .eq('is_active', true)

      const vehicleIds = [
        ...(owned    || []).map(v => v.vehicle_id),
        ...(assigned || []).map(v => v.vehicle_id),
      ]

      if (vehicleIds.length === 0) {
        setWorkOrders([])
        return
      }

      const { data, error: fetchErr } = await supabase
        .from('work_orders')
        .select(`
          id, work_order_number, priority, opened_at, total_amount,
          estimate_sent_at,
          status:work_order_statuses(code, display_name),
          vehicle:vehicles(plate_number, make, model),
          provider:service_providers(name)
        `)
        .in('vehicle_id', vehicleIds)
        .order('opened_at', { ascending: false })

      if (fetchErr) throw fetchErr
      setWorkOrders(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pendingApproval = workOrders.filter(wo => wo.status?.code === 'awaiting_approval')
  const active          = workOrders.filter(wo => !['completed','cancelled','closed'].includes(wo.status?.code))
  const fmt = (n) => n ? `KES ${Number(n).toLocaleString()}` : null

  const filtered = workOrders.filter(wo => {
    const code = wo.status?.code
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'active' ? ACTIVE_STATUSES.has(code) : code === statusFilter)
    const q = search.toLowerCase()
    const matchSearch = !q
      || wo.work_order_number?.toLowerCase().includes(q)
      || wo.vehicle?.plate_number?.toLowerCase().includes(q)
      || wo.vehicle?.make?.toLowerCase().includes(q)
      || wo.vehicle?.model?.toLowerCase().includes(q)
      || wo.provider?.name?.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-green-600" /> Work Orders
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {workOrders.length} total · {active.length} active
          </p>
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
                  ? '1 estimate awaiting your approval'
                  : `${pendingApproval.length} estimates awaiting your approval`}
              </p>
              <p className="text-yellow-700 text-xs mt-0.5">
                Please review and approve to authorise service work.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/dashboard/work-orders/${pendingApproval[0].id}`)}
            className="flex-shrink-0 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm font-semibold">
            Review Now
          </button>
        </div>
      )}

      {/* Search + filter bar */}
      {workOrders.length > 0 && (
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by WO number, plate, make or garage…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 appearance-none cursor-pointer"
            >
              {FILTER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {workOrders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <ClipboardList className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No work orders yet</h3>
          <p className="text-gray-500 text-sm">
            Work orders are created when a service provider accepts your booking.
          </p>
          <button onClick={() => router.push('/dashboard/bookings')}
            className="mt-4 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            My Bookings
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center">
          <ClipboardList className="mx-auto text-gray-300 mb-3" size={36} />
          <p className="text-gray-500 text-sm">No work orders match your search or filter.</p>
          <button onClick={() => { setSearch(''); setStatusFilter('all') }}
            className="mt-3 text-sm text-green-600 hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(wo => (
            <button key={wo.id}
              onClick={() => router.push(`/dashboard/work-orders/${wo.id}`)}
              className="w-full bg-white rounded-xl shadow-sm p-4 text-left hover:shadow-md transition-shadow border border-transparent hover:border-green-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="font-semibold text-gray-900 text-sm">
                      {wo.work_order_number || 'WO-' + wo.id.slice(0,8).toUpperCase()}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[wo.status?.code] || 'bg-gray-100 text-gray-500'}`}>
                      {wo.status?.display_name || wo.status?.code}
                    </span>
                    {wo.priority === 'urgent' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">URGENT</span>
                    )}
                    {wo.status?.code === 'awaiting_approval' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-900 font-bold animate-pulse">
                        Action needed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Car size={13} className="text-gray-400" />
                      <strong className="text-gray-900">{wo.vehicle?.plate_number}</strong>
                      {wo.vehicle?.make && <span className="text-gray-500">{wo.vehicle.make} {wo.vehicle.model}</span>}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
                    {wo.provider?.name && <span>{wo.provider.name}</span>}
                    <span>{new Date(wo.opened_at).toLocaleDateString('en-KE', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}</span>
                    {fmt(wo.total_amount) && (
                      <span className="text-green-700 font-medium">{fmt(wo.total_amount)}</span>
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