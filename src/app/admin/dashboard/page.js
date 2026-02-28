'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, Clock, CheckCircle, AlertTriangle, TrendingUp, Building2 } from 'lucide-react'
import Link from 'next/link'

export default function AdminDashboard() {
  const supabase = createClient()
  const [stats, setStats] = useState({
    totalProviders: 0,
    pendingProviders: 0,
    activeProviders: 0,
    totalUsers: 0,
    newThisWeek: 0
  })
  const [recentProviders, setRecentProviders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Get provider stats
      const { data: allProviders } = await supabase
        .from('service_providers')
        .select('*, owner:user_profiles(first_name, last_name, email)')
      
      const pending = allProviders?.filter(p => p.status === 'pending_verification').length || 0
      const active = allProviders?.filter(p => p.status === 'active').length || 0

      // Get total users
      const { count: userCount } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })

      // Get recent providers
      const { data: recent } = await supabase
        .from('service_providers')
        .select('*, owner:user_profiles(first_name, last_name, email), provider_type:service_provider_types(display_name)')
        .order('created_at', { ascending: false })
        .limit(5)

      setStats({
        totalProviders: allProviders?.length || 0,
        pendingProviders: pending,
        activeProviders: active,
        totalUsers: userCount || 0,
        newThisWeek: pending
      })

      setRecentProviders(recent || [])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      name: 'Pending Approvals',
      value: stats.pendingProviders,
      icon: Clock,
      color: 'yellow',
      href: '/admin/providers'
    },
    {
      name: 'Active Providers',
      value: stats.activeProviders,
      icon: CheckCircle,
      color: 'green'
    },
    {
      name: 'Total Providers',
      value: stats.totalProviders,
      icon: Building2,
      color: 'blue'
    },
    {
      name: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'purple'
    }
  ]

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">Manage service providers and users</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon
          const CardWrapper = stat.href ? Link : 'div'
          
          return (
            <CardWrapper
              key={stat.name}
              href={stat.href || '#'}
              className={`bg-white overflow-hidden shadow rounded-lg ${stat.href ? 'hover:shadow-lg transition cursor-pointer' : ''}`}
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
                      <dt className="text-sm font-medium text-gray-500 truncate">{stat.name}</dt>
                      <dd className="text-3xl font-semibold text-gray-900">{stat.value}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </CardWrapper>
          )
        })}
      </div>

      {/* Recent Providers */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Recent Provider Registrations</h2>
          <Link href="/admin/providers" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            View all →
          </Link>
        </div>
        <div className="divide-y divide-gray-200">
          {recentProviders.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">No providers yet</div>
          ) : (
            recentProviders.map((provider) => (
              <div key={provider.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h3 className="text-sm font-medium text-gray-900">{provider.name}</h3>
                      <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-full ${
                        provider.status === 'pending_verification' ? 'bg-yellow-100 text-yellow-800' :
                        provider.status === 'active' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {provider.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {provider.owner?.first_name} {provider.owner?.last_name} · {provider.owner?.email}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {provider.provider_type?.display_name} · {new Date(provider.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {provider.status === 'pending_verification' && (
                    <Link
                      href={`/admin/providers/${provider.id}`}
                      className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                    >
                      Review
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
