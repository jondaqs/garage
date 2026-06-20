'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, AlertCircle, Truck, Plus, ChevronRight, Loader2, BadgeCheck } from 'lucide-react'
import VerificationScore from '@/components/VerificationScore'
import useCompanyAccess from '@/hooks/useCompanyAccess'
import CompanyWriteGate from '@/components/CompanyWriteGate'
import CompanyAccessBanner from '@/components/CompanyAccessBanner'

const STATUS_COLORS = {
  pending:     'bg-yellow-100 text-yellow-800',
  confirmed:   'bg-blue-100   text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed:   'bg-green-100  text-green-800',
  cancelled:   'bg-red-100    text-red-800',
}

export default function MemberBookingsPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [bookings,   setBookings]   = useState([])
  const [membership, setMembership] = useState(null)
  const access = useCompanyAccess(companyId)
  const [filter,     setFilter]     = useState('all')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [page,       setPage]       = useState(1)
  const [perPage,    setPerPage]    = useState(5)
  const [total,      setTotal]      = useState(0)

  useEffect(() => { setPage(1) }, [filter])
  useEffect(() => { fetchData() }, [companyId, filter, page, perPage])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) return

      // Verify membership
      const { data: mem } = await supabase
        .from('company_users')
        .select('is_admin, can_manage_fleet')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!mem) { setError('You are not a member of this company.'); setLoading(false); return }
      setMembership(mem)

      // Get fleet vehicle IDs
      const { data: fleet } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_company_id', companyId)

      if (!fleet || fleet.length === 0) {
        setBookings([])
        setLoading(false)
        return
      }

      const vehicleIds = fleet.map(f => f.vehicle_id)

      // Status filter
      let statusId = null
      if (filter !== 'all') {
        const { data: statusRow } = await supabase
          .from('booking_statuses').select('id').eq('code', filter).maybeSingle()
        statusId = statusRow?.id || null
      }

      // Count total matching rows
      let countQ = supabase.from('bookings_secure').select('id', { count: 'exact', head: true })
        .in('vehicle_id', vehicleIds)
      if (statusId) countQ = countQ.eq('status_id', statusId)
      const { count } = await countQ
      setTotal(count || 0)

      // Fetch page
      const from = (page - 1) * perPage
      const to   = from + perPage - 1
      let query = supabase
        .from('bookings_secure')
        .select(`
          id, booking_number, booking_date, booking_time_start,
          created_at,
          status:booking_statuses(code, display_name, color_code),
          vehicle:vehicles_secure(plate_number, make, model),
          provider:service_providers_secure(name, is_verified, verification_score),
          bookedBy:user_profiles_secure!bookings_customer_user_id_fkey(first_name, last_name)
        `)
        .in('vehicle_id', vehicleIds)
        .order('booking_date', { ascending: false })
        .range(from, to)
      if (statusId) query = query.eq('status_id', statusId)

      const { data, error: bErr } = await query
      if (bErr) throw bErr
      setBookings(data ?? [])
    } catch (err) {
      setError('Failed to load bookings.')
    } finally {
      setLoading(false)
    }
  }

  const filters = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled']

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" /><p>{error}</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Bookings</h1>
          <p className="text-sm text-gray-500 mt-1">Fleet service bookings</p>
        </div>
        {(membership?.can_manage_fleet || membership?.is_admin) && (
          <CompanyWriteGate canWrite={access.canWrite} state={access.state}>
          <button
            onClick={() => router.push(`/dashboard/company/${companyId}/bookings/book`)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Book Service
          </button>
          </CompanyWriteGate>
        )}
      </div>

      {!access.loading && <CompanyAccessBanner {...access} companyId={companyId} />}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium capitalize transition
              ${filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Calendar className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No bookings found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Reference', 'Vehicle', 'Provider', 'Date', 'Status', 'Booked by', ''].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bookings.map(b => (
                <tr key={b.id} onClick={() => router.push(`/dashboard/company/${companyId}/bookings/${b.id}`)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-6 py-4 text-sm font-mono text-gray-600">
                    {b.booking_number || b.id.slice(0, 8)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{b.vehicle?.plate_number || '—'}</p>
                        <p className="text-xs text-gray-400">{[b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <span className="flex items-center gap-1">
                      {b.provider?.name || '—'}
                      {b.provider?.is_verified && (
                        <BadgeCheck size={12} className="text-blue-500 flex-shrink-0" />
                      )}
                      {b.provider?.verification_score > 0 && (
                        <VerificationScore score={b.provider.verification_score} size={16} />
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : '—'}
                    {b.booking_time_start && (
                      <span className="text-xs text-gray-400 ml-1">{b.booking_time_start.slice(0,5)}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full capitalize ${STATUS_COLORS[b.status?.code] ?? 'bg-gray-100 text-gray-700'}`}>
                      {b.status?.display_name || b.status?.code || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {b.bookedBy ? (
                      <span className="text-xs text-gray-600 font-medium">
                        {b.bookedBy.first_name} {b.bookedBy.last_name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight size={16} className="text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          {/* Per-page selector */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Show</span>
            <select value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
              {[5, 10, 20, 50].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>
              per page · showing {Math.min((page - 1) * perPage + 1, total)}–{Math.min(page * perPage, total)} of {total}
            </span>
          </div>

          {/* Page buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Prev
            </button>

            {/* Page number pills */}
            {Array.from({ length: Math.ceil(total / perPage) }, (_, i) => i + 1)
              .filter(p => p === 1 || p === Math.ceil(total / perPage) || Math.abs(p - page) <= 1)
              .reduce((acc, p, i, arr) => {
                if (i > 0 && p - arr[i - 1] > 1) acc.push('…')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) => p === '…'
                ? <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">…</span>
                : <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      p === page
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {p}
                  </button>
              )
            }

            <button
              onClick={() => setPage(p => Math.min(Math.ceil(total / perPage), p + 1))}
              disabled={page >= Math.ceil(total / perPage)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              Next
            </button>
            <button
              onClick={() => setPage(Math.ceil(total / perPage))}
              disabled={page >= Math.ceil(total / perPage)}
              className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}