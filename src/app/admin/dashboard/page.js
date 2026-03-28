'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, Clock, CheckCircle, AlertTriangle, TrendingUp, Building2, Mail } from 'lucide-react'
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

      {/* Main Grid Layout - 2 columns on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Email Queue Widget */}
          <EmailQueueWidget />

          {/* Add other widgets here if needed */}
        </div>
      </div>
    </div>
  )
}

// Email Queue Widget Component
function EmailQueueWidget() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const response = await fetch('/api/email-queue?limit=1')
      const data = await response.json()
      
      if (response.ok) {
        setStats(data.statistics)
      }
    } catch (error) {
      console.error('Load email stats error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Mail className="h-5 w-5 text-blue-600 mr-2" />
            <h3 className="text-lg font-bold text-gray-900">Email Queue</h3>
          </div>
          <Link
            href="/admin/email-queue"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            View All →
          </Link>
        </div>
      </div>

      {stats ? (
        <div className="p-6">
          <div className="space-y-4">
            {/* Total Emails */}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Emails</span>
              <span className="text-2xl font-bold text-gray-900">{stats.total_emails || 0}</span>
            </div>

            {/* Success Rate */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600">Success Rate</span>
                <span className="text-lg font-bold text-green-600">
                  {stats.success_rate || 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${stats.success_rate || 0}%` }}
                ></div>
              </div>
            </div>

            {/* Status Breakdown */}
            <div className="pt-4 border-t border-gray-200 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                  Sent
                </span>
                <span className="font-medium text-green-600">{stats.sent_emails || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center">
                  <Clock className="h-4 w-4 text-yellow-600 mr-1" />
                  Pending
                </span>
                <span className="font-medium text-yellow-600">{stats.pending_emails || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center">
                  <AlertTriangle className="h-4 w-4 text-red-600 mr-1" />
                  Failed
                </span>
                <span className="font-medium text-red-600">{stats.failed_emails || 0}</span>
              </div>
            </div>

            {/* Alert if there are failures */}
            {stats.failed_emails > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-800 font-medium">
                      {stats.failed_emails} failed email{stats.failed_emails !== 1 ? 's' : ''}
                    </p>
                    <Link
                      href="/admin/email-queue?status=failed"
                      className="text-sm text-red-600 hover:text-red-800 underline mt-1 inline-block"
                    >
                      View failed emails →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500">
          <p>No email data available</p>
        </div>
      )}
    </div>
  )
}