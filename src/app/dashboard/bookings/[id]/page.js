'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, MapPin, Car, Phone, Mail, MessageSquare, XCircle } from 'lucide-react'
import StatusBadge from '@/components/bookings/StatusBadge'

export default function BookingDetailPage({ params }) {
  const router = useRouter()
  const supabase = createClient()
  const [booking, setBooking] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadBooking()
    loadMessages()
  }, [params.id])

  const loadBooking = async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          service_provider:service_providers(name, phone, email),
          shop:shops(name, town, county, street),
          vehicle:vehicles(plate_number, make, model, year_of_manufacture),
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

  const loadMessages = async () => {
    try {
      const { data } = await supabase
        .from('booking_messages')
        .select('*, sender:user_profiles(first_name, last_name)')
        .eq('booking_id', params.id)
        .order('created_at', { ascending: true })

      setMessages(data || [])
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    setSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      await supabase.from('booking_messages').insert({
        booking_id: params.id,
        sender_user_id: profile.id,
        message: newMessage
      })

      setNewMessage('')
      loadMessages()
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setSending(false)
    }
  }

  const cancelBooking = async () => {
    if (!confirm('Are you sure you want to cancel this booking?')) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { data: cancelledStatus } = await supabase
        .from('booking_statuses')
        .select('id')
        .eq('code', 'cancelled')
        .single()

      await supabase.from('bookings').update({
        status_id: cancelledStatus.id,
        cancelled_at: new Date().toISOString(),
        cancelled_by_user_id: profile.id,
        cancellation_reason: 'Cancelled by customer'
      }).eq('id', params.id)

      alert('Booking cancelled')
      loadBooking()
    } catch (error) {
      console.error('Error cancelling booking:', error)
      alert('Failed to cancel booking')
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  if (!booking) return <div className="text-center py-12">Booking not found</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft size={20} className="mr-2" />Back to Bookings
      </button>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking #{booking.booking_number}</h1>
            <StatusBadge status={booking.status} />
          </div>
          {booking.status?.code === 'pending' && (
            <button onClick={cancelBooking} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
              <XCircle size={20} />Cancel Booking
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Service Provider</h3>
            <div className="space-y-2">
              <p className="text-gray-700">{booking.service_provider?.name}</p>
              <div className="flex items-center text-sm text-gray-600"><Phone size={16} className="mr-2" />{booking.service_provider?.phone}</div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Location</h3>
            <div className="flex items-start text-gray-700">
              <MapPin size={16} className="mr-2 mt-1 flex-shrink-0" />
              <div><p>{booking.shop?.name}</p><p className="text-sm text-gray-600">{booking.shop?.town}, {booking.shop?.county}</p></div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Appointment</h3>
            <div className="flex items-center text-gray-700">
              <Calendar size={16} className="mr-2" />
              <div><p>{new Date(booking.booking_date).toLocaleDateString()}</p><p className="text-sm text-gray-600">{booking.booking_time_start} - {booking.booking_time_end}</p></div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Vehicle</h3>
            <div className="flex items-center text-gray-700">
              <Car size={16} className="mr-2" />
              <div><p>{booking.vehicle?.plate_number}</p><p className="text-sm text-gray-600">{booking.vehicle?.make} {booking.vehicle?.model}</p></div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">Requested Services</h3>
          <div className="flex flex-wrap gap-2">
            {booking.booking_services?.map((bs, idx) => (
              <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{bs.service?.name}</span>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-2">Problem Description</h3>
          <p className="text-gray-700">{booking.problem_description}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><MessageSquare size={20} />Messages</h2>
        <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
          {messages.length === 0 ? <p className="text-gray-500 text-center py-8">No messages yet</p> : messages.map((msg) => (
            <div key={msg.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-gray-900">{msg.sender?.first_name} {msg.sender?.last_name}</span>
                <span className="text-xs text-gray-500">{new Date(msg.created_at).toLocaleString()}</span>
              </div>
              <p className="text-gray-700">{msg.message}</p>
            </div>
          ))}
        </div>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          <button type="submit" disabled={sending || !newMessage.trim()} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Send</button>
        </form>
      </div>
    </div>
  )
}
