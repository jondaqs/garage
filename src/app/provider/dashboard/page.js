'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, DollarSign, Wrench, Clock,
  CheckCircle, AlertCircle, Star, Bell, ClipboardList,
  ChevronRight, Loader2, Users, Activity,
  Car, BookOpen
} from 'lucide-react'
import LowStockAlerts from '@/components/provider/LowStockAlerts'
import useProviderAccess from '@/hooks/useProviderAccess'
import ProviderAccessBanner from '@/components/ProviderAccessBanner'

function StarRow({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} size={14}
          className={s <= rating ? 'text-yellow-400' : 'text-gray-300'}
          fill={s <= rating ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

// Activity item icon + colour by type/status
function ActivityDot({ type, status }) {
  const map = {
    completed:        'bg-green-500',
    approved:         'bg-cyan-500',
    awaiting_approval:'bg-yellow-500',
    closed:           'bg-gray-400',
    booking:          'bg-blue-500',
  }
  const key = type === 'booking' ? 'booking' : (status?.toLowerCase().replace(/\s+/g,'_') || 'default')
  return (
    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${map[key] || 'bg-gray-300'}`} />
  )
}

export default function ProviderDashboard() {
  const supabase = createClient()
  const router   = useRouter()
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const providerAccess = useProviderAccess()

  useEffect(() => { loadDashboardData() }, [])

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc(
        'get_provider_dashboard_stats',
        { p_provider_user_id: user.id }
      )
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setStats(result)
    } catch (err) {
      console.error('Dashboard error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin h-10 w-10 text-green-600" />
    </div>
  )

  if (error || !stats) return (
    <div className="flex justify-center items-center h-64">
      <div className="text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p className="text-gray-600 text-sm">{error || 'Failed to load dashboard'}</p>
      </div>
    </div>
  )

  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

  const statCards = [
    {
      name:   "Today's Bookings",
      value:  stats.today_bookings,
      icon:   Calendar,
      bg:     'bg-blue-100',
      icon_c: 'text-blue-600',
      href:   '/provider/bookings',
    },
    {
      name:   'Active Work Orders',
      value:  stats.active_work_orders,
      icon:   ClipboardList,
      bg:     'bg-orange-100',
      icon_c: 'text-orange-600',
      href:   '/provider/work-orders',
    },
    {
      name:   'Monthly Revenue',
      value:  fmt(stats.monthly_revenue),
      icon:   DollarSign,
      bg:     'bg-green-100',
      icon_c: 'text-green-600',
    },
    {
      name:   'Total Customers',
      value:  stats.total_customers ?? 0,
      icon:   Users,
      bg:     'bg-purple-100',
      icon_c: 'text-purple-600',
    },
    {
      name:   'Pending Approvals',
      value:  stats.pending_approvals,
      icon:   Clock,
      bg:     stats.pending_approvals > 0 ? 'bg-yellow-100' : 'bg-gray-100',
      icon_c: stats.pending_approvals > 0 ? 'text-yellow-600' : 'text-gray-400',
      href:   '/provider/work-orders',
    },
  ]

  const recentActivity = stats.recent_activity || []

  const formatEventTime = (ts) => {
    if (!ts) return ''
    const d    = new Date(ts)
    const now  = new Date()
    const diff = Math.floor((now - d) / 60000)
    if (diff < 1)   return 'Just now'
    if (diff < 60)  return `${diff}m ago`
    const hrs = Math.floor(diff / 60)
    if (hrs < 24)   return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7)   return `${days}d ago`
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">Here's what's happening at your garage today.</p>
      </div>

      {/* Subscription banner */}
      {!providerAccess.loading && (
        <>
          <div className="hidden md:block"><ProviderAccessBanner {...providerAccess} /></div>
          <div className="md:hidden"><ProviderAccessBanner {...providerAccess} compact /></div>
        </>
      )}

      {/* Pending approvals banner */}
      {stats.pending_approvals > 0 && (
        <div onClick={() => router.push('/provider/work-orders')}
          className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:bg-yellow-100 transition-colors">
          <div className="flex items-center gap-3">
            <Bell className="text-yellow-600 flex-shrink-0" size={20} />
            <div>
              <p className="font-semibold text-yellow-900 text-sm">
                {stats.pending_approvals} work order{stats.pending_approvals > 1 ? 's' : ''} awaiting customer approval
              </p>
              <p className="text-yellow-700 text-xs mt-0.5">
                Customers need to approve estimates before work can begin.
              </p>
            </div>
          </div>
          <ChevronRight className="text-yellow-600 flex-shrink-0" size={18} />
        </div>
      )}

      {/* Stat cards — 3 cols on md, 5 stretched on xl */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.name}
              onClick={() => card.href && router.push(card.href)}
              className={`bg-white rounded-xl shadow-sm p-5 ${
                card.href ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
              }`}>
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                <Icon size={20} className={card.icon_c} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-500 mt-1 leading-snug">{card.name}</p>
            </div>
          )
        })}
      </div>

      {/* Rating card */}
      <div className="bg-gradient-to-r from-green-500 to-green-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-90 mb-1">Your Rating</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">
                {Number(stats.average_rating || 0).toFixed(1)}
              </span>
              <span className="text-xl opacity-80">/ 5.0</span>
            </div>
            <div className="flex gap-1 mt-2">
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={18}
                  className={s <= Math.round(stats.average_rating || 0) ? 'text-yellow-300' : 'text-white/30'}
                  fill={s <= Math.round(stats.average_rating || 0) ? 'currentColor' : 'none'} />
              ))}
            </div>
            <p className="text-sm mt-2 opacity-80">
              Based on {stats.total_reviews || 0} review{stats.total_reviews !== 1 ? 's' : ''}
            </p>
          </div>
          <CheckCircle size={64} className="opacity-20" />
        </div>
      </div>

      {/* Two-column layout: Recent Activity + Recent Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-gray-400" /> Recent Activity
          </h2>

          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Activity size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No recent activity yet.</p>
              <p className="text-xs mt-1">
                Activity will appear here once you start receiving bookings.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200" />
              <div className="space-y-4 pl-6">
                {recentActivity.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (item.type === 'booking') router.push(`/provider/bookings/${item.id}`)
                      else router.push(`/provider/work-orders/${item.id}`)
                    }}
                    className="w-full text-left relative group"
                  >
                    {/* Dot on timeline */}
                    <div className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      item.type === 'booking' ? 'bg-blue-500'
                      : item.status?.includes('ompleted') ? 'bg-green-500'
                      : item.status?.includes('pproved') && !item.status?.includes('waiting') ? 'bg-cyan-500'
                      : item.status?.includes('waiting') ? 'bg-yellow-500'
                      : 'bg-gray-400'
                    }`} />
                    <div className="flex items-start justify-between gap-2 group-hover:bg-gray-50 rounded-lg p-1.5 -ml-1.5 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-1">
                          {item.title}
                        </p>
                        {item.subtitle && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Car size={10} /> {item.subtitle}
                          </p>
                        )}
                        {item.booking_date && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(item.booking_date).toLocaleDateString('en-KE', {
                              weekday: 'short', day: 'numeric', month: 'short'
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-gray-400 whitespace-nowrap">
                          {formatEventTime(item.event_time)}
                        </p>
                        {item.status && (
                          <span className="text-xs text-gray-500 mt-0.5 block">{item.status}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Reviews */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Star size={16} className="text-yellow-400" fill="currentColor" /> Recent Reviews
          </h2>

          {!stats.recent_reviews?.length ? (
            <div className="text-center py-8 text-gray-400">
              <Star size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No reviews yet.</p>
              <p className="text-xs mt-1">Customer reviews will appear here after service.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.recent_reviews.map((rev, i) => (
                <div key={rev.id || i}
                  className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-green-700">
                    {rev.customer?.first_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StarRow rating={rev.rating} />
                      <span className="text-xs text-gray-400">
                        {rev.customer?.first_name} {rev.customer?.last_name}
                      </span>
                    </div>
                    {rev.title && (
                      <p className="text-sm font-medium text-gray-900">{rev.title}</p>
                    )}
                    {rev.body && (
                      <p className="text-sm text-gray-600 line-clamp-2">{rev.body}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(rev.created_at).toLocaleDateString('en-KE', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'View Bookings',  icon: Calendar,     href: '/provider/bookings'    },
            { label: 'Work Orders',    icon: ClipboardList,href: '/provider/work-orders' },
            { label: 'Inventory',      icon: Wrench,       href: '/provider/inventory'   },
          ].map(a => {
            const Icon = a.icon
            return (
              <button key={a.label} onClick={() => router.push(a.href)}
                className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-colors text-left">
                <Icon size={20} className="text-green-600 flex-shrink-0" />
                <span className="font-medium text-gray-900 text-sm">{a.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <LowStockAlerts />
    </div>
  )
}