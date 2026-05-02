'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, AlertCircle, Truck, Plus, ChevronRight, Loader2 } from 'lucide-react'

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
  const [filter,     setFilter]     = useState('all')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  useEffect(() => { fetchData() }, [companyId, filter])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
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

      let query = supabase
        .from('bookings')
        .select(`
          id, booking_number, booking_date, booking_time_start,
          created_at,
          status:booking_statuses(code, display_name, color_code),
          vehicle:vehicles(plate_number, make, model),
          provider:service_providers(name)
        `)
        .in('vehicle_id', vehicleIds)
        .order('booking_date', { ascending: false })
        .limit(50)

      if (filter !== 'all') {
        // Filter by status code via join
        const { data: statusRow } = await supabase
          .from('booking_statuses')
          .select('id')
          .eq('code', filter)
          .maybeSingle()
        if (statusRow) query = query.eq('status_id', statusRow.id)
      }

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
          <button
            onClick={() => router.push(`/dashboard/company/${companyId}/bookings/new`)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Book Service
          </button>
        )}
      </div>

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
                {['Reference', 'Vehicle', 'Provider', 'Date', 'Status', ''].map(h => (
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
                  <td className="px-6 py-4 text-sm text-gray-700">{b.provider?.name || '—'}</td>
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
                  <td className="px-6 py-4 text-right">
                    <ChevronRight size={16} className="text-gray-400" />
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