'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Calendar, Plus, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import BookingCard from '@/components/bookings/BookingCard'

export default function BookingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  useEffect(() => {
    loadBookings()
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

  const filteredBookings = statusFilter === 'all'
    ? bookings
    : bookings.filter(b => b.status?.code === statusFilter)

  useEffect(() => { setPage(1) }, [statusFilter, pageSize])
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize))
  const paginated  = filteredBookings.slice((page - 1) * pageSize, page * pageSize)

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Bookings</h1>
          <p className="text-gray-600">{bookings.length} total bookings</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/bookings/book')}
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
              onClick={() => router.push('/dashboard/bookings/book')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create First Booking
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {paginated.map(booking => (
              <BookingCard 
                key={booking.id} 
                booking={booking}
                onClick={() => router.push(`/dashboard/bookings/${booking.id}`)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4 bg-white rounded-lg shadow-sm px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Show</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                  {[5, 10, 25].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let p; if (totalPages <= 5) p = i + 1; else if (page <= 3) p = i + 1; else if (page >= totalPages - 2) p = totalPages - 4 + i; else p = page - 2 + i
                  return <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded text-sm font-medium ${p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
              <p className="text-xs text-gray-400">{(page-1)*pageSize+1}–{Math.min(page*pageSize, filteredBookings.length)} of {filteredBookings.length}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}