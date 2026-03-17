'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle, XCircle, PlayCircle, Flag, AlertCircle, Calendar, MapPin, Car, Phone, Mail, MessageSquare } from 'lucide-react'
import StatusBadge from '@/components/bookings/StatusBadge'

export default function ManageBookingPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  
  const [booking, setBooking] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (params.id) {
      loadBooking()
      loadMessages()
    }
  }, [params.id])

  const loadBooking = async () => {
    try {
      setError('')
      
      const { data, error: fetchError } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:user_profiles!customer_user_id(first_name, last_name, phone, email),
          shop:shops(name, town, county, street),
          vehicle:vehicles(plate_number, make, model, year_of_manufacture),
          status:booking_statuses(code, display_name, color_code),
          booking_services(service:services(name))
        `)
        .eq('id', params.id)
        .single()

      if (fetchError) {
        console.error('Error loading booking:', fetchError)
        setError(fetchError.message || 'Failed to load booking')
        return
      }

      if (!data) {
        setError('Booking not found')
        return
      }

      setBooking(data)
    } catch (error) {
      console.error('Error loading booking:', error)
      setError('An unexpected error occurred')
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

      const { error: insertError } = await supabase
        .from('booking_messages')
        .insert({
          booking_id: params.id,
          sender_user_id: profile.id,
          message: newMessage
        })

      if (insertError) throw insertError

      setNewMessage('')
      loadMessages()
      
      // Send notification to customer
      await supabase
        .from('notifications')
        .insert({
          recipient_user_id: booking.customer_user_id,
          notification_type: 'new_message',
          title: 'New Message',
          message: `New message on booking #${booking.booking_number}`,
          reference_id: params.id,
          reference_type: 'booking'
        })
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Failed to send message: ' + error.message)
    } finally {
      setSending(false)
    }
  }

  const updateStatus = async (statusCode) => {
    if (!confirm(`Are you sure you want to ${statusCode.replace('_', ' ')} this booking?`)) {
      return
    }

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

      const updateData = { status_id: newStatus.id }

      // Add specific fields based on status
      if (statusCode === 'confirmed') {
        updateData.confirmed_by_provider_at = new Date().toISOString()
        updateData.confirmed_by_provider_user_id = profile.id
      }

      await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', params.id)

      // Send notification to customer
      await supabase
        .from('notifications')
        .insert({
          recipient_user_id: booking.customer_user_id,
          notification_type: `booking_${statusCode}`,
          title: `Booking ${statusCode.replace('_', ' ')}`,
          message: `Your booking #${booking.booking_number} has been ${statusCode.replace('_', ' ')}`,
          reference_id: params.id,
          reference_type: 'booking'
        })

      alert(`Booking ${statusCode.replace('_', ' ')} successfully`)
      loadBooking()
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status: ' + error.message)
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

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button 
          onClick={() => router.back()} 
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Bookings
        </button>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <AlertCircle className="mx-auto text-red-600 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-red-900 mb-2">Booking Not Found</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => router.push('/provider/bookings')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View All Bookings
          </button>
        </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <button 
          onClick={() => router.back()} 
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Bookings
        </button>
        
        <div className="text-center py-12">
          <p className="text-gray-600">Booking not found</p>
        </div>
      </div>
    )
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

      {/* Booking Details Card */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Booking #{booking.booking_number}
            </h1>
            <StatusBadge status={booking.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Customer Information</h3>
            <div className="space-y-2">
              <p className="text-gray-700 font-medium">
                {booking.customer?.first_name} {booking.customer?.last_name}
              </p>
              <div className="flex items-center text-sm text-gray-600">
                <Phone size={16} className="mr-2" />
                {booking.customer?.phone}
              </div>
              {booking.customer?.email && (
                <div className="flex items-center text-sm text-gray-600">
                  <Mail size={16} className="mr-2" />
                  {booking.customer?.email}
                </div>
              )}
            </div>
          </div>

          {/* Appointment Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Appointment</h3>
            <div className="flex items-start text-gray-700">
              <Calendar size={16} className="mr-2 mt-1 flex-shrink-0" />
              <div>
                <p>{new Date(booking.booking_date).toLocaleDateString('en-US', { 
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</p>
                <p className="text-sm text-gray-600">
                  {booking.booking_time_start} - {booking.booking_time_end}
                </p>
              </div>
            </div>
          </div>

          {/* Location Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Location</h3>
            <div className="flex items-start text-gray-700">
              <MapPin size={16} className="mr-2 mt-1 flex-shrink-0" />
              <div>
                <p>{booking.shop?.name}</p>
                <p className="text-sm text-gray-600">
                  {booking.shop?.town}, {booking.shop?.county}
                </p>
                {booking.shop?.street && (
                  <p className="text-sm text-gray-600">{booking.shop?.street}</p>
                )}
              </div>
            </div>
          </div>

          {/* Vehicle Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Vehicle</h3>
            <div className="flex items-start text-gray-700">
              <Car size={16} className="mr-2 mt-1 flex-shrink-0" />
              <div>
                <p className="font-medium">{booking.vehicle?.plate_number}</p>
                <p className="text-sm text-gray-600">
                  {booking.vehicle?.make} {booking.vehicle?.model}
                </p>
                {booking.vehicle?.year_of_manufacture && (
                  <p className="text-sm text-gray-600">
                    Year: {booking.vehicle?.year_of_manufacture}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Requested Services */}
        <div className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">Requested Services</h3>
          <div className="flex flex-wrap gap-2">
            {booking.booking_services?.map((bs, idx) => (
              <span 
                key={idx} 
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {bs.service?.name}
              </span>
            ))}
          </div>
        </div>

        {/* Problem Description */}
        {booking.problem_description && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 mb-2">Problem Description</h3>
            <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
              {booking.problem_description}
            </p>
          </div>
        )}

        {/* Special Instructions */}
        {booking.special_instructions && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 mb-2">Special Instructions</h3>
            <p className="text-gray-700 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              {booking.special_instructions}
            </p>
          </div>
        )}
      </div>

      {/* Actions Card */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking Actions</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {booking.status?.code === 'pending' && (
            <>
              <button
                onClick={() => updateStatus('confirmed')}
                disabled={updating}
                className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50 font-medium"
              >
                <CheckCircle size={20} />
                Confirm
              </button>
              <button
                onClick={() => updateStatus('cancelled')}
                disabled={updating}
                className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50 font-medium"
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
              className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 disabled:opacity-50 font-medium"
            >
              <PlayCircle size={20} />
              Start Work
            </button>
          )}
          
          {booking.status?.code === 'in_progress' && (
            <button
              onClick={() => updateStatus('completed')}
              disabled={updating}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50 font-medium"
            >
              <Flag size={20} />
              Complete
            </button>
          )}
          
          {['completed', 'cancelled'].includes(booking.status?.code) && (
            <div className="col-span-2 md:col-span-4 text-center py-4 text-gray-500">
              No actions available for {booking.status?.display_name} bookings
            </div>
          )}
        </div>

        {/* Status Guide */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Status Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium text-gray-900">Confirm:</span>
                <span className="text-gray-600"> Accept the booking and notify customer</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <PlayCircle size={16} className="text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium text-gray-900">Start Work:</span>
                <span className="text-gray-600"> Begin working on the vehicle</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Flag size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium text-gray-900">Complete:</span>
                <span className="text-gray-600"> Mark work as finished</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <XCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium text-gray-900">Reject:</span>
                <span className="text-gray-600"> Decline the booking request</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare size={20} />
          Messages with Customer
        </h2>
        
        <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No messages yet</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-gray-900">
                    {msg.sender?.first_name} {msg.sender?.last_name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-700">{msg.message}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={sendMessage} className="flex gap-2">
          <input 
            type="text" 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)} 
            placeholder="Type your message to customer..." 
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
          />
          <button 
            type="submit" 
            disabled={sending || !newMessage.trim()} 
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}