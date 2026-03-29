'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState([])
  const [filter, setFilter] = useState('pending_verification')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCompanies()
  }, [filter])

  const fetchCompanies = async () => {
    const supabase = createClient()
    
    let query = supabase
      .from('company_profiles')
      .select('*, owner:user_profiles(*)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching companies:', error)
    } else {
      setCompanies(data || [])
    }
    
    setLoading(false)
  }

  const getStatusColor = (status) => {
    const colors = {
      'pending_verification': 'yellow',
      'active': 'green',
      'rejected': 'red',
      'suspended': 'gray'
    }
    return colors[status] || 'gray'
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Company Registrations</h1>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['all', 'pending_verification', 'active', 'rejected'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Company Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Submitted
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{company.name}</div>
                    <div className="text-sm text-gray-500">{company.registration_number}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {company.owner?.first_name} {company.owner?.last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full bg-${getStatusColor(company.status)}-100 text-${getStatusColor(company.status)}-800`}>
                      {company.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {company.submitted_at ? new Date(company.submitted_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/companies/${company.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}