'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  Calendar, DollarSign, Users, TrendingUp, Clock,
  CheckCircle, AlertCircle, Star
} from 'lucide-react'

export default function ProviderDashboard() {
  const supabase = createClient()
  const [stats, setStats] = useState({
    todayBookings: 0,
    pendingBookings: 0,
    monthlyRevenue: 0,
    totalCustomers: 0,
    averageRating: 0
  })
  const [recentBookings, setRecentBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Get current user and provider
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { data: provider } = await supabase
        .from('service_providers')
        .select('id')
        .eq('owner_user_id', profile.id)
        .single()

      if (provider) {
        // Load stats (implement these queries as needed)
        // For now, showing placeholder data
        setStats({
          todayBookings: 5,
          pendingBookings: 3,
          monthlyRevenue: 125000,
          totalCustomers: 48,
          averageRating: 4.8
        })

        // Load recent bookings (when booking system is implemented)
        setRecentBookings([])
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  const statCards = [
    {
      name: "Today's Bookings",
      value: stats.todayBookings,
      icon: Calendar,
      color: 'blue',
      change: '+12%'
    },
    {
      name: 'Pending Bookings',
      value: stats.pendingBookings,
      icon: Clock,
      color: 'yellow',
      change: '-3%'
    },
    {
      name: 'Monthly Revenue',
      value: `KES ${stats.monthlyRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'green',
      change: '+23%'
    },
    {
      name: 'Total Customers',
      value: stats.totalCustomers,
      icon: Users,
      color: 'purple',
      change: '+8%'
    }
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-gray-600 mt-1">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.name}
              className="bg-white overflow-hidden shadow rounded-lg"
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`h-12 w-12 rounded-lg bg-${stat.color}-100 flex items-center justify-center`}>
                      <Icon className={`h-6 w-6 text-${stat.color}-600`} />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {stat.name}
                      </dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">
                          {stat.value}
                        </div>
                        <div className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                          <TrendingUp className="h-4 w-4 mr-0.5" />
                          {stat.change}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rating Card */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2">Your Rating</h3>
            <div className="flex items-center">
              <Star className="h-8 w-8 fill-current mr-2" />
              <span className="text-4xl font-bold">{stats.averageRating}</span>
              <span className="text-xl ml-2 opacity-90">/5.0</span>
            </div>
            <p className="mt-2 opacity-90">Based on 127 reviews</p>
          </div>
          <div className="text-right">
            <CheckCircle className="h-16 w-16 opacity-20" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition">
            <Calendar className="h-6 w-6 text-green-600 mr-3" />
            <span className="font-medium text-gray-900">View Bookings</span>
          </button>
          <button className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition">
            <Users className="h-6 w-6 text-green-600 mr-3" />
            <span className="font-medium text-gray-900">Manage Team</span>
          </button>
          <button className="flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition">
            <TrendingUp className="h-6 w-6 text-green-600 mr-3" />
            <span className="font-medium text-gray-900">View Analytics</span>
          </button>
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
    </div>
  )
}
