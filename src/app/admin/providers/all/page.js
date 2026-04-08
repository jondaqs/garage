// src/app/admin/providers/all/page.js
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, CheckCircle, Clock, XCircle, AlertCircle, Store } from 'lucide-react'
import Link from 'next/link'

export default function AllProvidersPage() {
  const router = useRouter()
  const supabase = createClient()

  const [providers, setProviders] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { loadProviders() }, [])

  const loadProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('service_providers')
        .select(`
          id, name, status, is_active, is_verified, created_at, submitted_at,
          owner:user_profiles(first_name, last_name, email),
          provider_type:service_provider_types(display_name),
          shops(id)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProviders(data || [])
    } catch (err) {
      console.error('Error loading providers:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = providers.filter(p => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.owner?.email?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    return matchSearch && matchStatus
  })

  const statusBadge = (status) => {
    const map = {
      active:               'bg-green-100 text-green-800',
      pending_verification: 'bg-yellow-100 text-yellow-800',
      rejected:             'bg-red-100 text-red-800',
      suspended:            'bg-gray-100 text-gray-700',
    }
    return map[status] || 'bg-gray-100 text-gray-700'
  }

  const statusIcon = (status) => {
    if (status === 'active') return <CheckCircle size={14} className="text-green-600" />
    if (status === 'pending_verification') return <Clock size={14} className="text-yellow-600" />
    if (status === 'rejected') return <XCircle size={14} className="text-red-600" />
    return <AlertCircle size={14} className="text-gray-400" />
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Providers</h1>
          <p className="text-gray-500 mt-1">{providers.length} total registered providers</p>
        </div>
        <Link
          href="/admin/providers"
          className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm font-medium hover:bg-yellow-200"
        >
          <Clock size={16} />
          Pending Review ({providers.filter(p => p.status === 'pending_verification').length})
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending_verification">Pending</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shops</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center text-gray-400">
                  <Store className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  No providers found
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{p.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{p.owner?.first_name} {p.owner?.last_name}</p>
                    <p className="text-xs text-gray-400">{p.owner?.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{p.provider_type?.display_name || '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{p.shops?.length ?? 0}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>
                      {statusIcon(p.status)}
                      {p.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/providers/${p.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}