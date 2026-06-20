'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Building2, Truck, Users, Calendar,
  DollarSign, AlertCircle, CheckCircle, Clock,
  BarChart3,
} from 'lucide-react'
import useCompanyAccess from '@/hooks/useCompanyAccess'
import CompanyAccessBanner from '@/components/CompanyAccessBanner'

export default function MemberCompanyOverviewPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [membership,  setMembership]  = useState(null)   // { is_admin, staff_role, company }
  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const access = useCompanyAccess(companyId)

  useEffect(() => { fetchData() }, [companyId])

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) { setError('Profile not found'); return }

      // Verify membership — user must be an active member of this specific company
      const { data: mem } = await supabase
        .from('company_users')
        .select('is_admin, staff_role, company:company_profiles_secure(id, name, status, bio, phone, website, city, country, opening_time, closing_time)')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!mem) {
        setError('You are not a member of this company.')
        setLoading(false)
        return
      }

      setMembership(mem)

      // Fetch stats in parallel
      const today = new Date()
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

      const [
        { count: vehicleCount },
        { count: memberCount },
        { count: bookingCount },
        { data: budget },
      ] = await Promise.all([
        supabase
          .from('vehicle_ownership')
          .select('*', { count: 'exact', head: true })
          .eq('owner_company_id', companyId),
        supabase
          .from('company_users')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('is_active', true),
        supabase
          .from('bookings_secure')
          .select('*, vehicle_ownership!inner(owner_company_id)', { count: 'exact', head: true })
          .eq('vehicle_ownership.owner_company_id', companyId)
          .gte('created_at', monthStart),
        mem.is_admin
          ? supabase
              .from('company_budgets')
              .select('budget_limit, spent_amount, currency')
              .eq('company_id', companyId)
              .lte('period_start', today.toISOString().split('T')[0])
              .gte('period_end', today.toISOString().split('T')[0])
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      setStats({
        vehicles:  vehicleCount  ?? 0,
        members:   memberCount   ?? 0,
        bookings:  bookingCount  ?? 0,
        budget:    budget        ?? null,
      })
    } catch (err) {
      console.error('Overview fetch error:', err)
      setError('Failed to load company data.')
    } finally {
      setLoading(false)
    }
  }

  const statusConfig = {
    active:               { icon: CheckCircle, color: 'text-green-600',  bg: 'bg-green-50  border-green-200',  label: 'Active & Verified'    },
    pending_verification: { icon: Clock,       color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Pending Verification' },
    pending_info:         { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', label: 'Info Required'         },
    rejected:             { icon: AlertCircle, color: 'text-red-600',    bg: 'bg-red-50    border-red-200',    label: 'Registration Rejected' },
    suspended:            { icon: AlertCircle, color: 'text-gray-500',   bg: 'bg-gray-50   border-gray-200',   label: 'Suspended'             },
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="max-w-md mx-auto mt-12 bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
      <AlertCircle className="w-6 h-6 mb-2" />
      <p className="font-medium">{error}</p>
    </div>
  )

  const company = membership?.company
  const statusCfg = statusConfig[company?.status] ?? statusConfig.suspended
  const StatusIcon = statusCfg.icon

  const base = `/dashboard/company/${companyId}`

  const statCards = [
    { label: 'Fleet Vehicles', value: stats?.vehicles ?? 0, icon: Truck,    href: `${base}/fleet`,    color: 'text-blue-600',  bg: 'bg-blue-50'   },
    { label: 'Team Members',   value: stats?.members  ?? 0, icon: Users,    href: `${base}/team`,     color: 'text-purple-600',bg: 'bg-purple-50' },
    { label: 'Bookings (Mo.)', value: stats?.bookings ?? 0, icon: Calendar, href: `${base}/bookings`, color: 'text-green-600', bg: 'bg-green-50'  },
    ...(membership?.is_admin && stats?.budget ? [{
      label: 'Budget Used',
      value: `${stats.budget.currency || 'KES'} ${(stats.budget.spent_amount ?? 0).toLocaleString()}`,
      sub: `of ${(stats.budget.budget_limit ?? 0).toLocaleString()}`,
      icon: DollarSign,
      href: `${base}/budget`,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    }] : []),
  ]

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="text-white w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{company?.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">
              {membership?.staff_role}{membership?.is_admin ? ' · Admin' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-6 ${statusCfg.bg}`}>
        <StatusIcon className={`w-5 h-5 flex-shrink-0 ${statusCfg.color}`} />
        <div>
          <p className={`text-sm font-medium ${statusCfg.color}`}>{statusCfg.label}</p>
          {company?.status !== 'active' && (
            <p className="text-xs text-gray-500 mt-0.5">
              Some features are limited until the company is verified by our team.
            </p>
          )}
        </div>
      </div>

      {/* Subscription / trial banner */}
      {!access.loading && (
        <>
          <div className="hidden md:block">
            <CompanyAccessBanner {...access} companyId={companyId} />
          </div>
          <div className="md:hidden mb-4">
            <CompanyAccessBanner {...access} companyId={companyId} compact />
          </div>
        </>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(card => {
          const Icon = card.icon
          return (
            <Link key={card.label} href={card.href}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow"
            >
              <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              {card.sub && <p className="text-xs text-gray-400">{card.sub}</p>}
              <p className="text-sm text-gray-500 mt-1">{card.label}</p>
            </Link>
          )
        })}
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Access</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'View Fleet',     href: `${base}/fleet`,    icon: Truck     },
            { label: 'View Bookings',  href: `${base}/bookings`, icon: Calendar  },
            { label: 'View Team',      href: `${base}/team`,     icon: Users     },
            ...(membership?.is_admin ? [
              { label: 'Budget',       href: `${base}/budget`,   icon: DollarSign },
              { label: 'Reports',      href: `${base}/reports`,  icon: BarChart3  },
            ] : []),
          ].map(link => {
            const Icon = link.icon
            return (
              <Link key={link.label} href={link.href}
                className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition text-sm font-medium text-gray-700"
              >
                <Icon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                {link.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Company details (if available) */}
      {(company?.bio || company?.phone || company?.website) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Company Info</h2>
          <dl className="space-y-2 text-sm">
            {company.bio && (
              <div><dt className="text-gray-500">About</dt><dd className="text-gray-800 mt-0.5">{company.bio}</dd></div>
            )}
            {company.phone && (
              <div className="flex justify-between"><dt className="text-gray-500">Phone</dt><dd className="text-gray-800">{company.phone}</dd></div>
            )}
            {company.website && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Website</dt>
                <dd><a href={company.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{company.website}</a></dd>
              </div>
            )}
            {(company.city || company.country) && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Location</dt>
                <dd className="text-gray-800">{[company.city, company.country].filter(Boolean).join(', ')}</dd>
              </div>
            )}
            {company.opening_time && company.closing_time && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Hours</dt>
                <dd className="text-gray-800">{company.opening_time} – {company.closing_time}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}