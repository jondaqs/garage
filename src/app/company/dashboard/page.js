'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Truck, Users, Calendar, DollarSign, ClipboardList,
  Plus, Wrench, AlertCircle, TrendingUp, Bell
} from 'lucide-react'

export default function CompanyDashboard() {
  const [companyId, setCompanyId] = useState(null)
  const [company, setCompany] = useState(null)
  const [stats, setStats] = useState({
    totalVehicles: 0,
    teamMembers: 0,
    pendingBookings: 0,
    budgetSpent: 0,
    budgetLimit: 0,
    activeWorkOrders: 0,
    pendingApprovalWOs: 0,
    pendingRecommendations: 0,
  })
  const [recentBookings, setRecentBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); setLoading(false); return }

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!userProfile) { setError('Profile not found'); setLoading(false); return }

      // Resolve company
      let cId = null

      const { data: ownedCompany } = await supabase
        .from('company_profiles')
        .select('id, name, status')
        .eq('owner_user_id', userProfile.id)
        .maybeSingle()

      if (ownedCompany) {
        cId = ownedCompany.id
        setCompany(ownedCompany)
      } else {
        const { data: companyUser } = await supabase
          .from('company_users')
          .select('company_id, company:company_profiles(id, name, status)')
          .eq('user_id', userProfile.id)
          .eq('is_active', true)
          .maybeSingle()

        if (companyUser?.company) {
          cId = companyUser.company_id
          setCompany(companyUser.company)
        }
      }

      if (!cId) { setError('No company found'); setLoading(false); return }
      setCompanyId(cId)

      // Fetch all stats in parallel
      const today = new Date()
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

      const [
        { count: vehicleCount },
        { count: memberCount },
        { data: fleetVehicles },
        { data: budget },
      ] = await Promise.all([
        supabase
          .from('vehicle_ownership')
          .select('*', { count: 'exact', head: true })
          .eq('owner_company_id', cId),
        supabase
          .from('company_users')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', cId)
          .eq('is_active', true),
        // Get vehicle IDs to query bookings
        supabase
          .from('vehicle_ownership')
          .select('vehicle_id')
          .eq('owner_company_id', cId),
        // Current period budget
        supabase
          .from('company_budgets')
          .select('budget_amount, spent_amount, currency')
          .eq('company_id', cId)
          .lte('period_start', today.toISOString().split('T')[0])
          .gte('period_end', today.toISOString().split('T')[0])
          .maybeSingle(),
      ])

      // Fetch bookings for fleet vehicles
      let pendingCount = 0
      let recentBookingsList = []

      if (fleetVehicles && fleetVehicles.length > 0) {
        const vehicleIds = fleetVehicles.map(v => v.vehicle_id)

        const [{ count: pending }, { data: recent }] = await Promise.all([
          supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .in('vehicle_id', vehicleIds)
            .in('status_id', await getPendingStatusIds(supabase)),
          supabase
            .from('bookings')
            .select(`
              id, booking_date, booking_time_start, created_at,
              vehicle:vehicles(plate_number, make, model),
              provider:service_providers(name),
              status:booking_statuses(code, display_name)
            `)
            .in('vehicle_id', vehicleIds)
            .order('created_at', { ascending: false })
            .limit(5),
        ])

        pendingCount = pending || 0
        recentBookingsList = recent || []
      }

      // Work order stats
      let activeWorkOrders = 0
      let pendingApprovalWOs = 0
      let pendingRecommendations = 0
      if (fleetVehicles && fleetVehicles.length > 0) {
        const vehicleIds2 = fleetVehicles.map(v => v.vehicle_id)
        const { data: woStatuses } = await supabase
          .from('work_order_statuses').select('id, code')
        const awaitingId = woStatuses?.find(s => s.code === 'awaiting_approval')?.id
        const terminalCodes = ['completed', 'cancelled', 'closed']
        const terminalIds = woStatuses?.filter(s => terminalCodes.includes(s.code)).map(s => s.id) || []

        const { count: allWOs } = await supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .in('vehicle_id', vehicleIds2)
          .not('status_id', 'in', `(${terminalIds.join(',')})`)
        activeWorkOrders = allWOs || 0

        if (awaitingId) {
          const { count: awaitingWOs } = await supabase
            .from('work_orders')
            .select('id', { count: 'exact', head: true })
            .in('vehicle_id', vehicleIds2)
            .eq('status_id', awaitingId)
          pendingApprovalWOs = awaitingWOs || 0
        }

        // Count unacknowledged maintenance recommendations
        const { count: recCount } = await supabase
          .from('maintenance_recommendations')
          .select('id', { count: 'exact', head: true })
          .in('vehicle_id', vehicleIds2)
          .eq('is_acknowledged', false)
        pendingApprovalWOs = pendingApprovalWOs  // keep existing value
        pendingRecommendations = recCount || 0
      }

      setStats({
        totalVehicles: vehicleCount || 0,
        teamMembers: memberCount || 0,
        pendingBookings: pendingCount,
        budgetSpent: budget?.spent_amount || 0,
        budgetLimit: budget?.budget_amount || 0,
        activeWorkOrders,
        pendingApprovalWOs,
        pendingRecommendations,
      })
      setRecentBookings(recentBookingsList)

    } catch (err) {
      console.error('Dashboard error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Helper — get status IDs for pending/confirmed statuses
  const getPendingStatusIds = async (supabase) => {
    const { data } = await supabase
      .from('booking_statuses')
      .select('id')
      .in('code', ['pending', 'confirmed'])
    return (data || []).map(s => s.id)
  }

  const budgetPct = stats.budgetLimit > 0
    ? Math.min(Math.round((stats.budgetSpent / stats.budgetLimit) * 100), 100)
    : 0

  const statCards = [
    {
      name: 'Fleet Vehicles',
      value: stats.totalVehicles,
      icon: Truck,
      colorBg: 'bg-blue-100',
      colorText: 'text-blue-600',
      link: '/company/fleet',
    },
    {
      name: 'Team Members',
      value: stats.teamMembers,
      icon: Users,
      colorBg: 'bg-green-100',
      colorText: 'text-green-600',
      link: '/company/team',
    },
    {
      name: 'Active Work Orders',
      value: stats.activeWorkOrders,
      icon: ClipboardList,
      colorBg: 'bg-orange-100',
      colorText: 'text-orange-600',
      link: '/company/work-orders',
    },
    {
      name: 'Pending Bookings',
      value: stats.pendingBookings,
      icon: Calendar,
      colorBg: 'bg-yellow-100',
      colorText: 'text-yellow-600',
      link: '/company/bookings',
    },
    {
      name: 'Monthly Budget',
      value: stats.budgetLimit > 0
        ? `KES ${stats.budgetSpent.toLocaleString()} / ${stats.budgetLimit.toLocaleString()}`
        : 'Not set',
      icon: DollarSign,
      colorBg: 'bg-purple-100',
      colorText: 'text-purple-600',
      link: '/company/budget',
      extra: stats.budgetLimit > 0 ? budgetPct : null,
    },
  ]

  const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })
    : '—'

  const statusColor = {
    pending:     'bg-yellow-100 text-yellow-800',
    confirmed:   'bg-blue-100 text-blue-800',
    in_progress: 'bg-purple-100 text-purple-800',
    completed:   'bg-green-100 text-green-800',
    cancelled:   'bg-red-100 text-red-800',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    )
  }

  // Pending verification banner
  const showPendingBanner = company?.status === 'pending_verification'
  const showInfoBanner = company?.status === 'pending_info'

  return (
    <div className="space-y-6">

      {/* Status banners */}
      {showPendingBanner && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-900">Registration under review</p>
            <p className="text-sm text-yellow-700 mt-0.5">
              Your company is pending verification. Full features will be unlocked once approved (2–5 business days).
            </p>
          </div>
        </div>
      )}

      {showInfoBanner && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-900">Additional information required</p>
            <p className="text-sm text-orange-700 mt-0.5">
              Our team has requested more details.{' '}
              <Link href="/company/pending-info" className="underline font-medium">View request →</Link>
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.pendingRecommendations > 0 && (
          <div
            onClick={() => router.push('/company/reminders')}
            className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:bg-purple-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Bell className="text-purple-600 flex-shrink-0" size={20} />
              <div>
                <p className="font-semibold text-purple-900 text-sm">
                  {stats.pendingRecommendations} maintenance recommendation{stats.pendingRecommendations > 1 ? 's' : ''} pending
                </p>
                <p className="text-purple-700 text-xs mt-0.5">
                  Your mechanics have flagged service items for your fleet.
                </p>
              </div>
            </div>
            <span className="text-purple-700 text-sm font-semibold flex-shrink-0">Review →</span>
          </div>
        )}
        {stats.pendingApprovalWOs > 0 && (
          <div
            onClick={() => router.push('/company/work-orders')}
            className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:bg-yellow-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Bell className="text-yellow-600 flex-shrink-0" size={20} />
              <div>
                <p className="font-semibold text-yellow-900 text-sm">
                  {stats.pendingApprovalWOs === 1
                    ? '1 fleet vehicle estimate awaiting approval'
                    : `${stats.pendingApprovalWOs} fleet vehicle estimates awaiting approval`}
                </p>
                <p className="text-yellow-700 text-xs mt-0.5">
                  Click to review and authorise service work.
                </p>
              </div>
            </div>
            <span className="text-yellow-700 text-sm font-semibold flex-shrink-0">Review →</span>
          </div>
        )}
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link
              key={stat.name}
              href={stat.link}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${stat.colorBg}`}>
                  <Icon className={`w-5 h-5 ${stat.colorText}`} />
                </div>
                <TrendingUp className="w-4 h-4 text-gray-300" />
              </div>
              <p className="text-xs text-gray-500 font-medium">{stat.name}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{stat.value}</p>
              {stat.extra != null && (
                <div className="mt-2">
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${stat.extra > 90 ? 'bg-red-500' : stat.extra > 70 ? 'bg-yellow-500' : 'bg-purple-500'}`}
                      style={{ width: `${stat.extra}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{stat.extra}% used</p>
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent bookings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Bookings</h2>
            <Link href="/company/bookings" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View all →
            </Link>
          </div>

          {recentBookings.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Calendar className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No bookings yet</p>
              <Link
                href="/company/bookings/book"
                className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Book a service
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentBookings.map((booking) => {
                const code = booking.status?.code || 'pending'
                const colorCls = statusColor[code] || 'bg-gray-100 text-gray-700'
                return (
                  <Link
                    key={booking.id}
                    href={`/company/bookings/${booking.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="p-2 bg-blue-50 rounded-lg shrink-0">
                      <Wrench className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {booking.vehicle?.plate_number} · {booking.vehicle?.make} {booking.vehicle?.model}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {booking.provider?.name || 'Service provider'} · {formatDate(booking.booking_date)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${colorCls}`}>
                      {booking.status?.display_name || code}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-5 space-y-3">
            {[
              {
                href: '/company/fleet/add',
                icon: Truck,
                label: 'Add Vehicle to Fleet',
                color: 'text-blue-600',
                hoverBorder: 'hover:border-blue-400 hover:bg-blue-50',
              },
              {
                href: '/company/team',
                icon: Users,
                label: 'Invite Team Member',
                color: 'text-green-600',
                hoverBorder: 'hover:border-green-400 hover:bg-green-50',
              },
              {
                href: '/company/bookings/book',
                icon: Calendar,
                label: 'Book a Service',
                color: 'text-purple-600',
                hoverBorder: 'hover:border-purple-400 hover:bg-purple-50',
              },
              {
                href: '/company/budget',
                icon: DollarSign,
                label: 'Manage Budget',
                color: 'text-yellow-600',
                hoverBorder: 'hover:border-yellow-400 hover:bg-yellow-50',
              },
            ].map(({ href, icon: Icon, label, color, hoverBorder }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 p-3.5 border-2 border-dashed border-gray-200 rounded-xl transition-colors ${hoverBorder}`}
              >
                <Icon className={`w-5 h-5 ${color} shrink-0`} />
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <Plus className="w-4 h-4 text-gray-400 ml-auto" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}