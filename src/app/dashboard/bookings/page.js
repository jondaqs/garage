'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Calendar, Plus, Filter, X, CalendarDays } from 'lucide-react'
import BookingCard from '@/components/bookings/BookingCard'

export default function BookingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDate, setSelectedDate] = useState(null)

  useEffect(() => {
    loadBookings()
    
    // Check if user selected a date from calendar
    const storedDate = sessionStorage.getItem('selectedBookingDate')
    if (storedDate) {
      setSelectedDate(storedDate)
    }
  }, [])

  const loadBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          service_provider:service_providers(name, phone),
          shop:shops(name, town, county),
          vehicle:vehicles(plate_number, make, model),
          status:booking_statuses(code, display_name, color_code),
          booking_services(
            service:services(name)
          )
        `)
        .eq('customer_user_id', profile.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setBookings(data || [])
    } catch (error) {
      console.error('Error loading bookings:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearSelectedDate = () => {
    sessionStorage.removeItem('selectedBookingDate')
    setSelectedDate(null)
  }

  const filteredBookings = statusFilter === 'all'
    ? bookings
    : bookings.filter(b => b.status?.code === statusFilter)

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Selected Date Banner */}
      {selectedDate && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <CalendarDays className="text-blue-600 mt-0.5 flex-shrink-0" size={24} />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  Booking Date Selected: {new Date(selectedDate).toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h3>
                <p className="text-blue-700 text-sm">
                  Select a vehicle below to create a booking for this date. The date will be automatically filled in the booking form.
                </p>
              </div>
            </div>
            <button
              onClick={clearSelectedDate}
              className="text-blue-600 hover:text-blue-800"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Bookings</h1>
          <p className="text-gray-600">{bookings.length} total bookings</p>
        </div>
        <button
          onClick={() => {
            clearSelectedDate()
            router.push('/dashboard/bookings/book')
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          New Booking
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4">
        <Filter size={20} className="text-gray-500" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Calendar className="mx-auto text-gray-400 mb-4" size={64} />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {statusFilter === 'all' ? 'No bookings yet' : `No ${statusFilter} bookings`}
          </h3>
          <p className="text-gray-600 mb-6">
            {statusFilter === 'all' 
              ? 'Create your first booking to get started' 
              : 'Try selecting a different filter'}
          </p>
          {statusFilter === 'all' && (
            <button
              onClick={() => {
                clearSelectedDate()
                router.push('/dashboard/bookings/book')
              }}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create First Booking
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map(booking => (
            <BookingCard 
              key={booking.id} 
              booking={booking}
              selectedDate={selectedDate}
            />
          ))}
        </div>
      )}
    </div>
  )
}