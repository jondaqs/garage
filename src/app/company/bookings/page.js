'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { 
  Plus, 
  Calendar,
  Truck,
  Wrench
} from 'lucide-react'

export default function CompanyBookingsPage() {
  const [bookings, setBookings] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBookings()
  }, [filter])

  const fetchBookings = async () => {
    const supabase = createClient()
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', userProfile.id)
        .single()

      if (!companyUser) return

      // Fetch company fleet vehicles
      const { data: fleet } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_company_id', companyUser.company_id)

      if (!fleet || fleet.length === 0) {
        setBookings([])
        setLoading(false)
        return
      }

      const vehicleIds = fleet.map(v => v.vehicle_id)

      // Fetch bookings for company vehicles
      let query = supabase
        .from('bookings')
        .select(`
          *,
          vehicle:vehicles(*),
          provider:provider_profiles(business_name)
        `)
        .in('vehicle_id', vehicleIds)
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data: bookingsData, error } = await query

      if (error) throw error

      setBookings(bookingsData || [])

    } catch (error) {
      console.error('Error fetching bookings:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'yellow',
      'confirmed': 'blue',
      'in_progress': 'purple',
      'completed': 'green',
      'cancelled': 'red'
    }
    return colors[status] || 'gray'
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading bookings...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Company Bookings</h1>
        <Link
          href="/company/bookings/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Book Service
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg capitalize ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Bookings List */}
      {bookings.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No bookings found
          </h3>
          <p className="text-gray-500 mb-6">
            {filter === 'all' 
              ? "You haven't booked any services yet for your fleet"
              : `No ${filter} bookings found`}
          </p>
          <Link
            href="/company/bookings/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Book Your First Service
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const statusColor = getStatusColor(booking.status)
            
            return (
              <Link
                key={booking.id}
                href={`/company/bookings/${booking.id}`}
                className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <Wrench className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">
                        {booking.service_type || 'Service Booking'}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Truck className="w-4 h-4" />
                        <span>
                          {booking.vehicle?.license_plate} - {booking.vehicle?.make} {booking.vehicle?.model}
                        </span>
                      </div>
                      {booking.provider && (
                        <p className="text-sm text-gray-600 mt-1">
                          Provider: {booking.provider.business_name}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <span className={`px-3 py-1 text-sm font-medium rounded-full bg-${statusColor}-100 text-${statusColor}-800 capitalize`}>
                    {booking.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Booking Date</p>
                    <p className="font-medium">{formatDate(booking.booking_date)}</p>
                  </div>
                  {booking.scheduled_date && (
                    <div>
                      <p className="text-gray-600">Scheduled For</p>
                      <p className="font-medium">{formatDate(booking.scheduled_date)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-600">Created</p>
                    <p className="font-medium">{new Date(booking.created_at).toLocaleDateString()}</p>
                  </div>
                  {booking.total_cost && (
                    <div>
                      <p className="text-gray-600">Estimated Cost</p>
                      <p className="font-medium">KES {booking.total_cost.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {booking.notes && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Notes:</span> {booking.notes}
                    </p>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {/* Quick Stats */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Total Bookings</p>
          <p className="text-2xl font-bold">{bookings.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">
            {bookings.filter(b => b.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">In Progress</p>
          <p className="text-2xl font-bold text-purple-600">
            {bookings.filter(b => b.status === 'in_progress').length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Completed</p>
          <p className="text-2xl font-bold text-green-600">
            {bookings.filter(b => b.status === 'completed').length}
          </p>
        </div>
      </div>
    </div>
  )
}