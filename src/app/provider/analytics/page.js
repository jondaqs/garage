'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp, DollarSign, Users, Star,
  Calendar, Wrench, Loader2, AlertCircle,
  ChevronDown
} from 'lucide-react'

const PERIODS = [
  { value: '7',  label: 'Last 7 days'  },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 3 months'},
  { value: '365',label: 'Last year'    },
]

// Simple bar: value / max → width %
function Bar({ value, max, color = 'bg-green-500', label, sublabel, amount }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 truncate max-w-[55%]">{label}</span>
        <div className="flex items-center gap-3 flex-shrink-0">
          {amount != null && <span className="text-xs text-gray-400">{amount}</span>}
          <span className="font-semibold text-gray-900 w-8 text-right">{value}</span>
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }} />
      </div>
      {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
    </div>
  )
}

// Stat summary tile
function StatTile({ icon: Icon, label, value, sub, color = 'bg-green-100', iconColor = 'text-green-600', trend }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon size={20} className={iconColor} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub  && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {trend != null && (
        <p className={`text-xs font-medium mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs prev period
        </p>
      )}
    </div>
  )
}

export default function ProviderAnalyticsPage() {
  const supabase  = createClient()
  const [days, setDays]         = useState('30')
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => { loadAnalytics() }, [days])

  const loadAnalytics = async () => {
    setLoading(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile  } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      const { data: sp } = await supabase
        .from('service_providers').select('id').eq('owner_user_id', profile.id).single()
      if (!sp) throw new Error('Provider not found')

      const providerId = sp.id
      const since = new Date(Date.now() - Number(days) * 86400000).toISOString()
      const prevSince = new Date(Date.now() - Number(days) * 2 * 86400000).toISOString()

      // ── Bookings ──────────────────────────────────────────────────────────
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, created_at, status:booking_statuses(code, display_name)')
        .eq('service_provider_id', providerId)
        .gte('created_at', since)

      const { count: prevBookings } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('service_provider_id', providerId)
        .gte('created_at', prevSince)
        .lt('created_at', since)

      // ── Work orders ───────────────────────────────────────────────────────
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, status:work_order_statuses(code), opened_at')
        .eq('service_provider_id', providerId)
        .gte('opened_at', since)

      // ── Revenue (paid receipts) ───────────────────────────────────────────
      const { data: receipts } = await supabase
        .from('receipts')
        .select('amount_paid, paid_at, invoice:invoices!invoice_id(service_provider_id)')
        .eq('invoice.service_provider_id', providerId)
        .gte('paid_at', since)

      const { data: prevReceipts } = await supabase
        .from('receipts')
        .select('amount_paid, invoice:invoices!invoice_id(service_provider_id)')
        .eq('invoice.service_provider_id', providerId)
        .gte('paid_at', prevSince)
        .lt('paid_at', since)

      const revenue     = receipts?.reduce((s, r) => s + Number(r.amount_paid || 0), 0) || 0
      const prevRevenue = prevReceipts?.reduce((s, r) => s + Number(r.amount_paid || 0), 0) || 0

      // ── Service breakdown from work_order_services ────────────────────────
      const { data: woServices } = await supabase
        .from('work_order_services')
        .select(`
          service:services(name),
          actual_cost, estimated_cost,
          work_order:work_orders!work_order_id(service_provider_id, opened_at)
        `)
        .eq('work_order.service_provider_id', providerId)
        .gte('work_order.opened_at', since)

      const serviceCounts = {}
      ;(woServices || []).forEach(ws => {
        const name = ws.service?.name || 'Unknown'
        if (!serviceCounts[name]) serviceCounts[name] = { count: 0, revenue: 0 }
        serviceCounts[name].count++
        serviceCounts[name].revenue += Number(ws.actual_cost || ws.estimated_cost || 0)
      })
      const topServices = Object.entries(serviceCounts)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)

      // ── Reviews ───────────────────────────────────────────────────────────
      const { data: reviews } = await supabase
        .from('provider_reviews')
        .select('rating, created_at')
        .eq('service_provider_id', providerId)
        .eq('is_approved', true)
        .gte('created_at', since)

      const ratingDist = { 5:0, 4:0, 3:0, 2:0, 1:0 }
      ;(reviews || []).forEach(r => { ratingDist[r.rating] = (ratingDist[r.rating] || 0) + 1 })
      const avgRating = reviews?.length
        ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
        : null

      // ── Booking status breakdown ──────────────────────────────────────────
      const statusCounts = {}
      ;(bookings || []).forEach(b => {
        const code = b.status?.display_name || 'Unknown'
        statusCounts[code] = (statusCounts[code] || 0) + 1
      })
      const bookingStatuses = Object.entries(statusCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)

      // ── Daily revenue for sparkline (last 30 days max) ────────────────────
      const dailyRevenue = {}
      ;(receipts || []).forEach(r => {
        const day = r.paid_at?.slice(0, 10)
        if (day) dailyRevenue[day] = (dailyRevenue[day] || 0) + Number(r.amount_paid || 0)
      })

      // ── Completed vs cancelled WO ratio ──────────────────────────────────
      const completedWOs  = (workOrders || []).filter(w => w.status?.code === 'completed').length
      const cancelledWOs  = (workOrders || []).filter(w => w.status?.code === 'cancelled').length

      // ── Trend helper ──────────────────────────────────────────────────────
      const trend = (curr, prev) =>
        prev === 0 ? null : Math.round(((curr - prev) / prev) * 100)

      setData({
        totalBookings:    bookings?.length || 0,
        completedWOs,
        cancelledWOs,
        revenue,
        avgRating,
        totalReviews:     reviews?.length || 0,
        topServices,
        bookingStatuses,
        ratingDist,
        dailyRevenue,
        trends: {
          bookings: trend(bookings?.length || 0, prevBookings || 0),
          revenue:  trend(revenue, prevRevenue),
        },
        totalWOs: workOrders?.length || 0,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

  // Build sparkline bars from daily revenue
  const SparkLine = () => {
    if (!data?.dailyRevenue) return null
    const entries = Object.entries(data.dailyRevenue).sort(([a],[b]) => a.localeCompare(b))
    if (entries.length < 2) return null
    const max = Math.max(...entries.map(([,v]) => v))
    return (
      <div className="flex items-end gap-0.5 h-10 mt-2">
        {entries.map(([day, val]) => (
          <div key={day} title={`${day}: ${fmt(val)}`}
            className="flex-1 bg-green-400 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            style={{ height: `${max > 0 ? Math.max(4, Math.round((val/max)*40)) : 4}px` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={24} className="text-green-600" /> Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">Performance overview for your garage</p>
        </div>
        <div className="relative">
          <select value={days} onChange={e => setDays(e.target.value)}
            className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 appearance-none bg-white">
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin text-green-600" size={32} />
        </div>
      ) : data && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={Calendar}   label="Total Bookings"   value={data.totalBookings}
              color="bg-blue-100" iconColor="text-blue-600" trend={data.trends.bookings} />
            <StatTile icon={Wrench}     label="Work Orders"      value={data.totalWOs}
              sub={`${data.completedWOs} completed · ${data.cancelledWOs} cancelled`}
              color="bg-orange-100" iconColor="text-orange-600" />
            <StatTile icon={DollarSign} label="Revenue"          value={fmt(data.revenue)}
              color="bg-green-100" iconColor="text-green-600" trend={data.trends.revenue} />
            <StatTile icon={Star}       label="Avg Rating"
              value={data.avgRating ? `${data.avgRating} / 5` : 'No reviews'}
              sub={data.totalReviews > 0 ? `${data.totalReviews} review${data.totalReviews !== 1 ? 's' : ''}` : null}
              color="bg-yellow-100" iconColor="text-yellow-500" />
          </div>

          {/* Revenue trend sparkline */}
          {Object.keys(data.dailyRevenue || {}).length > 1 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">Daily Revenue</p>
                <p className="text-base font-bold text-green-700">{fmt(data.revenue)}</p>
              </div>
              <p className="text-xs text-gray-400 mb-2">Total for selected period</p>
              <SparkLine />
            </div>
          )}

          {/* Two-column: services + booking statuses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Top services */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Wrench size={15} className="text-gray-400" /> Top Services
              </h2>
              {data.topServices.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No service data yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.topServices.map((svc, i) => (
                    <Bar key={i}
                      value={svc.count}
                      max={data.topServices[0].count}
                      label={svc.name}
                      amount={svc.revenue > 0 ? fmt(svc.revenue) : null}
                      color={['bg-green-500','bg-blue-500','bg-purple-500','bg-orange-500',
                              'bg-pink-500','bg-cyan-500','bg-yellow-500','bg-red-500'][i] || 'bg-gray-400'}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Review distribution */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Star size={15} className="text-yellow-400" fill="currentColor" /> Review Distribution
              </h2>
              {data.totalReviews === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No reviews in this period.</p>
              ) : (
                <div className="space-y-3">
                  {[5,4,3,2,1].map(n => (
                    <div key={n} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-8 flex-shrink-0 flex items-center gap-0.5">
                        {n}<Star size={10} className="text-yellow-400" fill="currentColor" />
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-yellow-400 transition-all duration-500"
                          style={{ width: `${data.totalReviews > 0 ? Math.round((data.ratingDist[n] / data.totalReviews) * 100) : 0}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 w-6 text-right flex-shrink-0">
                        {data.ratingDist[n]}
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                    <span>{data.totalReviews} review{data.totalReviews !== 1 ? 's' : ''}</span>
                    <span className="font-semibold text-gray-700">{data.avgRating} avg</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Booking status breakdown */}
          {data.bookingStatuses.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar size={15} className="text-gray-400" /> Booking Status Breakdown
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.bookingStatuses.map((s, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-gray-900">{s.count}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completion rate */}
          {data.totalWOs > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Work Order Completion Rate</h2>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Completed</span>
                    <span>{Math.round((data.completedWOs / data.totalWOs) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className="h-3 rounded-full bg-green-500 transition-all duration-500"
                      style={{ width: `${Math.round((data.completedWOs / data.totalWOs) * 100)}%` }} />
                  </div>
                </div>
                <div className="text-center flex-shrink-0">
                  <p className="text-2xl font-bold text-green-700">
                    {Math.round((data.completedWOs / data.totalWOs) * 100)}%
                  </p>
                  <p className="text-xs text-gray-400">{data.completedWOs}/{data.totalWOs} WOs</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}