// src/app/admin/reports/page.js
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Store, Building2, Car, Calendar, ClipboardList,
  TrendingUp, TrendingDown, Minus, DollarSign, FileText,
  Clock, ArrowRight, RefreshCw,
} from 'lucide-react'

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString()
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0')
const fmtCurrency = (n, symbol = '') => `${symbol || ''} ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`.trim()

function monthLabel(dateStr) {
  const d = new Date(dateStr + '-01')
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function TrendBadge({ current, previous }) {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-green-700"><TrendingUp size={12} /> New</span>
  const change = ((current - previous) / previous * 100).toFixed(0)
  if (change > 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-green-700"><TrendingUp size={12} /> +{change}%</span>
  if (change < 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-600"><TrendingDown size={12} /> {change}%</span>
  return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-400"><Minus size={12} /> 0%</span>
}

function Bar({ value, max, color = 'bg-blue-500', label, count }) {
  const w = max > 0 ? Math.max((value / max) * 100, 2) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-gray-600 text-xs truncate shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-700 w-12 text-right shrink-0">{fmt(count)}</span>
    </div>
  )
}

export default function AdminReportsPage() {
  const supabase = createClient()

  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [summary,     setSummary]     = useState(null)
  const [trends,      setTrends]      = useState([])
  const [bookingStats, setBookingStats] = useState([])
  const [woStats,     setWoStats]     = useState([])
  const [topProviders, setTopProviders] = useState([])
  const [recentActions, setRecentActions] = useState([])
  const [revenueStats, setRevenueStats]   = useState(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      await Promise.all([
        loadSummary(),
        loadTrends(),
        loadBookingBreakdown(),
        loadWorkOrderBreakdown(),
        loadTopProviders(),
        loadRecentAdminActions(),
        loadRevenueStats(),
      ])
    } catch (err) {
      console.error('Report load error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // ── 1. Summary with period comparison ──────────────────────────────────
  const loadSummary = async () => {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

    const [
      { count: totalUsers },
      { count: totalProviders },
      { count: totalCompanies },
      { count: totalVehicles },
      { count: totalBookings },
      { count: totalWorkOrders },
      { count: newUsersThisMonth },
      { count: newUsersLastMonth },
      { count: newProvidersThisMonth },
      { count: newProvidersLastMonth },
      { count: newCompaniesThisMonth },
      { count: newCompaniesLastMonth },
      { count: activeProviders },
      { count: activeCompanies },
    ] = await Promise.all([
      supabase.from('user_profiles_secure').select('*', { count: 'exact', head: true }),
      supabase.from('service_providers_secure').select('*', { count: 'exact', head: true }),
      supabase.from('company_profiles_secure').select('*', { count: 'exact', head: true }),
      supabase.from('vehicles_secure').select('*', { count: 'exact', head: true }),
      supabase.from('bookings_secure').select('*', { count: 'exact', head: true }),
      supabase.from('work_orders_secure').select('*', { count: 'exact', head: true }),
      supabase.from('user_profiles_secure').select('*', { count: 'exact', head: true }).gte('created_at', thisMonthStart),
      supabase.from('user_profiles_secure').select('*', { count: 'exact', head: true }).gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
      supabase.from('service_providers_secure').select('*', { count: 'exact', head: true }).gte('created_at', thisMonthStart),
      supabase.from('service_providers_secure').select('*', { count: 'exact', head: true }).gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
      supabase.from('company_profiles_secure').select('*', { count: 'exact', head: true }).gte('created_at', thisMonthStart),
      supabase.from('company_profiles_secure').select('*', { count: 'exact', head: true }).gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
      supabase.from('service_providers_secure').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('company_profiles_secure').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    setSummary({
      totalUsers, totalProviders, totalCompanies, totalVehicles, totalBookings, totalWorkOrders,
      newUsersThisMonth, newUsersLastMonth,
      newProvidersThisMonth, newProvidersLastMonth,
      newCompaniesThisMonth, newCompaniesLastMonth,
      activeProviders, activeCompanies,
    })
  }

  // ── 2. Monthly registration trends (last 6 months) ────────────────────
  const loadTrends = async () => {
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)
      months.push({ label: monthLabel(start.toISOString().slice(0, 7)), start: start.toISOString(), end: end.toISOString() })
    }

    const results = await Promise.all(
      months.map(async (m) => {
        const [{ count: users }, { count: providers }, { count: companies }] = await Promise.all([
          supabase.from('user_profiles_secure').select('*', { count: 'exact', head: true }).gte('created_at', m.start).lte('created_at', m.end),
          supabase.from('service_providers_secure').select('*', { count: 'exact', head: true }).gte('created_at', m.start).lte('created_at', m.end),
          supabase.from('company_profiles_secure').select('*', { count: 'exact', head: true }).gte('created_at', m.start).lte('created_at', m.end),
        ])
        return { label: m.label, users: users || 0, providers: providers || 0, companies: companies || 0 }
      })
    )
    setTrends(results)
  }

  // ── 3. Bookings by status ─────────────────────────────────────────────
  const loadBookingBreakdown = async () => {
    const { data: statuses } = await supabase
      .from('booking_statuses').select('id, code, display_name').order('sort_order')

    if (!statuses) { setBookingStats([]); return }

    const counts = await Promise.all(
      statuses.map(async (s) => {
        const { count } = await supabase
          .from('bookings_secure').select('*', { count: 'exact', head: true }).eq('status_id', s.id)
        return { ...s, count: count || 0 }
      })
    )
    setBookingStats(counts.filter(s => s.count > 0).sort((a, b) => b.count - a.count))
  }

  // ── 4. Work orders by status ──────────────────────────────────────────
  const loadWorkOrderBreakdown = async () => {
    const { data: statuses } = await supabase
      .from('work_order_statuses').select('id, code, display_name, is_terminal').order('sort_order')

    if (!statuses) { setWoStats([]); return }

    const counts = await Promise.all(
      statuses.map(async (s) => {
        const { count } = await supabase
          .from('work_orders_secure').select('*', { count: 'exact', head: true }).eq('status_id', s.id)
        return { ...s, count: count || 0 }
      })
    )
    setWoStats(counts.filter(s => s.count > 0).sort((a, b) => b.count - a.count))
  }

  // ── 5. Top providers ──────────────────────────────────────────────────
  const loadTopProviders = async () => {
    const { data } = await supabase
      .from('service_providers_secure')
      .select('id, name, status, shops_secure(id), provider_reviews(rating)')
      .eq('status', 'active')
      .limit(10)

    if (!data) { setTopProviders([]); return }

    const withStats = data.map(p => {
      const reviews  = p.provider_reviews || []
      const avgRating = reviews.length > 0
        ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
        : null
      return {
        id: p.id,
        name: p.name,
        shops: p.shops?.length || 0,
        reviews: reviews.length,
        avgRating,
      }
    }).sort((a, b) => (b.reviews - a.reviews) || ((b.avgRating || 0) - (a.avgRating || 0)))

    setTopProviders(withStats.slice(0, 8))
  }

  // ── 6. Recent admin actions ───────────────────────────────────────────
  const loadRecentAdminActions = async () => {
    const { data } = await supabase
      .from('admin_action_logs')
      .select('id, action_type, target_type, action_data, created_at, admin:user_profiles!admin_action_logs_admin_user_id_fkey(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(10)

    setRecentActions(data || [])
  }

  // ── 7. Revenue overview — grouped by currency ──────────────────────────
  const loadRevenueStats = async () => {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('total_amount, status, paid_at, issued_at, provider:service_providers_secure(currency:currencies(code, symbol))')

    if (error) console.error('Invoices query failed:', error)

    if (!invoices || invoices.length === 0) {
      setRevenueStats([])
      return
    }

    // Group by currency
    const byCurrency = {}
    for (const inv of invoices) {
      const code   = inv.provider?.currency?.code || 'N/A'
      const symbol = inv.provider?.currency?.symbol || ''
      if (!byCurrency[code]) {
        byCurrency[code] = { code, symbol, total: 0, paid: 0, pending: 0, count: 0, paidCount: 0 }
      }
      const amount = Number(inv.total_amount) || 0
      byCurrency[code].total += amount
      byCurrency[code].count += 1
      if (inv.status === 'paid') {
        byCurrency[code].paid += amount
        byCurrency[code].paidCount += 1
      }
      if (inv.status === 'pending' || inv.status === 'sent') {
        byCurrency[code].pending += amount
      }
    }

    setRevenueStats(Object.values(byCurrency).sort((a, b) => b.total - a.total))
  }

  // ── Status color helper ───────────────────────────────────────────────
  const statusBarColor = (code) => {
    const map = {
      pending: 'bg-yellow-400', confirmed: 'bg-blue-400', in_progress: 'bg-indigo-500',
      completed: 'bg-green-500', cancelled: 'bg-red-400', no_show: 'bg-gray-400',
      closed: 'bg-green-600', open: 'bg-blue-400',
      awaiting_approval: 'bg-yellow-400', approved: 'bg-blue-500',
      awaiting_customer_checkout: 'bg-purple-400',
      diagnosis: 'bg-orange-400', repair: 'bg-indigo-400',
    }
    return map[code] || 'bg-gray-400'
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  const s = summary || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Platform-wide statistics and trends</p>
        </div>
        <button onClick={() => loadAll(true)} disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 self-start">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Users',    value: s.totalUsers,     icon: Users,        color: 'bg-blue-100 text-blue-700',   thisMonth: s.newUsersThisMonth,     lastMonth: s.newUsersLastMonth },
          { label: 'Providers',      value: s.totalProviders, icon: Store,        color: 'bg-green-100 text-green-700', thisMonth: s.newProvidersThisMonth, lastMonth: s.newProvidersLastMonth, sub: `${fmt(s.activeProviders)} active` },
          { label: 'Companies',      value: s.totalCompanies, icon: Building2,    color: 'bg-purple-100 text-purple-700', thisMonth: s.newCompaniesThisMonth, lastMonth: s.newCompaniesLastMonth, sub: `${fmt(s.activeCompanies)} active` },
          { label: 'Vehicles',       value: s.totalVehicles,  icon: Car,          color: 'bg-gray-100 text-gray-700' },
          { label: 'Bookings',       value: s.totalBookings,  icon: Calendar,     color: 'bg-orange-100 text-orange-700' },
          { label: 'Work Orders',    value: s.totalWorkOrders,icon: ClipboardList,color: 'bg-indigo-100 text-indigo-700' },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>
                  <Icon size={18} />
                </div>
                {card.thisMonth !== undefined && (
                  <TrendBadge current={card.thisMonth || 0} previous={card.lastMonth || 0} />
                )}
              </div>
              <p className="text-2xl font-bold text-gray-900">{fmt(card.value)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
              {card.sub && <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>}
              {card.thisMonth !== undefined && (
                <p className="text-[11px] text-gray-400 mt-1">+{fmt(card.thisMonth)} this month</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Registration Trends ────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Monthly Registrations (6 months)</h2>
          {trends.length > 0 ? (
            <div className="space-y-3">
              {/* Legend */}
              <div className="flex gap-4 text-[11px] text-gray-500 mb-2">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Users</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Providers</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Companies</span>
              </div>
              {/* Bars */}
              {(() => {
                const maxVal = Math.max(...trends.map(t => Math.max(t.users, t.providers, t.companies)), 1)
                return trends.map(t => (
                  <div key={t.label} className="space-y-1">
                    <p className="text-xs font-medium text-gray-600">{t.label}</p>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${(t.users / maxVal) * 100}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-500 w-8 text-right">{t.users}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${(t.providers / maxVal) * 100}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-500 w-8 text-right">{t.providers}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${(t.companies / maxVal) * 100}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-500 w-8 text-right">{t.companies}</span>
                      </div>
                    </div>
                  </div>
                ))
              })()}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No registration data</p>
          )}
        </div>

        {/* ── Revenue Overview ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Revenue Overview</h2>
          {revenueStats && revenueStats.length > 0 ? (
            <div className="space-y-5">
              {revenueStats.map(cur => (
                <div key={cur.code} className="space-y-3">
                  {revenueStats.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{cur.code}</span>
                      <span className="text-xs text-gray-400">{cur.count} invoice{cur.count === 1 ? '' : 's'}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600 font-medium">Paid</p>
                      <p className="text-lg font-bold text-green-800 mt-1">{fmtCurrency(cur.paid, cur.symbol)}</p>
                      <p className="text-[11px] text-green-600 mt-0.5">{fmt(cur.paidCount)} invoices</p>
                    </div>
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <p className="text-xs text-yellow-600 font-medium">Pending</p>
                      <p className="text-lg font-bold text-yellow-800 mt-1">{fmtCurrency(cur.pending, cur.symbol)}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Total invoiced</span>
                      <span className="font-medium text-gray-700">{fmtCurrency(cur.total, cur.symbol)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full bg-green-500 transition-all duration-500"
                        style={{ width: `${pct(cur.paid, cur.total)}%` }} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">{pct(cur.paid, cur.total)}% collected</p>
                  </div>
                  {revenueStats.length > 1 && revenueStats.indexOf(cur) < revenueStats.length - 1 && (
                    <hr className="border-gray-100" />
                  )}
                </div>
              ))}
              {revenueStats.length === 1 && (
                <p className="text-xs text-gray-500">{fmt(revenueStats[0].count)} total invoices across all providers</p>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <DollarSign size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No invoice data yet</p>
            </div>
          )}
        </div>

        {/* ── Bookings Breakdown ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Bookings by Status</h2>
          {bookingStats.length > 0 ? (
            <div className="space-y-2.5">
              {(() => {
                const maxCount = Math.max(...bookingStats.map(s => s.count), 1)
                return bookingStats.map(s => (
                  <Bar key={s.id} label={s.display_name} count={s.count} value={s.count} max={maxCount}
                    color={statusBarColor(s.code)} />
                ))
              })()}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Total</span>
                <span className="font-medium text-gray-700">{fmt(bookingStats.reduce((s, b) => s + b.count, 0))}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No booking data</p>
          )}
        </div>

        {/* ── Work Orders Breakdown ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Work Orders by Status</h2>
          {woStats.length > 0 ? (
            <div className="space-y-2.5">
              {(() => {
                const maxCount = Math.max(...woStats.map(s => s.count), 1)
                const total    = woStats.reduce((s, w) => s + w.count, 0)
                const closed   = woStats.filter(w => w.is_terminal).reduce((s, w) => s + w.count, 0)
                return (
                  <>
                    {woStats.map(s => (
                      <Bar key={s.id} label={s.display_name} count={s.count} value={s.count} max={maxCount}
                        color={statusBarColor(s.code)} />
                    ))}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                      <span>Completion rate</span>
                      <span className="font-medium text-gray-700">{pct(closed, total)}% ({fmt(closed)} / {fmt(total)})</span>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No work order data</p>
          )}
        </div>

        {/* ── Top Providers ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Top Active Providers</h2>
          {topProviders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4">Provider</th>
                    <th className="text-center py-2 px-2">Shops</th>
                    <th className="text-center py-2 px-2">Reviews</th>
                    <th className="text-center py-2 pl-2">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topProviders.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-900 truncate max-w-[160px]">{p.name}</td>
                      <td className="py-2 px-2 text-center text-gray-600">{p.shops}</td>
                      <td className="py-2 px-2 text-center text-gray-600">{p.reviews}</td>
                      <td className="py-2 pl-2 text-center">
                        {p.avgRating
                          ? <span className="inline-flex items-center gap-0.5 text-yellow-700 font-medium">★ {p.avgRating}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No active providers</p>
          )}
        </div>

        {/* ── Recent Admin Activity ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Recent Admin Activity</h2>
          {recentActions.length > 0 ? (
            <div className="space-y-3">
              {recentActions.map(a => {
                const adminName = a.admin
                  ? [a.admin.first_name, a.admin.last_name].filter(Boolean).join(' ')
                  : 'Unknown'
                const actionLabel = (a.action_type || '').replace(/_/g, ' ')
                const targetName = a.action_data?.provider_name || a.action_data?.company_name || a.action_data?.user_name || ''

                return (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Clock size={13} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-900">
                        <span className="font-medium">{adminName}</span>
                        {' '}<span className="text-gray-500">{actionLabel}</span>
                        {targetName && <> — <span className="font-medium">{targetName}</span></>}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No admin actions recorded</p>
          )}
        </div>
      </div>
    </div>
  )
}