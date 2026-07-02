'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Clock, CheckCircle, XCircle, Eye, History, AlertTriangle,
  ArrowRight, Store,
} from 'lucide-react'
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

export default function PendingProvidersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [providers,  setProviders]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [page,       setPage]       = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => { loadPendingProviders() }, [page])

  const loadPendingProviders = async () => {
    setLoading(true)
    try {
      const from = (page - 1) * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      const { data: pendingRows, error, count } = await supabase
        .from('provider_pending_changes')
        .select('*', { count: 'exact' })
        .order('changed_at', { ascending: false, nullsFirst: false })
        .range(from, to)

      if (error) throw error
      setTotalCount(count || 0)

      const ids = (pendingRows || []).map(r => r.service_provider_id)
      let detailsById = {}
      if (ids.length > 0) {
        const { data: details } = await supabase
          .from('service_providers_secure')
          .select(`
            id, registration_number, submitted_at, created_at, owner_user_id,
            owner:user_profiles_secure(first_name, last_name, email, phone),
            provider_type:service_provider_types(display_name)
          `)
          .in('id', ids)
        detailsById = Object.fromEntries((details || []).map(d => [d.id, d]))
      }

      const merged = (pendingRows || []).map(r => ({ ...r, ...(detailsById[r.service_provider_id] || {}) }))
      setProviders(merged)
    } catch (err) {
      console.error('Error loading providers:', err?.message || err)
      setLoadError(err?.message || 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  const DOC_TYPE_SHORT = {
    business_license: 'Business Reg.',
    tax_compliance:   'KRA PIN',
    insurance:        'Insurance',
    id_passport:      'ID/Passport',
  }
  const summarizeChanges = (changedFields) => {
    if (!changedFields) return []
    const labels = []
    for (const [field, value] of Object.entries(changedFields)) {
      if (field === 'documents' && Array.isArray(value)) {
        for (const entry of value) {
          const action = entry.action?.replace(/^./, c => c.toUpperCase()) || 'Changed'
          const type   = DOC_TYPE_SHORT[entry.doc_type] || entry.doc_type
          labels.push(`${action}: ${type}`)
        }
      } else {
        labels.push(FIELD_LABELS[field] || field)
      }
    }
    return labels
  }

  if (loading && page === 1) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>Error:</strong> {loadError}
        </div>
      )}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pending Provider Registrations</h1>
          <p className="text-gray-500 mt-1">{totalCount} application{totalCount === 1 ? '' : 's'} awaiting review</p>
        </div>
        <Link
          href="/admin/providers/all"
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          View all providers <ArrowRight size={14} />
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Changes Requested</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {providers.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-gray-400">
                  <Store className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  No pending provider applications
                </td>
              </tr>
            ) : (
              providers.map((p) => {
                const changedLabels = summarizeChanges(p.changed_fields)
                const isRevet = p.is_reverification
                return (
                  <tr key={p.service_provider_id} className="hover:bg-gray-50 align-top">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      {p.registration_number && (
                        <p className="text-xs text-gray-400">Reg: {p.registration_number}</p>
                      )}
                      {isRevet && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                          <History className="w-3 h-3" /> Re-verification
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">
                        {p.owner ? `${p.owner.first_name || ''} ${p.owner.last_name || ''}`.trim() || '—' : '—'}
                      </p>
                      <p className="text-xs text-gray-400">{p.owner?.email || ''}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{p.provider_type?.display_name || '—'}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {p.submitted_at
                        ? new Date(p.submitted_at).toLocaleDateString()
                        : p.changed_at
                          ? new Date(p.changed_at).toLocaleDateString()
                          : '—'}
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      {changedLabels.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">No tracked changes</span>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
                            <span className="text-xs font-medium text-gray-900">
                              {p.change_count} change{p.change_count === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {changedLabels.slice(0, 4).map((label) => (
                              <span key={label} className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800 rounded">
                                {label}
                              </span>
                            ))}
                            {changedLabels.length > 4 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">
                                +{changedLabels.length - 4} more
                              </span>
                            )}
                          </div>
                          {p.verified_at_snapshot && isRevet && (
                            <p className="text-[10px] text-gray-400 mt-1">
                              Last verified {new Date(p.verified_at_snapshot).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/providers/${p.service_provider_id}`}
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        <Eye size={14} /> Review
                      </Link>
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