'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Clock, CheckCircle, AlertTriangle,
  Building2, Mail, Store
} from 'lucide-react'
import Link from 'next/link'

export default function AdminDashboard() {
  const supabase = createClient()

  const [stats, setStats] = useState({
    totalProviders: 0,
    pendingProviders: 0,
    activeProviders: 0,
    totalUsers: 0,
    totalCompanies: 0,
    pendingCompanies: 0,
    activeCompanies: 0,
  })
  const [recentProviders, setRecentProviders] = useState([])
  const [pendingCompanies, setPendingCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Run all fetches in parallel
      const [
        { data: allProviders },
        { count: userCount },
        { data: recentProviderData },
        { data: allCompanies },
        { data: recentPendingCompanies },
      ] = await Promise.all([
        // All providers for counts
        supabase
          .from('service_providers_secure')
          .select('id, status'),

        // Total user count
        supabase
          .from('user_profiles_secure')
          .select('*', { count: 'exact', head: true }),

        // Recent providers for the activity feed
        supabase
          .from('service_providers_secure')
          .select('id, name, status, created_at, owner:user_profiles(first_name, last_name, email), provider_type:service_provider_types(display_name)')
          .order('created_at', { ascending: false })
          .limit(5),

        // All companies for counts
        supabase
          .from('company_profiles_secure')
          .select('id, status'),

        // 5 most recent pending companies
        supabase
          .from('company_profiles_secure')
          .select('id, name, registration_number, status, submitted_at, owner:user_profiles!company_profiles_owner_user_id_fkey(first_name, last_name, email)')
          .eq('status', 'pending_verification')
          .order('submitted_at', { ascending: false })
          .limit(5),
      ])

      const pendingP = allProviders?.filter(p => p.status === 'pending_verification').length || 0
      const activeP = allProviders?.filter(p => p.status === 'active').length || 0
      const pendingC = allCompanies?.filter(c => c.status === 'pending_verification').length || 0
      const activeC = allCompanies?.filter(c => c.status === 'active').length || 0

      setStats({
        totalProviders: allProviders?.length || 0,
        pendingProviders: pendingP,
        activeProviders: activeP,
        totalUsers: userCount || 0,
        totalCompanies: allCompanies?.length || 0,
        pendingCompanies: pendingC,
        activeCompanies: activeC,
      })

      setRecentProviders(recentProviderData || [])
      setPendingCompanies(recentPendingCompanies || [])

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const providerStatCards = [
    {
      name: 'Pending Providers',
      value: stats.pendingProviders,
      icon: Clock,
      color: 'yellow',
      href: '/admin/providers',
    },
    {
      name: 'Active Providers',
      value: stats.activeProviders,
      icon: CheckCircle,
      color: 'green',
    },
    {
      name: 'Total Providers',
      value: stats.totalProviders,
      icon: Store,
      color: 'blue',
    },
    {
      name: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'purple',
    },
  ]

  const companyStatCards = [
    {
      name: 'Pending Companies',
      value: stats.pendingCompanies,
      icon: Clock,
      color: 'orange',
      href: '/admin/companies',
    },
    {
      name: 'Active Companies',
      value: stats.activeCompanies,
      icon: CheckCircle,
      color: 'teal',
    },
    {
      name: 'Total Companies',
      value: stats.totalCompanies,
      icon: Building2,
      color: 'indigo',
    },
  ]

  const StatusBadge = ({ status }) => {
    const map = {
      pending_verification: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      pending_info: 'bg-orange-100 text-orange-800',
      suspended: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${map[status] || 'bg-gray-100 text-gray-700'}`}>
        {status?.replace(/_/g, ' ')}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600 mt-1">Manage service providers, companies and users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Main content — 2 cols */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── Provider stats ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Service Providers
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {providerStatCards.map((stat) => {
                const Icon = stat.icon
                const Wrapper = stat.href ? Link : 'div'
                return (
                  <Wrapper
                    key={stat.name}
                    href={stat.href || '#'}
                    className={`bg-white overflow-hidden shadow rounded-lg p-4 ${stat.href ? 'hover:shadow-md transition cursor-pointer' : ''}`}
                  >
                    <div className={`inline-flex p-2 rounded-lg bg-${stat.color}-100 mb-3`}>
                      <Icon className={`h-5 w-5 text-${stat.color}-600`} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.name}</p>
                  </Wrapper>
                )
              })}
            </div>
          </div>

          {/* ── Company stats ── */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Companies
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {companyStatCards.map((stat) => {
                const Icon = stat.icon
                const Wrapper = stat.href ? Link : 'div'
                return (
                  <Wrapper
                    key={stat.name}
                    href={stat.href || '#'}
                    className={`bg-white overflow-hidden shadow rounded-lg p-4 ${stat.href ? 'hover:shadow-md transition cursor-pointer' : ''}`}
                  >
                    <div className={`inline-flex p-2 rounded-lg bg-${stat.color}-100 mb-3`}>
                      <Icon className={`h-5 w-5 text-${stat.color}-600`} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.name}</p>
                  </Wrapper>
                )
              })}
            </div>
          </div>

          {/* ── Recent Provider Registrations ── */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-base font-semibold text-gray-900">Recent Provider Registrations</h2>
              <Link href="/admin/providers" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                View all →
              </Link>
            </div>
            <div className="divide-y divide-gray-200">
              {recentProviders.length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-500 text-sm">No providers yet</div>
              ) : (
                recentProviders.map((provider) => (
                  <div key={provider.id} className="px-6 py-4 hover:bg-gray-50 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{provider.name}</span>
                        <StatusBadge status={provider.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {provider.owner?.first_name} {provider.owner?.last_name}
                        {provider.owner?.email ? ` · ${provider.owner.email}` : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {provider.provider_type?.display_name} · {new Date(provider.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {provider.status === 'pending_verification' && (
                      <Link
                        href={`/admin/providers/${provider.id}`}
                        className="ml-4 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap"
                      >
                        Review
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Pending Company Registrations ── */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">Pending Company Registrations</h2>
                {stats.pendingCompanies > 0 && (
                  <span className="bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {stats.pendingCompanies}
                  </span>
                )}
              </div>
              <Link href="/admin/companies" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                View all →
              </Link>
            </div>
            <div className="divide-y divide-gray-200">
              {pendingCompanies.length === 0 ? (
                <div className="px-6 py-10 text-center text-gray-500 text-sm">
                  No pending company registrations
                </div>
              ) : (
                pendingCompanies.map((company) => (
                  <div key={company.id} className="px-6 py-4 hover:bg-gray-50 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{company.name}</span>
                        <StatusBadge status={company.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {company.owner?.first_name} {company.owner?.last_name}
                        {company.owner?.email ? ` · ${company.owner.email}` : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Reg: {company.registration_number || 'N/A'} ·{' '}
                        Submitted: {company.submitted_at ? new Date(company.submitted_at).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <Link
                      href={`/admin/companies/${company.id}`}
                      className="ml-4 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap"
                    >
                      Review
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Right sidebar — 1 col */}
        <div className="space-y-6">
          <EmailQueueWidget />
        </div>

      </div>
    </div>
  )
}

// ── Email Queue Widget (unchanged) ──────────────────────────────────────────
function EmailQueueWidget() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const response = await fetch('/api/email-queue?limit=1')
      const data = await response.json()
      if (response.ok) setStats(data.statistics)
    } catch (error) {
      console.error('Load email stats error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
        <div className="space-y-3">
          <div className="h-3 bg-gray-200 rounded" />
          <div className="h-3 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center">
          <Mail className="h-5 w-5 text-blue-600 mr-2" />
          <h3 className="text-base font-bold text-gray-900">Email Queue</h3>
        </div>
        <Link href="/admin/email-queue" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
          View All →
        </Link>
      </div>

      {stats ? (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 text-sm">Total Emails</span>
            <span className="text-2xl font-bold text-gray-900">{stats.total_emails || 0}</span>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-gray-600 text-sm">Success Rate</span>
              <span className="text-sm font-bold text-green-600">{stats.success_rate || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${stats.success_rate || 0}%` }}
              />
            </div>
          </div>
          <div className="pt-3 border-t border-gray-200 space-y-2">
            {[
              { label: 'Sent', value: stats.sent_emails || 0, icon: CheckCircle, color: 'text-green-600' },
              { label: 'Pending', value: stats.pending_emails || 0, icon: Clock, color: 'text-yellow-600' },
              { label: 'Failed', value: stats.failed_emails || 0, icon: AlertTriangle, color: 'text-red-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className={`flex items-center gap-1 text-gray-600`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                  {label}
                </span>
                <span className={`font-medium ${color}`}>{value}</span>
              </div>
            ))}
          </div>
          {stats.failed_emails > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-red-800 font-medium">
                    {stats.failed_emails} failed email{stats.failed_emails !== 1 ? 's' : ''}
                  </p>
                  <Link
                    href="/admin/email-queue?status=failed"
                    className="text-xs text-red-600 hover:text-red-800 underline mt-0.5 inline-block"
                  >
                    View failed emails →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 text-center text-gray-500 text-sm">No email data available</div>
      )}
    </div>
  )
}