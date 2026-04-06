'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, AlertCircle, Lock, Truck, Calendar, Users, DollarSign } from 'lucide-react'

export default function MemberReportsPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [stats,   setStats]   = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => { fetchData() }, [companyId])

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) return

      const { data: mem } = await supabase
        .from('company_users')
        .select('is_admin')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!mem) { setError('You are not a member of this company.'); setLoading(false); return }

      setIsAdmin(mem.is_admin)
      if (!mem.is_admin) { setLoading(false); return }

      // Gather report stats
      const today = new Date()
      const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

      const [
        { count: totalVehicles },
        { count: totalMembers },
        { count: monthBookings },
        { count: yearBookings },
        { count: completedBookings },
      ] = await Promise.all([
        supabase.from('vehicle_ownership').select('*', { count: 'exact', head: true }).eq('owner_company_id', companyId),
        supabase.from('company_users').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
        supabase.from('bookings')
          .select('*, vehicle_ownership!inner(owner_company_id)', { count: 'exact', head: true })
          .eq('vehicle_ownership.owner_company_id', companyId)
          .gte('created_at', monthStart),
        supabase.from('bookings')
          .select('*, vehicle_ownership!inner(owner_company_id)', { count: 'exact', head: true })
          .eq('vehicle_ownership.owner_company_id', companyId)
          .gte('created_at', yearStart),
        supabase.from('bookings')
          .select('*, vehicle_ownership!inner(owner_company_id), status:booking_statuses!inner(code)', { count: 'exact', head: true })
          .eq('vehicle_ownership.owner_company_id', companyId)
          .eq('booking_statuses.code', 'completed')
          .gte('created_at', yearStart),
      ])

      setStats({ totalVehicles, totalMembers, monthBookings, yearBookings, completedBookings })
    } catch (err) {
      setError('Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" /><p>{error}</p>
    </div>
  )

  if (!isAdmin) return (
    <div className="max-w-md mx-auto mt-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Lock className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Reports are admin-only</h2>
      <p className="text-gray-500 text-sm">Only company admins can view reports.</p>
    </div>
  )

  const cards = [
    { label: 'Total Fleet',         value: stats?.totalVehicles  ?? 0, icon: Truck,    color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'Active Members',       value: stats?.totalMembers   ?? 0, icon: Users,    color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Bookings This Month',  value: stats?.monthBookings  ?? 0, icon: Calendar, color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Bookings This Year',   value: stats?.yearBookings   ?? 0, icon: Calendar, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Completed (Year)',     value: stats?.completedBookings ?? 0, icon: BarChart3, color: 'text-teal-600', bg: 'bg-teal-50' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Company activity overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.label}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-blue-700">
        <p className="font-medium mb-1">More detailed reports coming soon</p>
        <p className="text-blue-600">Booking trends, spend analysis, and fleet utilisation charts will appear here.</p>
      </div>
    </div>
  )
}