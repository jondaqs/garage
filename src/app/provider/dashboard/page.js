'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
    Calendar, DollarSign, Wrench, TrendingUp, Clock,
    CheckCircle, AlertCircle, Star, Bell, ClipboardList,
    ChevronRight, Loader2
} from 'lucide-react'
import LowStockAlerts from '@/components/provider/LowStockAlerts'

function StarRow({ rating }) {
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={14}
                    className={s <= rating ? 'text-yellow-400' : 'text-gray-300'}
                    fill={s <= rating ? 'currentColor' : 'none'} />
            ))}
        </div>
    )
}

export default function ProviderDashboard() {
    const supabase = createClient()
    const router = useRouter()
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

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
        { name: "Today's Bookings", value: stats.today_bookings, icon: Calendar, bg: 'bg-blue-100', icon_c: 'text-blue-600' },
        { name: 'Active Work Orders', value: stats.active_work_orders, icon: ClipboardList, bg: 'bg-orange-100', icon_c: 'text-orange-600', href: '/provider/work-orders' },
        { name: 'Monthly Revenue', value: fmt(stats.monthly_revenue), icon: DollarSign, bg: 'bg-green-100', icon_c: 'text-green-600' },
        {
            name: 'Pending Approvals', value: stats.pending_approvals, icon: Clock,
            bg: stats.pending_approvals > 0 ? 'bg-yellow-100' : 'bg-gray-100',
            icon_c: stats.pending_approvals > 0 ? 'text-yellow-600' : 'text-gray-400',
            href: '/provider/work-orders'
        },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500 mt-1 text-sm">Here's what's happening at your garage today.</p>
            </div>

            {stats.pending_approvals > 0 && (
                <div onClick={() => router.push('/provider/work-orders')}
                    className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:bg-yellow-100 transition-colors">
                    <div className="flex items-center gap-3">
                        <Bell className="text-yellow-600 flex-shrink-0" size={20} />
                        <div>
                            <p className="font-semibold text-yellow-900 text-sm">
                                {stats.pending_approvals} work order{stats.pending_approvals > 1 ? 's' : ''} awaiting customer approval
                            </p>
                            <p className="text-yellow-700 text-xs mt-0.5">Customers need to approve estimates before work can begin.</p>
                        </div>
                    </div>
                    <ChevronRight className="text-yellow-600 flex-shrink-0" size={18} />
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map(card => {
                    const Icon = card.icon
                    return (
                        <div key={card.name}
                            onClick={() => card.href && router.push(card.href)}
                            className={`bg-white rounded-xl shadow-sm p-5 ${card.href ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
                            <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                                <Icon size={20} className={card.icon_c} />
                            </div>
                            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                            <p className="text-xs text-gray-500 mt-1">{card.name}</p>
                        </div>
                    )
                })}
            </div>

            <div className="bg-gradient-to-r from-green-500 to-green-700 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium opacity-90 mb-1">Your Rating</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold">{Number(stats.average_rating || 0).toFixed(1)}</span>
                            <span className="text-xl opacity-80">/ 5.0</span>
                        </div>
                        <div className="flex gap-1 mt-2">
                            {[1, 2, 3, 4, 5].map(s => (
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

            {stats.recent_reviews?.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-5">
                    <h2 className="text-base font-semibold text-gray-900 mb-4">Recent Reviews</h2>
                    <div className="space-y-4">
                        {stats.recent_reviews.map((rev, i) => (
                            <div key={rev.id || i} className="flex items-start gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-green-700">
                                    {rev.customer?.first_name?.[0] || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <StarRow rating={rev.rating} />
                                        <span className="text-xs text-gray-400">{rev.customer?.first_name} {rev.customer?.last_name}</span>
                                    </div>
                                    {rev.title && <p className="text-sm font-medium text-gray-900">{rev.title}</p>}
                                    {rev.body && <p className="text-sm text-gray-600 line-clamp-2">{rev.body}</p>}
                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(rev.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { label: 'View Bookings', icon: Calendar, href: '/provider/bookings' },
                        { label: 'Work Orders', icon: ClipboardList, href: '/provider/work-orders' },
                        { label: 'Inventory', icon: Wrench, href: '/provider/inventory' },
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
            {/* Recent Activity Placeholder */}
            <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
                <div className="text-center py-12 text-gray-500">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No recent activity to display</p>
                    <p className="text-sm mt-2">Activity will appear here once you start receiving bookings</p>
                </div>
            </div>
            <LowStockAlerts />
        </div>
    )
}