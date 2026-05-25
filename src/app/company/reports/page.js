'use client'

/**
 * Company reports page (owner / admin).
 *
 * Operational overview — fleet-wide booking + work-order activity.
 * Financial views (spend, budget) live on /company/budget, so this
 * page focuses on workflow state and provider relationships instead.
 *
 * Layout:
 *   • Summary strip (4 cards)
 *       Total Bookings · Active Work Orders · Action Items · Active Team
 *   • Bookings by Status              (left)
 *   • Work Orders by Status           (right)  -- replaces "Spend by Vehicle"
 *   • Top Service Providers           (full-width)
 *   • Team Members                    (full-width)
 *
 * Action Items aggregates three operational tasks that need someone's
 * attention: pending estimates, unpaid invoices, and checkouts the
 * customer hasn't accepted yet. The card shows the total and breaks
 * out each component so you know where to look first.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart3, Wrench, Users, AlertCircle, ClipboardList, Store,
} from 'lucide-react'

export default function ReportsPage() {
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [bookingStats,    setBookingStats]    = useState([])
  const [workOrderStats,  setWorkOrderStats]  = useState([])
  const [providerStats,   setProviderStats]   = useState([])
  const [teamStats,       setTeamStats]       = useState([])
  const [activeWoCount,   setActiveWoCount]   = useState(0)
  const [actionItems,     setActionItems]     = useState({
    pending_estimates: 0,
    unpaid_invoices:   0,
    awaiting_checkout: 0,
  })

  useEffect(() => { fetchReports() }, [])

  const fetchReports = async () => {
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      // Resolve company id (owner or member)
      let cId = null
      const { data: owned } = await supabase
        .from('company_profiles').select('id')
        .eq('owner_user_id', profile.id).maybeSingle()
      if (owned) cId = owned.id
      else {
        const { data: member } = await supabase
          .from('company_users').select('company_id')
          .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
        if (member) cId = member.company_id
      }
      if (!cId) { setError('No company found'); setLoading(false); return }

      // Fleet vehicle ids — used to scope every other query.
      const { data: fleetRows } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_company_id', cId)
      const vehicleIds = (fleetRows || []).map(r => r.vehicle_id)

      // Team roster — needed regardless of fleet size.
      const { data: members } = await supabase
        .from('company_users')
        .select(`
          id, staff_role, is_admin,
          user:user_profiles!company_users_user_id_fkey(first_name, last_name)
        `)
        .eq('company_id', cId)
        .eq('is_active', true)
      setTeamStats(members || [])

      // No fleet → nothing else to compute.
      if (vehicleIds.length === 0) { setLoading(false); return }

      // ── Bookings ──────────────────────────────────────────────────────
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, status:booking_statuses(code, display_name)')
        .in('vehicle_id', vehicleIds)

      const bStatusMap = {}
      for (const b of (bookings || [])) {
        const code  = b.status?.code         || 'unknown'
        const label = b.status?.display_name || code
        if (!bStatusMap[code]) bStatusMap[code] = { code, label, count: 0 }
        bStatusMap[code].count++
      }
      setBookingStats(Object.values(bStatusMap).sort((a, b) => b.count - a.count))

      // ── Work orders ───────────────────────────────────────────────────
      // Pull status code + is_terminal so we can separate "active" from
      // "done" without hard-coding the closed/cancelled list here.
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select(`
          id, service_provider_id,
          status:work_order_statuses(code, display_name, is_terminal, sort_order),
          service_provider:service_providers(name)
        `)
        .in('vehicle_id', vehicleIds)

      // Bucket by status code for the chart.
      const woStatusMap = {}
      let activeCount   = 0
      for (const wo of (workOrders || [])) {
        const code     = wo.status?.code         || 'unknown'
        const label    = wo.status?.display_name || code
        const terminal = wo.status?.is_terminal === true
        if (!woStatusMap[code]) {
          woStatusMap[code] = { code, label, terminal, count: 0 }
        }
        woStatusMap[code].count++
        if (!terminal) activeCount++
      }
      // Display order: open/active states first, then terminal.
      const woList = Object.values(woStatusMap).sort((a, b) => {
        if (a.terminal !== b.terminal) return a.terminal ? 1 : -1
        return b.count - a.count
      })
      setWorkOrderStats(woList)
      setActiveWoCount(activeCount)

      // ── Top providers (by visit count, with revenue as a secondary stat) ─
      // We count distinct work orders per provider. Could later add
      // total invoice value (currency-aware) for a richer ranking;
      // visits are a good proxy for relationship strength and easy
      // to reason about without currency considerations.
      const provMap = new Map()
      for (const wo of (workOrders || [])) {
        if (!wo.service_provider_id) continue
        const prev = provMap.get(wo.service_provider_id) || {
          id:     wo.service_provider_id,
          name:   wo.service_provider?.name || '—',
          visits: 0,
        }
        prev.visits++
        provMap.set(wo.service_provider_id, prev)
      }
      setProviderStats(
        Array.from(provMap.values())
          .sort((a, b) => b.visits - a.visits)
          .slice(0, 8)
      )

      // ── Action items ──────────────────────────────────────────────────
      // Three independent counts. We do these in parallel via
      // head-only count queries since we only need totals, not rows.
      const [estimatesRes, invoicesRes, checkoutsRes] = await Promise.all([
        // Estimates sent but not yet approved or rejected.
        supabase.from('work_orders')
          .select('id', { count: 'exact', head: true })
          .in('vehicle_id', vehicleIds)
          .not('estimate_sent_at', 'is', null)
          .eq('estimate_approved', false)
          .is('estimate_rejected_at', null),

        // Invoices issued but not paid.
        supabase.from('invoices')
          .select('id', { count: 'exact', head: true })
          .in('vehicle_id', vehicleIds)
          .neq('status', 'paid'),

        // Checkouts pending customer acceptance.
        supabase.from('work_order_checkouts')
          .select('id, work_order:work_orders!inner(vehicle_id)', { count: 'exact', head: true })
          .in('work_order.vehicle_id', vehicleIds)
          .eq('customer_acceptance_status', 'pending'),
      ])

      setActionItems({
        pending_estimates: estimatesRes.count  || 0,
        unpaid_invoices:   invoicesRes.count   || 0,
        awaiting_checkout: checkoutsRes.count  || 0,
      })

    } catch (err) {
      console.error('Reports error:', err)
      setError('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  // ── Colour palettes ────────────────────────────────────────────────────
  const bookingColors = {
    completed:           'bg-green-500',
    confirmed:           'bg-blue-500',
    in_progress:         'bg-purple-500',
    pending:             'bg-yellow-500',
    cancelled:           'bg-red-400',
    cancelled_provider:  'bg-red-400',
    cancelled_customer:  'bg-red-400',
    no_show:             'bg-gray-400',
  }
  const woColors = {
    open:                       'bg-blue-500',
    in_progress:                'bg-purple-500',
    awaiting_estimate_approval: 'bg-orange-500',
    awaiting_customer_checkout: 'bg-amber-500',
    completed:                  'bg-green-500',
    closed:                     'bg-green-600',
    cancelled:                  'bg-red-400',
  }

  const actionTotal = actionItems.pending_estimates
                    + actionItems.unpaid_invoices
                    + actionItems.awaiting_checkout

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )
  if (error) return (
    <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
      <AlertCircle className="w-4 h-4 shrink-0" /> {error}
    </div>
  )

  const totalBookings = bookingStats.reduce((s, b) => s + b.count, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Operational overview of fleet activity and team. For spend tracking see Budget.
        </p>
      </div>

      {/* Summary strip — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Bookings',     value: totalBookings,
            icon: BarChart3,    color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Active Work Orders', value: activeWoCount,
            icon: Wrench,       color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Action Items',       value: actionTotal,
            icon: ClipboardList, color: actionTotal > 0 ? 'text-amber-600' : 'text-gray-400',
            bg: actionTotal > 0 ? 'bg-amber-50' : 'bg-gray-50',
            // Sub-line breaks out the three components so a glance tells
            // the user where the count is coming from.
            sub: actionTotal > 0
              ? `${actionItems.pending_estimates} est · ${actionItems.unpaid_invoices} inv · ${actionItems.awaiting_checkout} chk`
              : 'All clear' },
          { label: 'Active Team',        value: teamStats.length,
            icon: Users,        color: 'text-green-600',  bg: 'bg-green-50' },
        ].map(({ label, value, icon: Icon, color, bg, sub }) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bookings by status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Bookings by Status</h2>
          {bookingStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No booking data yet</p>
          ) : (
            <div className="space-y-3">
              {bookingStats.map(({ code, label, count }) => {
                const pct = totalBookings > 0 ? Math.round((count / totalBookings) * 100) : 0
                return (
                  <div key={code}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 capitalize">{label}</span>
                      <span className="font-medium text-gray-900">
                        {count} <span className="text-gray-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${bookingColors[code] || 'bg-gray-400'}`}
                           style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Work orders by status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Work Orders by Status</h2>
          {workOrderStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No work orders yet</p>
          ) : (
            <div className="space-y-3">
              {workOrderStats.map(({ code, label, count, terminal }) => {
                const total = workOrderStats.reduce((s, w) => s + w.count, 0)
                const pct   = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={code}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 capitalize">
                        {label}
                        {!terminal && (
                          <span className="ml-2 text-[10px] uppercase font-semibold text-blue-600 tracking-wide">
                            active
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {count} <span className="text-gray-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${woColors[code] || (terminal ? 'bg-gray-400' : 'bg-blue-500')}`}
                           style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top providers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Store size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Top Service Providers</h2>
            <span className="text-xs text-gray-400">by work order visits</span>
          </div>
          {providerStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No work orders with providers yet</p>
          ) : (
            <div className="space-y-3">
              {providerStats.map((p, i) => {
                // Bar scales relative to the top provider so the
                // distribution shape is visible at a glance.
                const max = providerStats[0]?.visits || 1
                const pct = Math.round((p.visits / max) * 100)
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 truncate">
                        <span className="text-gray-400 text-xs mr-2">#{i + 1}</span>
                        {p.name}
                      </span>
                      <span className="font-medium text-gray-900">
                        {p.visits} <span className="text-gray-400 font-normal">visit{p.visits !== 1 ? 's' : ''}</span>
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Team roster */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Team Members</h2>
          {teamStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No team members yet</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {teamStats.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-blue-700">
                      {m.user?.first_name?.[0]}{m.user?.last_name?.[0]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.user?.first_name} {m.user?.last_name}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {m.staff_role}{m.is_admin ? ' · Admin' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}