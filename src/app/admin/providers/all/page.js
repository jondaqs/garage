// src/app/admin/providers/all/page.js
'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Search, CheckCircle, Clock, XCircle, AlertCircle, Store,
  History, AlertTriangle, MoreVertical, ShieldOff, ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import Pagination from '@/components/admin/Pagination'

const PAGE_SIZE = 20

const FIELD_LABELS = {
  name:                'Business Name',
  email:               'Business Email',
  phone:               'Business Phone',
  description:         'Description',
  website:             'Website',
  registration_number: 'Registration Number',
  tax_id:              'Tax ID',
  provider_type_id:    'Provider Type',
  currency_id:         'Currency',
  years_in_operation:  'Years in Operation',
}

export default function AllProvidersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [providers,    setProviders]    = useState([])
  const [pendingDiffs, setPendingDiffs] = useState({})
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page,         setPage]         = useState(1)
  const [totalCount,   setTotalCount]   = useState(0)
  const [totalAll,     setTotalAll]     = useState(0)
  const [openMenu,     setOpenMenu]     = useState(null)
  const [processing,   setProcessing]   = useState(null)

  const menuRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter])
  useEffect(() => { loadProviders() }, [page, debouncedSearch, statusFilter])

  const loadProviders = async () => {
    setLoading(true)
    try {
      const from = (page - 1) * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let query = supabase
        .from('service_providers')
        .select(`
          id, name, status, is_active, is_verified, created_at, submitted_at,
          owner:user_profiles(id, first_name, last_name, email),
          provider_type:service_provider_types(display_name),
          shops(id)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`)
      }

      query = query.range(from, to)

      const [{ data: provs, error, count }, { data: pending }] = await Promise.all([
        query,
        supabase
          .from('provider_pending_changes')
          .select('service_provider_id, changed_fields, change_count, is_reverification, verified_at_snapshot'),
      ])

      if (error) throw error
      setProviders(provs || [])
      setTotalCount(count || 0)
      setPendingDiffs(
        Object.fromEntries((pending || []).map(r => [r.service_provider_id, r]))
      )

      if (page === 1 && statusFilter === 'all' && !debouncedSearch) {
        setTotalAll(count || 0)
      }
    } catch (err) {
      console.error('Error loading providers:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Admin actions ─────────────────────────────────────────────────────────
  const handleAction = async (providerId, action, providerName) => {
    const labels = {
      suspend:  `Suspend ${providerName}? They will no longer appear on the platform.`,
      activate: `Activate ${providerName}? They will be live on the platform.`,
    }
    if (!confirm(labels[action])) return

    setProcessing(providerId)
    setOpenMenu(null)
    try {
      const { data, error } = await supabase.rpc('admin_update_provider_status', {
        p_provider_id: providerId,
        p_action:      action,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error)
      await loadProviders()
    } catch (err) {
      console.error(`${action} failed:`, err)
      alert(`Failed to ${action} provider: ${err.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const getActions = (p) => {
    const actions = []
    if (p.status === 'active') {
      actions.push({ key: 'suspend', label: 'Suspend', icon: ShieldOff, cls: 'text-red-700 hover:bg-red-50' })
    }
    if (p.status === 'suspended') {
      actions.push({ key: 'activate', label: 'Activate', icon: ShieldCheck, cls: 'text-green-700 hover:bg-green-50' })
    }
    return actions
  }

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

  if (loading && page === 1 && !providers.length) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Providers</h1>
          <p className="text-gray-500 mt-1">{totalAll || totalCount} total registered providers</p>
        </div>
        <Link
          href="/admin/providers"
          className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm font-medium hover:bg-yellow-200"
        >
          <Clock size={16} /> Pending Review
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
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Changes</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {providers.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-6 py-12 text-center text-gray-400">
                  <Store className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  No providers found
                </td>
              </tr>
            ) : (
              providers.map(p => {
                const diff = pendingDiffs[p.id]
                const labels = []
                if (diff?.changed_fields) {
                  for (const [field, value] of Object.entries(diff.changed_fields)) {
                    if (field === 'documents' && Array.isArray(value)) {
                      for (const e of value) {
                        const a = e.action?.replace(/^./, c => c.toUpperCase()) || 'Changed'
                        labels.push(`${a}: ${e.doc_type || ''}`)
                      }
                    } else {
                      labels.push(FIELD_LABELS[field] || field)
                    }
                  }
                }

                const actions = getActions(p)

                return (
                  <tr key={p.id} className={`hover:bg-gray-50 align-top ${processing === p.id ? 'opacity-50' : ''}`}>
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
                    <td className="px-6 py-4">
                      {diff && labels.length > 0 ? (
                        <div>
                          <div className="flex items-center gap-1 text-xs font-medium text-gray-900 mb-1">
                            <AlertTriangle className="w-3 h-3 text-yellow-600" />
                            {diff.change_count} changed
                          </div>
                          {diff.is_reverification && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700">
                              <History className="w-2.5 h-2.5" /> Re-verify
                            </span>
                          )}
                          <p className="text-[10px] text-gray-500 mt-1 line-clamp-1" title={labels.join(', ')}>
                            {labels.slice(0, 2).join(', ')}{labels.length > 2 ? '…' : ''}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/providers/${p.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          View
                        </Link>

                        {actions.length > 0 && (
                          <div className="relative inline-block" ref={openMenu === p.id ? menuRef : null}>
                            <button
                              onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}
                              disabled={processing === p.id}
                              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {openMenu === p.id && (
                              <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                                {actions.map(a => {
                                  const Icon = a.icon
                                  return (
                                    <button
                                      key={a.key}
                                      onClick={() => handleAction(p.id, a.key, p.name)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${a.cls}`}
                                    >
                                      <Icon size={14} /> {a.label}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
      </div>
    </div>
  )
}