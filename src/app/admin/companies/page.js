'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Building2, Users, Truck, Clock } from 'lucide-react'

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState([])
  const [filter, setFilter] = useState('pending_verification')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCompanies()
  }, [filter])

  const fetchCompanies = async () => {
    setLoading(true)
    const supabase = createClient()

    // Base company query — email lives on user_profiles.email
    let query = supabase
      .from('company_profiles')
      .select('id, name, registration_number, status, submitted_at, created_at, owner:user_profiles(first_name, last_name, email)')
      .order('submitted_at', { ascending: false, nullsFirst: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
      console.log(`Fetching companies with status "${filter}"`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching companies:', error)
      setLoading(false)
      return
    }

    // Fetch vehicle and team counts for each company in parallel
    const companiesWithCounts = await Promise.all(
      (data || []).map(async (company) => {
        const [{ count: vehicleCount }, { count: teamCount }] = await Promise.all([
          supabase
            .from('vehicle_ownership')
            .select('*', { count: 'exact', head: true })
            .eq('owner_company_id', company.id),
          supabase
            .from('company_users')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id),
        ])
        console.log(`Company "${company.name}" (ID: ${company.id}) - Vehicles: ${vehicleCount}, Team Members: ${teamCount}`)    
        return { ...company, vehicleCount: vehicleCount || 0, teamCount: teamCount || 0 }
      })
    )

    console.log(`Fetched ${companiesWithCounts.length} companies with counts`)
    setCompanies(companiesWithCounts)
    setLoading(false)
  }

  const statusConfig = {
    pending_verification: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-800' },
    active:               { label: 'Active',  classes: 'bg-green-100 text-green-800' },
    rejected:             { label: 'Rejected', classes: 'bg-red-100 text-red-800' },
    pending_info:         { label: 'Needs Info', classes: 'bg-orange-100 text-orange-800' },
    suspended:            { label: 'Suspended', classes: 'bg-gray-100 text-gray-700' },
  }

  const filters = [
    { key: 'all',                  label: 'All' },
    { key: 'pending_verification', label: 'Pending' },
    { key: 'pending_info',         label: 'Needs Info' },
    { key: 'active',               label: 'Active' },
    { key: 'rejected',             label: 'Rejected' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Registrations</h1>
          <p className="text-gray-500 text-sm mt-1">Review and manage company accounts</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Building2 className="w-4 h-4" />
          <span>{companies.length} shown</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          Loading companies...
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No companies with status "{filter.replace(/_/g, ' ')}"</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Fleet</span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Team</span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Submitted</span>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {companies.map((company) => {
                const cfg = statusConfig[company.status] || { label: company.status, classes: 'bg-gray-100 text-gray-700' }
                return (
                  <tr key={company.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{company.name}</div>
                      {company.registration_number && (
                        <div className="text-xs text-gray-400 mt-0.5">{company.registration_number}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {company.owner?.first_name} {company.owner?.last_name}
                      </div>
                      {company.owner?.email && (
                        <div className="text-xs text-gray-400 mt-0.5">{company.owner.email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${cfg.classes}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {company.vehicleCount}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {company.teamCount}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {company.submitted_at
                        ? new Date(company.submitted_at).toLocaleDateString()
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/companies/${company.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}