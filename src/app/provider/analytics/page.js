'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TrendingUp, DollarSign, Users, Star,
  Calendar, Wrench, Loader2, AlertCircle,
  ChevronDown, Store, UserCheck, Car, Building2, Crown
} from 'lucide-react'

const PERIODS = [
  { value: '7',  label: 'Last 7 days'  },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 3 months'},
  { value: '365',label: 'Last year'    },
]

const WO_STATUS_COLORS = {
  open:              { bg: 'bg-blue-500',    text: 'text-blue-700',   light: 'bg-blue-50'    },
  in_progress:       { bg: 'bg-amber-500',   text: 'text-amber-700',  light: 'bg-amber-50'   },
  completed:         { bg: 'bg-green-500',   text: 'text-green-700',  light: 'bg-green-50'   },
  cancelled:         { bg: 'bg-red-500',     text: 'text-red-700',    light: 'bg-red-50'     },
  pending_approval:  { bg: 'bg-purple-500',  text: 'text-purple-700', light: 'bg-purple-50'  },
  estimate_sent:     { bg: 'bg-indigo-500',  text: 'text-indigo-700', light: 'bg-indigo-50'  },
  invoiced:          { bg: 'bg-teal-500',    text: 'text-teal-700',   light: 'bg-teal-50'    },
  checked_in:        { bg: 'bg-cyan-500',    text: 'text-cyan-700',   light: 'bg-cyan-50'    },
  qc_passed:         { bg: 'bg-emerald-500', text: 'text-emerald-700',light: 'bg-emerald-50' },
  default:           { bg: 'bg-gray-500',    text: 'text-gray-700',   light: 'bg-gray-50'    },
}

function getWOColor(code) {
  return WO_STATUS_COLORS[code] || WO_STATUS_COLORS.default
}

// Simple bar
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

// Donut chart for work order status
function DonutChart({ statuses, total }) {
  if (!statuses || statuses.length === 0 || total === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No work orders in this period.</p>
  }
  const size = 140
  const stroke = 20
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none"
            stroke="#f3f4f6" strokeWidth={stroke} />
          {statuses.map((s, i) => {
            const pct = s.count / total
            const dash = pct * circumference
            const gap = circumference - dash
            const currentOffset = offset
            offset += dash
            const colorClass = getWOColor(s.code)
            // Map tailwind colors to hex for SVG
            const colorMap = {
              'bg-blue-500': '#3b82f6', 'bg-amber-500': '#f59e0b', 'bg-green-500': '#22c55e',
              'bg-red-500': '#ef4444', 'bg-purple-500': '#a855f7', 'bg-indigo-500': '#6366f1',
              'bg-teal-500': '#14b8a6', 'bg-cyan-500': '#06b6d4', 'bg-emerald-500': '#10b981',
              'bg-gray-500': '#6b7280',
            }
            return (
              <circle key={i} cx={size/2} cy={size/2} r={radius} fill="none"
                stroke={colorMap[colorClass.bg] || '#6b7280'}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-currentOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${size/2} ${size/2})`}
                className="transition-all duration-700"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl font-bold text-gray-900">{total}</p>
          <p className="text-[10px] text-gray-400">Total</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 w-full">
        {statuses.map((s, i) => {
          const pct = Math.round((s.count / total) * 100)
          const colorClass = getWOColor(s.code)
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`w-3 h-3 rounded-full ${colorClass.bg} flex-shrink-0`} />
              <span className="text-gray-600 truncate flex-1">{s.display_name}</span>
              <span className="font-semibold text-gray-900 flex-shrink-0">{s.count}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${colorClass.light} ${colorClass.text} flex-shrink-0`}>
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ProviderAnalyticsPage() {
  const supabase  = createClient()
  const [days, setDays]         = useState('30')
  const [shopId, setShopId]     = useState('all')
  const [shops, setShops]       = useState([])
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const dailyScrollRef = useRef(null)

  useEffect(() => { loadShops() }, [])
  useEffect(() => { loadAnalytics() }, [days, shopId])

  const loadShops = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { data: sp } = await supabase
        .from('service_providers').select('id').eq('owner_user_id', profile.id).single()
      if (!sp) return
      const { data: shopList } = await supabase
        .from('shops').select('id, name').eq('service_provider_id', sp.id).eq('is_active', true).order('name')
      setShops(shopList || [])
    } catch (_) {}
  }

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
      const shopFilter = shopId !== 'all' ? shopId : null

      // ── Bookings ──────────────────────────────────────────────────────────
      let bookingsQ = supabase
        .from('bookings')
        .select('id, created_at, status:booking_statuses(code, display_name), vehicle_id')
        .eq('service_provider_id', providerId)
        .gte('created_at', since)
      if (shopFilter) bookingsQ = bookingsQ.eq('shop_id', shopFilter)
      const { data: bookings } = await bookingsQ

      let prevBookingsQ = supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('service_provider_id', providerId)
        .gte('created_at', prevSince)
        .lt('created_at', since)
      if (shopFilter) prevBookingsQ = prevBookingsQ.eq('shop_id', shopFilter)
      const { count: prevBookings } = await prevBookingsQ

      // ── Work orders ───────────────────────────────────────────────────────
      let woQ = supabase
        .from('work_orders')
        .select(`
          id, opened_at, assigned_mechanic_id, vehicle_id, shop_id,
          status:work_order_statuses(code, display_name),
          invoice:invoices(id, total_amount, issued_to_user_id, vehicle_id)
        `)
        .eq('service_provider_id', providerId)
        .gte('opened_at', since)
      if (shopFilter) woQ = woQ.eq('shop_id', shopFilter)
      const { data: workOrders } = await woQ

      // ── Revenue (paid receipts) ───────────────────────────────────────────
      const { data: receipts } = await supabase
        .from('receipts')
        .select(`
          amount_paid, paid_at,
          invoice:invoices!invoice_id(service_provider_id, work_order_id, issued_to_user_id, vehicle_id,
            work_order:work_orders!work_order_id(shop_id))
        `)
        .eq('invoice.service_provider_id', providerId)
        .gte('paid_at', since)

      const { data: prevReceipts } = await supabase
        .from('receipts')
        .select('amount_paid, invoice:invoices!invoice_id(service_provider_id, work_order_id, work_order:work_orders!work_order_id(shop_id))')
        .eq('invoice.service_provider_id', providerId)
        .gte('paid_at', prevSince)
        .lt('paid_at', since)

      // Filter receipts by shop if needed
      const filteredReceipts = shopFilter
        ? (receipts || []).filter(r => r.invoice?.work_order?.shop_id === shopFilter)
        : (receipts || [])
      const filteredPrevReceipts = shopFilter
        ? (prevReceipts || []).filter(r => r.invoice?.work_order?.shop_id === shopFilter)
        : (prevReceipts || [])

      const revenue     = filteredReceipts.reduce((s, r) => s + Number(r.amount_paid || 0), 0)
      const prevRevenue = filteredPrevReceipts.reduce((s, r) => s + Number(r.amount_paid || 0), 0)

      // ── Service breakdown from work_order_services ────────────────────────
      const { data: woServices } = await supabase
        .from('work_order_services')
        .select(`
          service:services(name),
          actual_cost, estimated_cost,
          work_order:work_orders!work_order_id(service_provider_id, opened_at, shop_id)
        `)
        .eq('work_order.service_provider_id', providerId)
        .gte('work_order.opened_at', since)

      const filteredWoServices = shopFilter
        ? (woServices || []).filter(ws => ws.work_order?.shop_id === shopFilter)
        : (woServices || [])

      const serviceCounts = {}
      filteredWoServices.forEach(ws => {
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

      // ── Work order status breakdown (for donut) ───────────────────────────
      const woStatusCounts = {}
      ;(workOrders || []).forEach(wo => {
        const code = wo.status?.code || 'unknown'
        const display = wo.status?.display_name || 'Unknown'
        if (!woStatusCounts[code]) woStatusCounts[code] = { code, display_name: display, count: 0 }
        woStatusCounts[code].count++
      })
      const woStatuses = Object.values(woStatusCounts).sort((a, b) => b.count - a.count)

      // ── Daily revenue ─────────────────────────────────────────────────────
      const dailyRevenue = {}
      filteredReceipts.forEach(r => {
        const day = r.paid_at?.slice(0, 10)
        if (day) dailyRevenue[day] = (dailyRevenue[day] || 0) + Number(r.amount_paid || 0)
      })

      // ── Completed vs cancelled WO ratio ───────────────────────────────────
      const completedWOs  = (workOrders || []).filter(w => w.status?.code === 'completed').length
      const cancelledWOs  = (workOrders || []).filter(w => w.status?.code === 'cancelled').length

      // ── Top Customers (by WO count and revenue) ───────────────────────────
      const customerMap = {}
      for (const wo of (workOrders || [])) {
        const inv = wo.invoice
        if (!inv?.issued_to_user_id) continue
        const uid = inv.issued_to_user_id
        if (!customerMap[uid]) customerMap[uid] = { userId: uid, woCount: 0, revenue: 0 }
        customerMap[uid].woCount++
        customerMap[uid].revenue += Number(inv.total_amount || 0)
      }
      // Also add receipt revenue
      for (const r of filteredReceipts) {
        const uid = r.invoice?.issued_to_user_id
        if (!uid) continue
        if (!customerMap[uid]) customerMap[uid] = { userId: uid, woCount: 0, revenue: 0 }
        // Revenue from receipts (actual paid)
      }
      const topCustomerIds = Object.values(customerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

      // Fetch customer names
      let topCustomers = []
      if (topCustomerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, company_id')
          .in('id', topCustomerIds.map(c => c.userId))
        const profileMap = {}
        ;(profiles || []).forEach(p => { profileMap[p.id] = p })
        topCustomers = topCustomerIds.map(c => ({
          ...c,
          name: profileMap[c.userId]
            ? `${profileMap[c.userId].first_name || ''} ${profileMap[c.userId].last_name || ''}`.trim() || 'Unnamed'
            : 'Unknown',
          companyId: profileMap[c.userId]?.company_id || null,
        }))
      }

      // ── Top Companies (by vehicle WOs) ────────────────────────────────────
      // Get vehicles from WOs, then find company ownership
      const vehicleIdsFromWOs = [...new Set((workOrders || []).map(wo => wo.vehicle_id).filter(Boolean))]
      let topCompanies = []
      if (vehicleIdsFromWOs.length > 0) {
        const { data: ownerships } = await supabase
          .from('vehicle_ownership')
          .select('vehicle_id, owner_company_id')
          .in('vehicle_id', vehicleIdsFromWOs)
          .not('owner_company_id', 'is', null)

        if (ownerships && ownerships.length > 0) {
          const companyWOMap = {}
          const vehicleCompanyMap = {}
          ownerships.forEach(o => { vehicleCompanyMap[o.vehicle_id] = o.owner_company_id })

          ;(workOrders || []).forEach(wo => {
            const compId = vehicleCompanyMap[wo.vehicle_id]
            if (!compId) return
            if (!companyWOMap[compId]) companyWOMap[compId] = { companyId: compId, woCount: 0, revenue: 0 }
            companyWOMap[compId].woCount++
            companyWOMap[compId].revenue += Number(wo.invoice?.total_amount || 0)
          })

          const topCompanyIds = Object.values(companyWOMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
          if (topCompanyIds.length > 0) {
            const { data: companyProfiles } = await supabase
              .from('company_profiles')
              .select('id, name')
              .in('id', topCompanyIds.map(c => c.companyId))
            const compMap = {}
            ;(companyProfiles || []).forEach(c => { compMap[c.id] = c.name })
            topCompanies = topCompanyIds.map(c => ({
              ...c,
              name: compMap[c.companyId] || 'Unknown Company',
            }))
          }
        }
      }

      // ── Shop performance (revenue per shop) ───────────────────────────────
      let shopPerformance = []
      if (!shopFilter) {
        const shopRevMap = {}
        filteredReceipts.forEach(r => {
          const sid = r.invoice?.work_order?.shop_id
          if (!sid) return
          if (!shopRevMap[sid]) shopRevMap[sid] = { shopId: sid, revenue: 0, woCount: 0 }
          shopRevMap[sid].revenue += Number(r.amount_paid || 0)
        })
        ;(workOrders || []).forEach(wo => {
          const sid = wo.shop_id
          if (!sid) return
          if (!shopRevMap[sid]) shopRevMap[sid] = { shopId: sid, revenue: 0, woCount: 0 }
          shopRevMap[sid].woCount++
        })
        const shopIds = Object.keys(shopRevMap)
        if (shopIds.length > 0) {
          const { data: shopNames } = await supabase
            .from('shops').select('id, name').in('id', shopIds)
          const nameMap = {}
          ;(shopNames || []).forEach(s => { nameMap[s.id] = s.name })
          shopPerformance = Object.values(shopRevMap)
            .map(s => ({ ...s, name: nameMap[s.shopId] || 'Unknown Shop' }))
            .sort((a, b) => b.revenue - a.revenue)
        }
      }

      // ── Mechanic performance ──────────────────────────────────────────────
      const mechMap = {}
      ;(workOrders || []).forEach(wo => {
        const mid = wo.assigned_mechanic_id
        if (!mid) return
        if (!mechMap[mid]) mechMap[mid] = { mechanicId: mid, totalWOs: 0, completed: 0, acknowledged: 0, declined: 0 }
        mechMap[mid].totalWOs++
        if (wo.status?.code === 'completed') mechMap[mid].completed++
      })

      // Get all WOs for mechanic assignment counts (not just period-filtered)
      let mechanicsQ = supabase
        .from('mechanics')
        .select('id, user_id, specialization, user:user_profiles!user_id(first_name, last_name)')
        .eq('service_provider_id', providerId)
        .eq('is_active', true)
      const { data: mechanics } = await mechanicsQ

      // Count currently assigned vehicles per mechanic (active WOs)
      const { data: activeWOs } = await supabase
        .from('work_orders')
        .select('assigned_mechanic_id, vehicle_id, status:work_order_statuses(code)')
        .eq('service_provider_id', providerId)
        .not('assigned_mechanic_id', 'is', null)
      
      const mechVehicleMap = {}
      ;(activeWOs || []).forEach(wo => {
        const mid = wo.assigned_mechanic_id
        if (!mid) return
        // Count only non-terminal WOs
        const terminal = ['completed', 'cancelled', 'closed']
        if (terminal.includes(wo.status?.code)) return
        if (!mechVehicleMap[mid]) mechVehicleMap[mid] = new Set()
        if (wo.vehicle_id) mechVehicleMap[mid].add(wo.vehicle_id)
      })

      const mechanicPerformance = (mechanics || []).map(m => {
        const stats = mechMap[m.id] || { totalWOs: 0, completed: 0 }
        return {
          mechanicId: m.id,
          name: m.user ? `${m.user.first_name || ''} ${m.user.last_name || ''}`.trim() : 'Unknown',
          specialization: m.specialization,
          totalWOs: stats.totalWOs,
          completed: stats.completed,
          completionRate: stats.totalWOs > 0 ? Math.round((stats.completed / stats.totalWOs) * 100) : 0,
          assignedVehicles: mechVehicleMap[m.id]?.size || 0,
        }
      }).sort((a, b) => b.totalWOs - a.totalWOs)

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
        woStatuses,
        topCustomers,
        topCompanies,
        shopPerformance,
        mechanicPerformance,
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

  // Daily revenue bar chart with labels and horizontal scroll
  const DailyRevenueChart = () => {
    if (!data?.dailyRevenue) return null
    const entries = Object.entries(data.dailyRevenue).sort(([a],[b]) => a.localeCompare(b))
    if (entries.length < 2) return null
    const max = Math.max(...entries.map(([,v]) => v))

    const formatDay = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00')
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    }

    return (
      <div ref={dailyScrollRef}
        className="overflow-x-auto pb-2 -mx-2 px-2"
        style={{ scrollbarWidth: 'thin' }}>
        <div className="flex items-end gap-1.5"
          style={{ minWidth: entries.length > 15 ? `${entries.length * 44}px` : '100%', height: '160px' }}>
          {entries.map(([day, val]) => {
            const barH = max > 0 ? Math.max(8, Math.round((val / max) * 120)) : 8
            return (
              <div key={day} className="flex flex-col items-center flex-1" style={{ minWidth: '40px' }}>
                <span className="text-[10px] text-gray-500 mb-1 font-medium">
                  {fmt(val).replace('KES ', '')}
                </span>
                <div className="w-full flex justify-center">
                  <div
                    className="w-7 bg-green-400 rounded-t hover:bg-green-500 transition-colors cursor-default"
                    style={{ height: `${barH}px` }}
                    title={`${day}: ${fmt(val)}`}
                  />
                </div>
                <span className="text-[9px] text-gray-400 mt-1.5 whitespace-nowrap">
                  {formatDay(day)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={24} className="text-green-600" /> Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">Performance overview for your garage</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Shop filter */}
          {shops.length > 1 && (
            <div className="relative">
              <select value={shopId} onChange={e => setShopId(e.target.value)}
                className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 appearance-none bg-white">
                <option value="all">All Shops</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Store size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          {/* Period filter */}
          <div className="relative">
            <select value={days} onChange={e => setDays(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 appearance-none bg-white">
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
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

          {/* Daily Revenue chart */}
          {Object.keys(data.dailyRevenue || {}).length > 1 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">Daily Revenue</p>
                <p className="text-base font-bold text-green-700">{fmt(data.revenue)}</p>
              </div>
              <p className="text-xs text-gray-400 mb-3">Total for selected period — scroll to see all days</p>
              <DailyRevenueChart />
            </div>
          )}

          {/* Work Order Status Donut + Booking statuses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Wrench size={15} className="text-gray-400" /> Work Order Status
              </h2>
              <DonutChart statuses={data.woStatuses} total={data.totalWOs} />
            </div>

            {/* Booking status breakdown */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar size={15} className="text-gray-400" /> Booking Status Breakdown
              </h2>
              {data.bookingStatuses.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No bookings in this period.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.bookingStatuses.map((s, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-gray-900">{s.count}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top Services + Review Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

          {/* Top Customers + Top Companies */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Customers */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Crown size={15} className="text-amber-500" /> Top Customers
              </h2>
              {data.topCustomers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No customer data yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.topCustomers.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                        i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-gray-300'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.woCount} work order{c.woCount !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-semibold text-green-700 flex-shrink-0">{fmt(c.revenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Companies */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 size={15} className="text-blue-500" /> Top Companies
              </h2>
              {data.topCompanies.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No company data yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.topCompanies.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                        i === 0 ? 'bg-blue-600' : i === 1 ? 'bg-blue-400' : i === 2 ? 'bg-blue-300' : 'bg-gray-300'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.woCount} work order{c.woCount !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-semibold text-green-700 flex-shrink-0">{fmt(c.revenue)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Shop Performance (only visible when All Shops selected) */}
          {data.shopPerformance.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Store size={15} className="text-purple-500" /> Revenue by Shop
              </h2>
              <div className="space-y-3">
                {data.shopPerformance.map((s, i) => (
                  <Bar key={i}
                    value={s.woCount}
                    max={data.shopPerformance[0].woCount || 1}
                    label={s.name}
                    amount={fmt(s.revenue)}
                    color={['bg-purple-500','bg-indigo-500','bg-violet-500','bg-fuchsia-500',
                            'bg-pink-500','bg-rose-500'][i] || 'bg-gray-400'}
                    sublabel={`${s.woCount} work order${s.woCount !== 1 ? 's' : ''}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Mechanic Performance */}
          {data.mechanicPerformance.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <UserCheck size={15} className="text-teal-500" /> Mechanic Performance
              </h2>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-500 py-2 px-2">Mechanic</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-2 px-2">Work Orders</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-2 px-2">Completed</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-2 px-2">Completion Rate</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-2 px-2">
                        <span className="flex items-center justify-center gap-1">
                          <Car size={12} /> Assigned Vehicles
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mechanicPerformance.map((m, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-2">
                          <p className="font-medium text-gray-900">{m.name || 'Unnamed'}</p>
                          {m.specialization && (
                            <p className="text-xs text-gray-400">{m.specialization}</p>
                          )}
                        </td>
                        <td className="text-center py-3 px-2 font-semibold text-gray-700">{m.totalWOs}</td>
                        <td className="text-center py-3 px-2 text-green-700 font-semibold">{m.completed}</td>
                        <td className="text-center py-3 px-2">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-2">
                              <div className="h-2 rounded-full bg-teal-500 transition-all duration-500"
                                style={{ width: `${m.completionRate}%` }} />
                            </div>
                            <span className="text-xs font-medium text-gray-600 w-8">{m.completionRate}%</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                            m.assignedVehicles > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'
                          }`}>
                            <Car size={12} />
                            {m.assignedVehicles}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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