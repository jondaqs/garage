// src/app/admin/providers/all/page.js
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Search, CheckCircle, Clock, XCircle, AlertCircle, Store,
  History, AlertTriangle, MoreVertical, ShieldOff, ShieldCheck, PowerOff,
} from 'lucide-react'
import Link from 'next/link'
import Pagination from '@/components/admin/Pagination'
import { banUser, unbanUser } from '@/lib/admin/banUser'

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

/* ── Fixed-position action menu ──────────────────────────────────────────── */
function ActionMenu({ actions, onAction, entityId, entityName, processing }) {
  const [open, setOpen]   = useState(false)
  const [pos, setPos]     = useState({ top: 0, left: 0 })
  const btnRef            = useRef(null)
  const menuRef           = useRef(null)

  const toggle = useCallback(() => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.right })
    }
    setOpen(o => !o)
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (actions.length === 0) return null

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={processing}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
          className="w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] py-1"
        >
          {actions.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.key}
                onClick={() => { setOpen(false); onAction(entityId, a.key, entityName) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${a.cls}`}
              >
                <Icon size={14} /> {a.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function AllProvidersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [providers,    setProviders]    = useState([])
  const [pendingDiffs, setPendingDiffs] = useState({})
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(null)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page,         setPage]         = useState(1)
  const [totalCount,   setTotalCount]   = useState(0)
  const [totalAll,     setTotalAll]     = useState(0)
  const [processing,   setProcessing]   = useState(null)

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
    setLoadError(null)
    try {
      const from = (page - 1) * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let provs, count

      if (debouncedSearch) {
        // PII-safe fuzzy search via server-side RPC
        const { data: rpcResult, error: rpcErr } = await supabase.rpc(
          'admin_search_providers',
          { p_search: debouncedSearch, p_limit: PAGE_SIZE, p_offset: from }
        )
        if (rpcErr) throw rpcErr
        if (!rpcResult?.success) throw new Error(rpcResult?.error || 'Search failed')

        // Map RPC rows to the shape the UI expects
        provs = (rpcResult.rows || [])
          .filter(r => statusFilter === 'all' || r.status === statusFilter)
          .map(r => ({
            ...r,
            owner: { first_name: r.owner_first_name, last_name: r.owner_last_name, email: r.email },
            provider_type: r.provider_type ? { display_name: r.provider_type } : null,
            shops: []
          }))
        count = rpcResult.total || 0
      } else {
        // No search term — direct query (plaintext columns still exist during transition)
        let query = supabase
          .from('service_providers')
          .select(`
            id, name, status, is_active, is_verified, created_at, submitted_at,
            owner:user_profiles(id, auth_user_id, first_name, last_name, email),
            provider_type:service_provider_types(display_name),
            shops(id)
          `, { count: 'exact' })
          .order('created_at', { ascending: false })

        if (statusFilter !== 'all') query = query.eq('status', statusFilter)
        query = query.range(from, to)
        const { data, error, count: c } = await query
        if (error) throw error
        provs = data || []
        count = c || 0
      }

      const { data: pending } = await supabase
        .from('provider_pending_changes')
        .select('service_provider_id, changed_fields, change_count, is_reverification, verified_at_snapshot')

      setProviders(provs)
      setTotalCount(count)
      setPendingDiffs(Object.fromEntries((pending || []).map(r => [r.service_provider_id, r])))
      if (page === 1 && statusFilter === 'all' && !debouncedSearch) setTotalAll(count)
    } catch (err) {
      console.error('Error loading providers:', err?.message || err)
      setLoadError(err?.message || 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  // ── Admin actions ─────────────────────────────────────────────────────────
  const handleAction = async (providerId, action, providerName) => {
    const labels = {
      suspend:    `Suspend ${providerName}? All staff will be deactivated and the listing goes offline.`,
      deactivate: `Deactivate ${providerName}? All staff will be deactivated.`,
      activate:   `Activate ${providerName}? All staff will be reactivated.`,
    }
    if (!confirm(labels[action])) return

    setProcessing(providerId)
    try {
      const { data, error } = await supabase.rpc('admin_update_provider_status', {
        p_provider_id: providerId,
        p_action:      action,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error)

      // Auth-level ban/unban for the provider owner
      const provider = providers.find(p => p.id === providerId)
      if (provider?.owner?.auth_user_id) {
        if (action === 'suspend' || action === 'deactivate') {
          await banUser(provider.owner.auth_user_id)
        } else {
          await unbanUser(provider.owner.auth_user_id)
        }
      }

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
    // Only show suspend/deactivate when truly active (both columns)
    if (p.status === 'active' && p.is_active !== false) {
      actions.push({ key: 'suspend',    label: 'Suspend',    icon: ShieldOff,   cls: 'text-red-700 hover:bg-red-50' })
      actions.push({ key: 'deactivate', label: 'Deactivate', icon: PowerOff,    cls: 'text-gray-700 hover:bg-gray-50' })
    }
    // Show activate when suspended, deactivated, or is_active is false
    if (p.status === 'suspended' || p.status === 'deactivated' ||
        (p.is_active === false && p.status !== 'pending_verification' && p.status !== 'rejected')) {
      actions.push({ key: 'activate', label: 'Activate', icon: ShieldCheck, cls: 'text-green-700 hover:bg-green-50' })
    }
    return actions
  }

  const statusBadge = (status) => ({
    active:               'bg-green-100 text-green-800',
    pending_verification: 'bg-yellow-100 text-yellow-800',
    rejected:             'bg-red-100 text-red-800',
    suspended:            'bg-gray-100 text-gray-700',
    deactivated:          'bg-gray-200 text-gray-600',
  }[status] || 'bg-gray-100 text-gray-700')

  const statusIcon = (status) => {
    if (status === 'active')               return <CheckCircle size={14} className="text-green-600" />
    if (status === 'pending_verification') return <Clock size={14} className="text-yellow-600" />
    if (status === 'rejected')             return <XCircle size={14} className="text-red-600" />
    if (status === 'deactivated')          return <PowerOff size={14} className="text-gray-500" />
    return <AlertCircle size={14} className="text-gray-400" />
  }

  if (loading && page === 1 && !providers.length) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div>
      {loadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>Error:</strong> {loadError}
        </div>
      )}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Providers</h1>
          <p className="text-gray-500 mt-1">{totalAll || totalCount} total registered providers</p>
        </div>
        <Link
          href="/admin/providers"
          className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm font-medium hover:bg-yellow-200 self-start sm:self-auto"
        >
          <Clock size={16} /> Pending Review
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent self-start"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending_verification">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shops</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Changes</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registered</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Actions</th>
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
                    <tr key={p.id} className={`hover:bg-gray-50 align-top ${processing === p.id ? 'opacity-50 pointer-events-none' : ''}`}>
                      <td className="px-4 sm:px-6 py-4">
                        <p className="font-medium text-gray-900 truncate max-w-[180px]">{p.name}</p>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <p className="text-sm text-gray-900">{p.owner?.first_name} {p.owner?.last_name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[160px]">{p.owner?.email}</p>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className="text-sm text-gray-600">{p.provider_type?.display_name || '—'}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className="text-sm text-gray-600">{p.shops?.length ?? 0}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusBadge(p.status)}`}>
                          {statusIcon(p.status)}
                          {p.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
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
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/admin/providers/${p.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap">
                            View
                          </Link>
                          <ActionMenu
                            actions={actions}
                            onAction={handleAction}
                            entityId={p.id}
                            entityName={p.name}
                            processing={processing === p.id}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
      </div>
    </div>
  )
}