'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, XCircle, PlayCircle, Flag } from 'lucide-react'
import StatusBadge from '@/components/bookings/StatusBadge'

export default function ManageBookingPage({ params }) {
  const router = useRouter()
  const supabase = createClient()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadBooking()
  }, [params.id])

  const loadBooking = async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:user_profiles!customer_user_id(first_name, last_name, phone, email),
          shop:shops(name, town, county),
          vehicle:vehicles(plate_number, make, model),
          status:booking_statuses(code, display_name, color_code),
          booking_services(service:services(name))
        `)
        .eq('id', params.id)
        .single()

      if (error) throw error
      setBooking(data)
    } catch (error) {
      console.error('Error loading booking:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (statusCode) => {
    setUpdating(true)
    try {
      const { data: newStatus } = await supabase
        .from('booking_statuses')
        .select('id')
        .eq('code', statusCode)
        .single()

      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      await supabase
        .from('bookings')
        .update({ status_id: newStatus.id })
        .eq('id', params.id)

      if (statusCode === 'confirmed') {
        await supabase
          .from('bookings')
          .update({
            confirmed_by_provider_at: new Date().toISOString(),
            confirmed_by_provider_user_id: profile.id
          })
          .eq('id', params.id)
      }

      await supabase
        .from('notifications')
        .insert({
          recipient_user_id: booking.customer_user_id,
          notification_type: `booking_${statusCode}`,
          title: `Booking ${statusCode.replace('_', ' ')}`,
          message: `Your booking has been ${statusCode.replace('_', ' ')}`,
          reference_id: params.id,
          reference_type: 'booking'
        })

      alert(`Booking ${statusCode}`)
      loadBooking()
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!booking) {
    return <div className="text-center py-12">Booking not found</div>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Bookings
      </button>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Booking #{booking.booking_number}
            </h1>
            <StatusBadge status={booking.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Customer</h3>
            <p className="text-gray-700">{booking.customer?.first_name} {booking.customer?.last_name}</p>
            <p className="text-sm text-gray-600">{booking.customer?.phone}</p>
            <p className="text-sm text-gray-600">{booking.customer?.email}</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Vehicle</h3>
            <p className="text-gray-700">{booking.vehicle?.plate_number}</p>
            <p className="text-sm text-gray-600">{booking.vehicle?.make} {booking.vehicle?.model}</p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Services</h3>
          <div className="flex flex-wrap gap-2">
            {booking.booking_services?.map((bs, idx) => (
              <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {bs.service?.name}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Problem</h3>
          <p className="text-gray-700">{booking.problem_description}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {booking.status?.code === 'pending' && (
            <>
              <button
                onClick={() => updateStatus('confirmed')}
                disabled={updating}
                className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle size={20} />
                Confirm
              </button>
              <button
                onClick={() => updateStatus('cancelled')}
                disabled={updating}
                className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <XCircle size={20} />
                Reject
              </button>
            </>
          )}
          {booking.status?.code === 'confirmed' && (
            <button
              onClick={() => updateStatus('in_progress')}
              disabled={updating}
              className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <PlayCircle size={20} />
              Start Work
            </button>
          )}
          {booking.status?.code === 'in_progress' && (
            <button
              onClick={() => updateStatus('completed')}
              disabled={updating}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Flag size={20} />
              Complete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
