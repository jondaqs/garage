'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Calendar, Truck, Wrench } from 'lucide-react'

// Status code → display config
// BUG 1.6 FIX: status is stored via status_id FK to booking_statuses.
// We join booking_statuses and use status.code for filtering/display.
const STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: 'yellow' },
  confirmed:   { label: 'Confirmed',   color: 'blue' },
  in_progress: { label: 'In Progress', color: 'purple' },
  completed:   { label: 'Completed',   color: 'green' },
  cancelled:   { label: 'Cancelled',   color: 'red' },
}

const FILTER_OPTIONS = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled']

export default function CompanyBookingsPage() {
  const [bookings, setBookings] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBookings()
  }, [filter])

  const fetchBookings = async () => {
    setLoading(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!userProfile) return

      // Resolve company — owner or member
      let companyId = null

      const { data: ownedCompany } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('owner_user_id', userProfile.id)
        .maybeSingle()

      if (ownedCompany) {
        companyId = ownedCompany.id
      } else {
        const { data: companyUser } = await supabase
          .from('company_users')
          .select('company_id')
          .eq('user_id', userProfile.id)
          .eq('is_active', true)
          .maybeSingle()

        if (companyUser) companyId = companyUser.company_id
      }

      if (!companyId) return

      // Get all fleet vehicle IDs for this company
      const { data: fleet } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_company_id', companyId)

      if (!fleet || fleet.length === 0) {
        setBookings([])
        setLoading(false)
        return
      }

      const vehicleIds = fleet.map(v => v.vehicle_id)

      // BUG 1.6 FIX:
      // - provider table is service_providers (not provider_profiles)
      // - status is via status_id → booking_statuses (not a direct string column)
      // - vehicle column is plate_number (not license_plate)
      let query = supabase
        .from('bookings')
        .select(`
          id,
          booking_date,
          booking_time_start,
          booking_time_end,
          problem_description,
          estimated_cost,
          final_cost,
          created_at,
          vehicle:vehicles(id, plate_number, make, model, color),
          provider:service_providers(id, name),
          status:booking_statuses(code, display_name, color_code)
        `)
        .in('vehicle_id', vehicleIds)
        .order('created_at', { ascending: false })

      // Filter by status code via the joined table
      if (filter !== 'all') {
        // We filter client-side after fetching since PostgREST
        // doesn't support filtering on joined table columns directly in .eq()
        // The query fetches all and we filter below
      }

      const { data: bookingsData, error } = await query

      if (error) throw error

      // Apply status filter client-side on the joined status.code
      const filtered = filter === 'all'
        ? (bookingsData || [])
        : (bookingsData || []).filter(b => b.status?.code === filter)

      setBookings(filtered)

    } catch (error) {
      console.error('Error fetching bookings:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusCfg = (booking) => {
    const code = booking.status?.code || 'pending'
    return STATUS_CONFIG[code] || { label: code, color: 'gray' }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }

  // Count by status from loaded bookings (unfiltered for stats bar)
  const countByStatus = (code) =>
    bookings.filter(b => b.status?.code === code).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Bookings</h1>
          <p className="text-sm text-gray-500 mt-1">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/company/bookings/book"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Book Service
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTER_OPTIONS.map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {bookings.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings found</h3>
          <p className="text-gray-500 mb-6">
            {filter === 'all'
              ? "You haven't booked any services for your fleet yet"
              : `No ${filter.replace(/_/g, ' ')} bookings`}
          </p>
          <Link
            href="/company/bookings/book"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Book Your First Service
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const statusCfg = getStatusCfg(booking)
            const statusColorClass = `bg-${statusCfg.color}-100 text-${statusCfg.color}-800`

            return (
              <Link
                key={booking.id}
                href={`/company/bookings/${booking.id}`}
                className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-blue-50 rounded-lg shrink-0">
                      <Wrench className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {booking.problem_description
                          ? booking.problem_description.slice(0, 60) + (booking.problem_description.length > 60 ? '…' : '')
                          : 'Service Booking'}
                      </h3>
                      {/* BUG 1.6 FIX: plate_number not license_plate */}
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Truck className="w-3.5 h-3.5" />
                        <span>
                          {booking.vehicle?.plate_number || '—'} · {booking.vehicle?.make} {booking.vehicle?.model}
                        </span>
                      </div>
                      {/* BUG 1.6 FIX: provider is service_providers.name not provider_profiles.business_name */}
                      {booking.provider?.name && (
                        <p className="text-sm text-gray-500 mt-0.5">
                          {booking.provider.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColorClass} whitespace-nowrap`}>
                    {booking.status?.display_name || statusCfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Booking Date</p>
                    <p className="font-medium">{formatDate(booking.booking_date)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Time</p>
                    <p className="font-medium">
                      {booking.booking_time_start
                        ? booking.booking_time_start.slice(0, 5)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Created</p>
                    <p className="font-medium">{formatDate(booking.created_at)}</p>
                  </div>
                  {(booking.estimated_cost || booking.final_cost) && (
                    <div>
                      <p className="text-gray-500">
                        {booking.final_cost ? 'Final Cost' : 'Estimated'}
                      </p>
                      <p className="font-medium">
                        KES {(booking.final_cost || booking.estimated_cost).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Stats bar */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: bookings.length, color: 'text-gray-900' },
          { label: 'Pending', value: countByStatus('pending'), color: 'text-yellow-600' },
          { label: 'In Progress', value: countByStatus('in_progress'), color: 'text-purple-600' },
          { label: 'Completed', value: countByStatus('completed'), color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}