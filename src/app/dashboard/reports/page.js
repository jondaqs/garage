'use client'

/**
 * Personal user reports page.
 *
 * Symmetric to /company/reports and /dashboard/company/[id]/reports
 * but scoped to vehicles the current user individually owns
 * (vehicle_ownership.owner_user_id). Team panels are dropped — they
 * don't apply to personal users.
 *
 * Operational overview — bookings, work orders, providers used,
 * downtime, and average service metrics for the user's vehicles.
 * Financial views (spend, budget) live on /dashboard/budget.
 *
 * Layout:
 *   • Summary strip (3 cards)
 *       Total Bookings · Active Work Orders · Action Items
 *   • Bookings by Status          (left)
 *   • Work Orders by Status       (right)
 *   • Top Service Providers       (full-width)
 *   • Vehicle Utilization         (full-width)
 *   • Average Service Metrics     (full-width)
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart3, Wrench, AlertCircle, ClipboardList, Store,
  Car, Clock, DollarSign,
} from 'lucide-react'
import SubscriptionGate from '@/components/SubscriptionGate'

// ── Helpers ──────────────────────────────────────────────────────────────
const dayMs = 1000 * 60 * 60 * 24
const fmtMoney = (n, cur) => {
  const sym = cur?.symbol || cur?.code || ''
  return `${sym} ${Math.round(Number(n || 0)).toLocaleString()}`
}

// Compute how many days an interval [start, end] overlaps the given window.
// All inputs are Date objects. Returns a non-negative integer (days).
function overlapDays(start, end, windowStart, windowEnd) {
  if (!start) return 0
  const s = start > windowStart ? start : windowStart
  const e = (end || new Date()) < windowEnd ? (end || new Date()) : windowEnd
  if (e <= s) return 0
  return Math.max(0, Math.round((e - s) / dayMs))
}

export default function UserReportsPage() {
  const supabase = createClient()

  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)

  const [bookingStats,   setBookingStats]   = useState([])
  const [workOrderStats, setWorkOrderStats] = useState([])
  const [providerStats,  setProviderStats]  = useState([])
  const [activeWoCount,  setActiveWoCount]  = useState(0)
  const [actionItems,    setActionItems]    = useState({
    pending_estimates: 0, unpaid_invoices: 0, awaiting_checkout: 0,
  })
  const [utilization,    setUtilization]    = useState([])
  const [avgMetrics,     setAvgMetrics]     = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
      if (!profile) return

      // ── Personal vehicles ──────────────────────────────────────────────
      const { data: ownership } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id, vehicle:vehicles_secure(id, plate_number, make, model)')
        .eq('owner_user_id', profile.id)
      const fleet      = (ownership || []).map(r => r.vehicle).filter(Boolean)
      const vehicleIds = fleet.map(v => v.id)

      if (vehicleIds.length === 0) { setLoading(false); return }

      // ── Bookings ───────────────────────────────────────────────────────
      const { data: bookings } = await supabase
        .from('bookings_secure')
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

      // ── Work orders (powers 4 panels — single query) ───────────────────
      const { data: workOrders } = await supabase
        .from('work_orders_secure')
        .select(`
          id, vehicle_id, service_provider_id, total_amount,
          opened_at, closed_at,
          vehicle_checked_in_at, vehicle_checked_out_at, completed_at,
          status:work_order_statuses(code, display_name, is_terminal),
          service_provider:service_providers_secure(name),
          currency:currencies(id, code, symbol)
        `)
        .in('vehicle_id', vehicleIds)

      // 1. Status bucketing + active count
      const woStatusMap = {}
      let activeCount   = 0
      for (const wo of (workOrders || [])) {
        const code     = wo.status?.code         || 'unknown'
        const label    = wo.status?.display_name || code
        const terminal = wo.status?.is_terminal === true
        if (!woStatusMap[code]) woStatusMap[code] = { code, label, terminal, count: 0 }
        woStatusMap[code].count++
        if (!terminal) activeCount++
      }
      setWorkOrderStats(
        Object.values(woStatusMap).sort((a, b) => {
          if (a.terminal !== b.terminal) return a.terminal ? 1 : -1
          return b.count - a.count
        })
      )
      setActiveWoCount(activeCount)

      // 2. Top providers (by visits)
      const provMap = new Map()
      for (const wo of (workOrders || [])) {
        if (!wo.service_provider_id) continue
        const prev = provMap.get(wo.service_provider_id) || {
          id: wo.service_provider_id,
          name: wo.service_provider?.name || '—',
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

      // 3. Vehicle utilization (last 30 / 90 days)
      const now      = new Date()
      const window30 = new Date(now.getTime() - 30 * dayMs)
      const window90 = new Date(now.getTime() - 90 * dayMs)
      const utilMap  = new Map(fleet.map(v => [v.id, {
        vehicle: v, days30: 0, days90: 0, visits90: 0,
      }]))
      for (const wo of (workOrders || [])) {
        const row = utilMap.get(wo.vehicle_id)
        if (!row) continue
        const inAt  = wo.vehicle_checked_in_at  ? new Date(wo.vehicle_checked_in_at)  : (wo.opened_at ? new Date(wo.opened_at) : null)
        const outAt = wo.vehicle_checked_out_at ? new Date(wo.vehicle_checked_out_at) : (wo.closed_at ? new Date(wo.closed_at) : null)
        if (!inAt) continue
        row.days30 += overlapDays(inAt, outAt, window30, now)
        const d90 = overlapDays(inAt, outAt, window90, now)
        row.days90 += d90
        if (d90 > 0) row.visits90++
      }
      const utilList = Array.from(utilMap.values())
        .filter(r => r.days90 > 0 || r.days30 > 0)
        .sort((a, b) => b.days30 - a.days30 || b.days90 - a.days90)
      setUtilization(utilList)

      // 4. Average service metrics — duration + per-currency cost
      let durSum = 0, durN = 0
      const costByCur = new Map()
      for (const wo of (workOrders || [])) {
        const terminal = wo.status?.is_terminal === true
        if (!terminal) continue
        const start = wo.vehicle_checked_in_at  ? new Date(wo.vehicle_checked_in_at)  : (wo.opened_at ? new Date(wo.opened_at) : null)
        const end   = wo.closed_at              ? new Date(wo.closed_at)              : (wo.completed_at ? new Date(wo.completed_at) : null)
        if (start && end && end > start) {
          durSum += (end - start) / dayMs
          durN++
        }
        const amt = Number(wo.total_amount || 0)
        const cur = wo.currency
        if (amt > 0 && cur?.id) {
          const prev = costByCur.get(cur.id) || { currency: cur, total: 0, count: 0 }
          prev.total += amt
          prev.count += 1
          costByCur.set(cur.id, prev)
        }
      }
      setAvgMetrics({
        duration_days_avg: durN > 0 ? durSum / durN : null,
        duration_sample:   durN,
        by_currency: Array.from(costByCur.values())
          .map(c => ({ currency: c.currency, avg: c.total / c.count, count: c.count, total: c.total }))
          .sort((a, b) => b.total - a.total),
      })

      // ── Action items ───────────────────────────────────────────────────
      const [estimatesRes, invoicesRes, checkoutsRes] = await Promise.all([
        supabase.from('work_orders_secure')
          .select('id', { count: 'exact', head: true })
          .in('vehicle_id', vehicleIds)
          .not('estimate_sent_at', 'is', null)
          .eq('estimate_approved', false)
          .is('estimate_rejected_at', null),

        supabase.from('invoices')
          .select('id', { count: 'exact', head: true })
          .in('vehicle_id', vehicleIds)
          .neq('status', 'paid'),

        supabase.from('work_order_checkouts')
          .select('id, work_order:work_orders_secure!inner(vehicle_id)', { count: 'exact', head: true })
          .in('work_order.vehicle_id', vehicleIds)
          .eq('customer_acceptance_status', 'pending'),
      ])
      setActionItems({
        pending_estimates: estimatesRes.count  || 0,
        unpaid_invoices:   invoicesRes.count   || 0,
        awaiting_checkout: checkoutsRes.count  || 0,
      })

    } catch (err) {
      console.error('Reports error:')
      setError('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  // ── Palette ────────────────────────────────────────────────────────────
  const bookingColors = {
    completed: 'bg-green-500', confirmed: 'bg-blue-500', in_progress: 'bg-purple-500',
    pending: 'bg-yellow-500', cancelled: 'bg-red-400',
    cancelled_provider: 'bg-red-400', cancelled_customer: 'bg-red-400', no_show: 'bg-gray-400',
  }
  const woColors = {
    open: 'bg-blue-500', in_progress: 'bg-purple-500',
    awaiting_estimate_approval: 'bg-orange-500',
    awaiting_customer_checkout: 'bg-amber-500',
    completed: 'bg-green-500', closed: 'bg-green-600', cancelled: 'bg-red-400',
  }

  const actionTotal = actionItems.pending_estimates + actionItems.unpaid_invoices + actionItems.awaiting_checkout
  const totalBookings = bookingStats.reduce((s, b) => s + b.count, 0)
  const maxUtil30     = utilization.length > 0 ? Math.max(...utilization.map(u => u.days30 || 0), 1) : 1

  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" /><p>{error}</p>
    </div>
  )

  return (
    <SubscriptionGate
      featureName="Service Reports"
      featureDescription="View work orders, provider analytics, vehicle utilization, and downtime metrics."
    >
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of your service activity. For spend tracking see Budget.
        </p>
      </div>

      {/* Summary strip — 3 cards (no team for personal users) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Bookings', value: totalBookings,
            icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Work Orders', value: activeWoCount,
            icon: Wrench, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Action Items', value: actionTotal,
            icon: ClipboardList,
            color: actionTotal > 0 ? 'text-amber-600' : 'text-gray-400',
            bg:    actionTotal > 0 ? 'bg-amber-50'    : 'bg-gray-50',
            sub:   actionTotal > 0
              ? `${actionItems.pending_estimates} est · ${actionItems.unpaid_invoices} inv · ${actionItems.awaiting_checkout} chk`
              : 'All clear' },
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
                      <div className={`h-2 rounded-full ${bookingColors[code] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
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

        {/* Vehicle utilization / downtime */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Car size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Vehicle Utilization / Downtime</h2>
            <span className="text-xs text-gray-400">days with a provider</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Lower is better — days your vehicle was off the road for
            service in the last 30 / 90 days.
          </p>
          {utilization.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No service downtime recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left  py-2 text-xs font-semibold text-gray-500 uppercase">Vehicle</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Last 30d</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Last 90d</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Visits (90d)</th>
                    <th className="py-2 w-1/3" />
                  </tr>
                </thead>
                <tbody>
                  {utilization.map(({ vehicle, days30, days90, visits90 }) => {
                    const pct = Math.round((days30 / maxUtil30) * 100)
                    const heavy = days30 >= 7
                    return (
                      <tr key={vehicle.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3">
                          <p className="font-medium text-gray-900">{vehicle.plate_number}</p>
                          <p className="text-xs text-gray-400">
                            {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                          </p>
                        </td>
                        <td className={`py-3 text-right font-semibold ${heavy ? 'text-amber-600' : 'text-gray-900'}`}>
                          {days30}
                        </td>
                        <td className="py-3 text-right text-gray-600">{days90}</td>
                        <td className="py-3 text-right text-gray-500 text-xs">{visits90}</td>
                        <td className="py-3 pl-4">
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${heavy ? 'bg-amber-400' : 'bg-blue-400'}`}
                                 style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Average service metrics */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Average Service Metrics</h2>
            <span className="text-xs text-gray-400">across closed work orders</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Cost is broken out per currency since blending currencies
            wouldn&apos;t mean anything. Duration is currency-agnostic.
          </p>

          {!avgMetrics || (avgMetrics.by_currency.length === 0 && avgMetrics.duration_sample === 0) ? (
            <p className="text-sm text-gray-400 text-center py-8">No closed work orders yet.</p>
          ) : (
            <div className="space-y-4">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} className="text-blue-600" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg duration</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {avgMetrics.duration_days_avg == null
                      ? '—'
                      : avgMetrics.duration_days_avg < 1
                        ? `${Math.round(avgMetrics.duration_days_avg * 24)} hrs`
                        : `${avgMetrics.duration_days_avg.toFixed(1)} days`}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    based on {avgMetrics.duration_sample} closed work order{avgMetrics.duration_sample !== 1 ? 's' : ''}
                  </p>
                </div>

                {avgMetrics.by_currency.length === 1 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign size={14} className="text-green-600" />
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg cost</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {fmtMoney(avgMetrics.by_currency[0].avg, avgMetrics.by_currency[0].currency)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {avgMetrics.by_currency[0].count} work order{avgMetrics.by_currency[0].count !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>

              {avgMetrics.by_currency.length > 1 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left  py-2 text-xs font-semibold text-gray-500 uppercase">Currency</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Work Orders</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Total</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {avgMetrics.by_currency.map(({ currency, count, total, avg }) => (
                        <tr key={currency.id} className="border-b border-gray-50">
                          <td className="py-2 font-semibold text-gray-700">{currency.code}</td>
                          <td className="py-2 text-right text-gray-600">{count}</td>
                          <td className="py-2 text-right text-gray-700">{fmtMoney(total, currency)}</td>
                          <td className="py-2 text-right font-semibold text-gray-900">{fmtMoney(avg, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
    </SubscriptionGate>
  )
}