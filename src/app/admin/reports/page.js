// src/app/admin/reports/page.js
'use client'

import { FileText, TrendingUp, Users, Store, Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AdminReportsPage() {
  const supabase = createClient()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  const loadStats = async () => {
    try {
      const [
        { count: users },
        { count: providers },
        { count: companies },
        { count: bookings },
        { count: vehicles },
      ] = await Promise.all([
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('service_providers').select('*', { count: 'exact', head: true }),
        supabase.from('company_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('vehicles').select('*', { count: 'exact', head: true }),
      ])
      setStats({ users, providers, companies, bookings, vehicles })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const cards = stats ? [
    { label: 'Total Users',     value: stats.users,     icon: Users,     color: 'bg-blue-100 text-blue-700' },
    { label: 'Providers',       value: stats.providers,  icon: Store,     color: 'bg-green-100 text-green-700' },
    { label: 'Companies',       value: stats.companies,  icon: Building2, color: 'bg-purple-100 text-purple-700' },
    { label: 'Total Bookings',  value: stats.bookings,   icon: TrendingUp, color: 'bg-orange-100 text-orange-700' },
    { label: 'Registered Vehicles', value: stats.vehicles, icon: TrendingUp, color: 'bg-gray-100 text-gray-700' },
  ] : []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 mt-1">Platform-wide statistics</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${color}`}>
                <Icon size={20} />
              </div>
              <p className="text-3xl font-bold text-gray-900">{(value ?? 0).toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-gray-400">
          <FileText size={18} />
          <p className="text-sm">Detailed reports and exports coming soon.</p>
        </div>
      </div>
    </div>
  )
}