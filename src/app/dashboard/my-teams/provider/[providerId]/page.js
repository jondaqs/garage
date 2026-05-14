'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Building2, Users, Wrench, ClipboardList,
  Phone, Mail, MapPin, Shield, CheckCircle, AlertCircle,
  Loader2, Award, Calendar, CalendarDays, ChevronRight, FileText, Plus,
  Send, Receipt, AlertTriangle, RefreshCw, Car, Filter,
  Clock, ChevronDown, MessageSquare
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  intake: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  diagnosing: 'bg-purple-100 text-purple-700',
  services_estimates: 'bg-blue-100 text-blue-700',
  internal_review: 'bg-violet-100 text-violet-700',
  awaiting_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-cyan-100 text-cyan-700',
  in_progress: 'bg-orange-100 text-orange-700',
  quality_check: 'bg-indigo-100 text-indigo-700',
  rework: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
  closed: 'bg-gray-100 text-gray-500',
}

const WO_FILTER_OPTIONS = [
  { value: 'action', label: 'Needs action' },
  { value: 'all', label: 'All active' },
  { value: 'internal_review', label: 'Estimate review' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'completed', label: 'Completed' },
  { value: 'quality_check', label: 'Quality check' },
  { value: 'in_progress', label: 'In progress' },
]

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'work-orders', label: 'Work Orders' },
]

function getActionNeeded(wo, canSendEstimates, canSendInvoice) {
  const code = wo.status?.code
  if (code === 'internal_review' && canSendEstimates)
    return {
      label: 'Review & send estimate',
      icon: Send,
      color: 'bg-violet-100 text-violet-800 border-violet-300',
      urgent: true,
    }
  if ((code === 'completed' || code === 'quality_check') && canSendInvoice)
    return {
      label: code === 'completed' ? 'Generate & send invoice' : 'Invoice ready to generate',
      icon: FileText,
      color: 'bg-green-100 text-green-800 border-green-300',
      urgent: code === 'completed',
    }
  return null
}

// ── WorkOrdersPanel ───────────────────────────────────────────────────────────
function WorkOrdersPanel({ providerId, canSendEstimates, canSendInvoice, canApproveWork }) {
  const router = useRouter()
  const supabase = createClient()

  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('action')
  const [showFilter, setShowFilter] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc(
        'get_provider_member_work_orders', { p_user_id: user.id }
      )
      if (rpcErr) throw rpcErr
      const all = (result?.work_orders || []).filter(w => w.provider?.id === providerId)
      setWorkOrders(all)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [providerId])

  useEffect(() => { load() }, [load])

  const actionWOs = workOrders.filter(w =>
    getActionNeeded(w, canSendEstimates, canSendInvoice) !== null
  )
  const filtered = filter === 'action' ? actionWOs
    : filter === 'all' ? workOrders
      : workOrders.filter(w => w.status?.code === filter)

  if (loading) return (
    <div className="flex justify-center py-10">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {actionWOs.length > 0 && (
          <button
            onClick={() => setFilter('action')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filter === 'action'
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
          >
            <AlertTriangle size={13} />
            {actionWOs.length} need{actionWOs.length === 1 ? 's' : ''} action
          </button>
        )}
        <span className="text-xs text-gray-400">{workOrders.length} total</span>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowFilter(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <Filter size={13} />
              {WO_FILTER_OPTIONS.find(f => f.value === filter)?.label || 'Filter'}
              <ChevronDown size={13} />
            </button>
            {showFilter && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {WO_FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setFilter(opt.value); setShowFilter(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${filter === opt.value ? 'font-semibold text-blue-700 bg-blue-50' : 'text-gray-700'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* New Walk-In Work Order — only visible when member has WO access.
          Routes to the member-side walk-in flow (Phase 2). */}
          {canApproveWork && (
            <button
              onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}/work-orders/new`)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex-shrink-0"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">New Walk-In Work Order</span>
              <span className="sm:hidden">Walk-In</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Empty states */}
      {workOrders.length === 0 && (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-200">
          <ClipboardList className="mx-auto text-gray-300 mb-2" size={36} />
          <p className="text-sm font-medium text-gray-500">No active work orders</p>
          <p className="text-xs text-gray-400 mt-1">Work orders for this provider will appear here.</p>
        </div>
      )}

      {workOrders.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200">
          <CheckCircle className="mx-auto text-gray-300 mb-2" size={30} />
          <p className="text-sm font-medium text-gray-500">
            {filter === 'action' ? 'No pending actions — all caught up!' : 'No work orders match this filter'}
          </p>
          <button onClick={() => setFilter('all')} className="mt-2 text-xs text-blue-600 hover:underline">
            View all
          </button>
        </div>
      )}

      {/* WO cards */}
      <div className="space-y-3">
        {filtered.map(wo => {
          const action = getActionNeeded(wo, canSendEstimates, canSendInvoice)
          const ActionIcon = action?.icon
          return (
            <div
              key={wo.id}
              className={`bg-white rounded-xl border shadow-sm overflow-hidden ${action?.urgent ? 'border-l-4 border-l-violet-500 border-gray-200' : 'border-gray-200'
                }`}
            >
              {action && (
                <div className={`px-4 py-2 flex items-center gap-2 text-xs font-semibold border-b ${action.color}`}>
                  {ActionIcon && <ActionIcon size={13} />}
                  {action.label}
                  <span className="ml-auto opacity-60">Open to act →</span>
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900 text-sm">{wo.work_order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[wo.status?.code] || 'bg-gray-100 text-gray-600'}`}>
                        {wo.status?.display_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-600">
                      <Car size={12} className="flex-shrink-0" />
                      <span className="font-medium">{wo.vehicle?.plate_number}</span>
                      {wo.vehicle?.make && (
                        <span className="text-gray-400 text-xs">· {wo.vehicle.make} {wo.vehicle.model || ''}</span>
                      )}
                    </div>
                    {wo.problem_description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">"{wo.problem_description}"</p>
                    )}
                  </div>
                  {wo.total_amount > 0 && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">Est. total</p>
                      <p className="text-sm font-semibold text-gray-900">KES {Number(wo.total_amount).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock size={11} />
                    {new Date(wo.opened_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => router.push(`/dashboard/my-teams/work-order/${wo.id}`)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${action?.urgent
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    {action ? 'Open & act' : 'View'}
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProviderOverviewPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  const load = useCallback(async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()

      // ── 1. Profile ────────────────────────────────────────────────────────
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single()
      if (!profile) throw new Error('Profile not found')

      // ── 2. SPU membership ─────────────────────────────────────────────────
      const { data: spuRow, error: spuErr } = await supabase
        .from('service_provider_users')
        .select('id, role, is_verified, is_active, joined_at, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice, can_chat')
        .eq('user_id', profile.id)
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)
        .maybeSingle()
      if (spuErr) throw spuErr
      if (!spuRow) throw new Error('You are not a member of this service provider.')

      // ── 3. Mechanic record ────────────────────────────────────────────────
      const { data: mechanic } = await supabase
        .from('mechanics')
        .select('id, role, specialization, experience_years, is_verified, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice, can_chat')
        .eq('user_id', profile.id)
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)
        .maybeSingle()

      const memberRecord = {
        created_at: spuRow.joined_at,
        ...spuRow,
        mechanic_id: mechanic?.id || null,
        specialization: mechanic?.specialization || null,
        experience_years: mechanic?.experience_years || null,
        can_approve_work: !!(spuRow.can_approve_work || mechanic?.can_approve_work),
        can_manage_inventory: !!(spuRow.can_manage_inventory || mechanic?.can_manage_inventory),
        can_manage_team: !!(spuRow.can_manage_team || mechanic?.can_manage_team),
        can_send_estimates: !!(spuRow.can_send_estimates || mechanic?.can_send_estimates),
        can_send_invoice: !!(spuRow.can_send_invoice || mechanic?.can_send_invoice),
        can_chat: !!(spuRow.can_chat || mechanic?.can_chat),
        is_verified: !!(spuRow.is_verified || mechanic?.is_verified),
      }

      // ── 4. Provider details ───────────────────────────────────────────────
      const { data: provider, error: provErr } = await supabase
        .from('service_providers')
        .select('id, name, phone, email, description, years_in_operation, is_verified, status, owner_user_id')
        .eq('id', params.providerId)
        .single()
      if (provErr) throw provErr

      // ── 5. Team count ─────────────────────────────────────────────────────
      const { count: teamCount } = await supabase
        .from('service_provider_users')
        .select('id', { count: 'exact', head: true })
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)

      // ── 6. Owner name ─────────────────────────────────────────────────────
      let ownerName = 'Unknown'
      if (provider.owner_user_id) {
        const { data: op } = await supabase
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('id', provider.owner_user_id)
          .maybeSingle()
        if (op) ownerName = `${op.first_name || ''} ${op.last_name || ''}`.trim() || 'Unknown'
      }

      // ── 7. Assigned WOs (mechanic self) ───────────────────────────────────
      const { data: woResult } = await supabase.rpc(
        'get_mechanic_assigned_work_orders', { p_mechanic_user_id: user.id }
      )
      const assignedWOs = woResult?.work_orders || []
      const pendingWOs = assignedWOs.filter(w => w.mechanic_assignment_status === 'pending')
      const activeWOs = assignedWOs.filter(w => w.mechanic_assignment_status === 'acknowledged')

      // ── 8. Provider-wide WOs (admin/accountant/can_send) ──────────────────
      const isAdminRole = ['service_provider_owner', 'admin', 'accountant'].includes(spuRow.role)
      const canSendEst = memberRecord.can_send_estimates || isAdminRole
      const canSendInv = memberRecord.can_send_invoice || isAdminRole
      let allProviderWOs = []
      if (isAdminRole || canSendEst || canSendInv) {
        const { data: spuWOs } = await supabase.rpc(
          'get_provider_member_work_orders', { p_user_id: user.id }
        )
        allProviderWOs = (spuWOs?.work_orders || []).filter(w => w.provider?.id === params.providerId)
      }

      const reviewWOs = allProviderWOs.filter(w => w.status?.code === 'internal_review')
      const invoiceWOs = allProviderWOs.filter(w => ['completed', 'quality_check'].includes(w.status?.code))
      const actionCount = allProviderWOs.filter(w => getActionNeeded(w, canSendEst, canSendInv) !== null).length

      // ── 9. Shops ──────────────────────────────────────────────────────────
      const { data: shops } = await supabase
        .from('shops')
        .select('id, name, town, county, street, phone')
        .eq('service_provider_id', params.providerId)
        .eq('is_active', true)
        .limit(3)

      // ── 10. Calendar counters (today / next 7 days, live statuses) ───────
      // Bookings RLS already permits this member to read their provider's
      // bookings, so a single client-side query is enough.
      let calendarTodayCount = 0
      let calendarUpcomingCount = 0
      try {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const in7 = new Date(today)
        in7.setDate(in7.getDate() + 7)
        const todayStr = today.toISOString().slice(0, 10)
        const in7Str = in7.toISOString().slice(0, 10)

        const { data: liveStatuses } = await supabase
          .from('booking_statuses').select('id, code')
          .in('code', ['pending', 'confirmed', 'in_progress'])
        const liveIds = (liveStatuses || []).map(s => s.id)

        if (liveIds.length > 0) {
          const { data: liveBookings } = await supabase
            .from('bookings')
            .select('id, booking_date')
            .eq('service_provider_id', params.providerId)
            .in('status_id', liveIds)
            .gte('booking_date', todayStr)
            .lte('booking_date', in7Str)

          calendarUpcomingCount = (liveBookings || []).length
          calendarTodayCount = (liveBookings || [])
            .filter(b => b.booking_date === todayStr).length
        }
      } catch (e) {
        console.warn('Calendar counters load failed (non-fatal):', e.message)
      }

      setData({
        provider,
        mechanic: memberRecord,
        ownerName,
        teamCount: teamCount || 0,
        assignedWOs,
        pendingWOs,
        activeWOs,
        allProviderWOs,
        reviewWOs,
        invoiceWOs,
        actionCount,
        isAdminRole,
        canSendEst,
        canSendInv,
        shops: shops || [],
        calendarTodayCount,
        calendarUpcomingCount,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [params.providerId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  if (error) return (
    <div className="max-w-2xl mx-auto p-6">
      <button
        onClick={() => router.push('/dashboard/my-teams')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm"
      >
        <ArrowLeft size={16} /> Back to My Teams
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
        <div>
          <p className="font-semibold text-red-900">Access denied</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
    </div>
  )

  const {
    provider, mechanic, ownerName, teamCount,
    pendingWOs, activeWOs, assignedWOs, shops,
    reviewWOs, invoiceWOs, actionCount, isAdminRole,
    canSendEst, canSendInv,
    calendarTodayCount = 0, calendarUpcomingCount = 0,
  } = data

  const canSeeWOTab = isAdminRole || mechanic.can_send_estimates || mechanic.can_send_invoice

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Back */}
      <button
        onClick={() => router.push('/dashboard/my-teams')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={15} /> Back to My Teams
      </button>

      {/* Provider header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Wrench size={22} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{provider.name}</h1>
            {provider.is_verified && (
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle size={11} /> Verified
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${mechanic.role === 'accountant' ? 'bg-blue-100 text-blue-700' :
                mechanic.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-600'
              }`}>
              {mechanic.role?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{provider.status?.replace(/_/g, ' ')}</p>
        </div>
      </div>

      {/* Stats grid — 4-col for admin/accountant, 3-col for mechanics */}
      {canSeeWOTab ? (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{teamCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Team</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${actionCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className={`text-xl font-bold ${actionCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{actionCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Actions</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${reviewWOs.length > 0 ? 'bg-violet-50 border-violet-200' : 'bg-white border-gray-200'}`}>
            <p className={`text-xl font-bold ${reviewWOs.length > 0 ? 'text-violet-700' : 'text-gray-900'}`}>{reviewWOs.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">For Review</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${invoiceWOs.length > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
            <p className={`text-xl font-bold ${invoiceWOs.length > 0 ? 'text-green-700' : 'text-gray-900'}`}>{invoiceWOs.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Invoice Due</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{teamCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Team Members</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{pendingWOs.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Pending Response</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{activeWOs.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Active Work Orders</p>
          </div>
        </div>
      )}

      {/* Action banner */}
      {canSeeWOTab && actionCount > 0 && (
        <button
          onClick={() => setActiveTab('work-orders')}
          className="w-full flex items-center gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl hover:bg-amber-100 transition-colors text-left"
        >
          <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {actionCount} work order{actionCount > 1 ? 's' : ''} need{actionCount === 1 ? 's' : ''} your attention
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {reviewWOs.length > 0 && `${reviewWOs.length} estimate${reviewWOs.length > 1 ? 's' : ''} to review`}
              {reviewWOs.length > 0 && invoiceWOs.length > 0 && ' · '}
              {invoiceWOs.length > 0 && `${invoiceWOs.length} invoice${invoiceWOs.length > 1 ? 's' : ''} to generate`}
            </p>
          </div>
          <ChevronRight size={16} className="text-amber-600 flex-shrink-0" />
        </button>
      )}

      {/* Tab bar */}
      {canSeeWOTab && (
        <div className="flex border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {tab.label}
              {tab.id === 'work-orders' && actionCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-bold">
                  {actionCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
      {(activeTab === 'overview' || !canSeeWOTab) && (
        <div className="space-y-5">

          {/* Calendar quick-link — opens the per-provider calendar page.
          "Book Customer" CTA is shown only when the member has
          can_approve_work; otherwise just the View Calendar button. */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CalendarDays className="text-white" size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">
                    Calendar
                  </h2>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-2xl font-bold ${calendarTodayCount > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                        {calendarTodayCount}
                      </span>
                      <span className="text-xs text-gray-600">today</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-2xl font-bold ${calendarUpcomingCount > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>
                        {calendarUpcomingCount}
                      </span>
                      <span className="text-xs text-gray-600">next 7 days</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => router.push(`/dashboard/my-teams/provider/${params.providerId}/calendar`)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <CalendarDays size={16} /> View Calendar
                <ChevronRight size={14} />
              </button>
              {mechanic.can_approve_work && (
                <button
                  onClick={() => router.push(`/dashboard/my-teams/provider/${params.providerId}/calendar`)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 text-sm font-medium"
                  title="Open the calendar to book a customer"
                >
                  <Plus size={16} /> Book Customer
                </button>
              )}
            </div>
          </div>

          {/* Provider info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Provider Info</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <Shield size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Owner</p>
                  <p className="font-semibold text-gray-900">{ownerName}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <Users size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Team Size</p>
                  <p className="font-semibold text-gray-900">{teamCount} active member{teamCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {provider.phone && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                    <p className="font-medium text-gray-900">{provider.phone}</p>
                  </div>
                </div>
              )}
              {provider.email && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Mail size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Email</p>
                    <p className="font-medium text-gray-900">{provider.email}</p>
                  </div>
                </div>
              )}
              {provider.years_in_operation > 0 && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Calendar size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Experience</p>
                    <p className="font-medium text-gray-900">{provider.years_in_operation} years in operation</p>
                  </div>
                </div>
              )}
            </div>
            {provider.description && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{provider.description}</p>
            )}
            {shops.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">
                  Location{shops.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-2">
                  {shops.map(shop => (
                    <div key={shop.id} className="flex items-start gap-2 text-sm text-gray-700">
                      <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                      <span>
                        {shop.name}
                        {shop.town ? `, ${shop.town}` : ''}
                        {shop.county ? `, ${shop.county}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* My membership */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">My Membership</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Role</p>
                <p className="font-semibold text-gray-900 capitalize">{mechanic.role?.replace(/_/g, ' ') || 'Member'}</p>
              </div>
              {mechanic.specialization && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Specialization</p>
                  <p className="font-medium text-gray-900">{mechanic.specialization}</p>
                </div>
              )}
              {mechanic.experience_years > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Experience</p>
                  <p className="font-medium text-gray-900">{mechanic.experience_years} yr{mechanic.experience_years !== 1 ? 's' : ''}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Member Since</p>
                <p className="font-medium text-gray-900">
                  {new Date(mechanic.created_at).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Status</p>
                <p className={`font-medium ${mechanic.is_verified ? 'text-green-700' : 'text-gray-400'}`}>
                  {mechanic.is_verified ? '✓ Verified' : 'Pending verification'}
                </p>
              </div>
            </div>

            {/* Permissions */}
            <div>
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-2">Permissions</p>
              <div className="flex flex-wrap gap-2">
                {isAdminRole && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700">
                    <Shield size={11} /> Full work order access
                  </span>
                )}
                {mechanic.can_approve_work && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-xs font-medium text-purple-700">
                    <Wrench size={11} /> Manage work orders
                  </span>
                )}
                {mechanic.can_send_estimates && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs font-medium text-yellow-700">
                    <Send size={11} /> Send estimates
                  </span>
                )}
                {mechanic.can_send_invoice && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs font-medium text-green-700">
                    <Receipt size={11} /> Send invoices
                  </span>
                )}
                {mechanic.can_manage_inventory && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700">
                    <Award size={11} /> Manage inventory
                  </span>
                )}
                {mechanic.can_manage_team && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-medium text-orange-700">
                    <Users size={11} /> Manage team
                  </span>
                )}
                {mechanic.can_chat && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 border border-pink-200 rounded-lg text-xs font-medium text-pink-700">
                    <MessageSquare size={11} /> Chat with customers
                  </span>
                )}
                {!isAdminRole && !mechanic.can_approve_work && !mechanic.can_send_estimates
                  && !mechanic.can_send_invoice && !mechanic.can_manage_inventory && !mechanic.can_manage_team && !mechanic.can_chat && (
                    <span className="text-xs text-gray-400 italic">Acknowledge / decline assignments only</span>
                  )}
              </div>
            </div>
          </div>

          {/* Quick nav */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => router.push('/dashboard/my-teams')}
              className="flex items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition text-sm font-medium text-gray-700 hover:text-blue-700"
            >
              <Users size={16} /> My Teams
            </button>
            <button
              onClick={() => canSeeWOTab ? setActiveTab('work-orders') : router.push('/dashboard/my-teams/work-orders')}
              className="flex items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition text-sm font-medium text-gray-700 hover:text-green-700"
            >
              <ClipboardList size={16} />
              {canSeeWOTab ? 'All Work Orders' : 'My Work Orders'}
              {(actionCount > 0 || assignedWOs.length > 0) && (
                <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-bold">
                  {canSeeWOTab ? (actionCount || assignedWOs.length) : assignedWOs.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── WORK ORDERS TAB ──────────────────────────────────────────────── */}
      {activeTab === 'work-orders' && canSeeWOTab && (
        <WorkOrdersPanel
          providerId={params.providerId}
          canSendEstimates={canSendEst}
          canSendInvoice={canSendInv}
          canApproveWork={mechanic.can_approve_work}
        />
      )}
    </div>
  )
}