'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import AddToCalendarButton from '@/components/calendar/AddToCalendarButton'
import {
  ArrowLeft, Truck, MapPin, Calendar, Clock,
  Phone, Mail, Wrench, XCircle, AlertCircle, CheckCircle
} from 'lucide-react'

export default function MemberBookingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const companyId = params.companyId

  const [booking, setBooking]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError]           = useState(null)

  useEffect(() => {
    if (params.id) loadBooking()
  }, [params.id])

  const loadBooking = async () => {
    try {
      // Verify membership
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
      const { data: mem } = await supabase.from('company_users')
        .select('can_manage_fleet, is_admin').eq('user_id', profile.id).eq('company_id', companyId).eq('is_active', true).maybeSingle()
      if (!mem) { setError('Access denied'); setLoading(false); return }

      const { data, error: fetchError } = await supabase
        .from('bookings_secure')
        .select(`
          id, booking_number, booking_date, booking_time_start, booking_time_end,
          problem_description, special_instructions, customer_phone, customer_email,
          priority, created_at, estimated_cost, final_cost,
          vehicle:vehicles(id, plate_number, make, model, year_of_manufacture, color),
          provider:service_providers(id, name, phone, email),
          shop:shops(id, name, town, county, street),
          status:booking_statuses(code, display_name, color_code),
          booking_services(service:services(id, name, category))
        `)
        .eq('id', params.id)
        .single()

      if (fetchError) throw fetchError
      setBooking(data)
    } catch (err) {
      console.error(err)
      setError('Failed to load booking')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this booking?\nThe service provider will be notified.')) return

    setCancelling(true)
    try {
      const res  = await fetch(`/api/bookings/${booking.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ statusCode: 'cancelled_customer' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to cancel')
      loadBooking()
    } catch (err) {
      console.error(err)
      setError('Failed to cancel booking: ' + err.message)
    } finally {
      setCancelling(false)
    }
  }

  const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  const formatTime = (t) => t ? t.slice(0, 5) : '—'

  const statusColors = {
    pending:     'bg-yellow-100 text-yellow-800',
    confirmed:   'bg-blue-100 text-blue-800',
    in_progress: 'bg-purple-100 text-purple-800',
    completed:   'bg-green-100 text-green-800',
    cancelled:   'bg-red-100 text-red-800',
  }

  const canCancel = ['pending', 'confirmed'].includes(booking?.status?.code)

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (error || !booking) return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" /> {error || 'Booking not found'}
      </div>
      <Link href={`/dashboard/company/${companyId}/bookings`} className="inline-flex items-center gap-1.5 mt-4 text-sm text-blue-600">
        <ArrowLeft className="w-4 h-4" /> Back to Bookings
      </Link>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/company/${companyId}/bookings`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">
              {booking.booking_number || 'Booking'}
            </h1>
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
              statusColors[booking.status?.code] || 'bg-gray-100 text-gray-700'
            }`}>
              {booking.status?.display_name || booking.status?.code}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {new Date(booking.created_at).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        {/* Add to Calendar — shown for non-cancelled bookings */}
        {!['cancelled'].includes(booking?.status?.code) && (
          <AddToCalendarButton
            booking={{
              ...booking,
              // company page uses 'provider' alias; addToCalendar expects 'service_provider'
              service_provider: booking.provider,
            }}
            variant="dropdown"
          />
        )}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>

      {/* Vehicle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Fleet Vehicle</h2>
        </div>
        {booking.vehicle ? (
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div>
              <p className="text-xs text-gray-400">Plate Number</p>
              <p className="font-semibold text-gray-900">{booking.vehicle.plate_number}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Make / Model</p>
              <p className="font-medium text-gray-700">{booking.vehicle.make} {booking.vehicle.model}</p>
            </div>
            {booking.vehicle.year_of_manufacture && (
              <div>
                <p className="text-xs text-gray-400">Year</p>
                <p className="font-medium text-gray-700">{booking.vehicle.year_of_manufacture}</p>
              </div>
            )}
            {booking.vehicle.color && (
              <div>
                <p className="text-xs text-gray-400">Color</p>
                <p className="font-medium text-gray-700 capitalize">{booking.vehicle.color}</p>
              </div>
            )}
          </div>
        ) : <p className="text-sm text-gray-400">Vehicle not found</p>}
      </div>

      {/* Date & Provider */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Schedule</h2>
          </div>
          <p className="text-sm font-medium text-gray-900">{formatDate(booking.booking_date)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {formatTime(booking.booking_time_start)} – {formatTime(booking.booking_time_end)}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Provider</h2>
          </div>
          <p className="text-sm font-semibold text-gray-900">{booking.provider?.name}</p>
          {booking.shop && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {booking.shop.town}, {booking.shop.county}
            </p>
          )}
          {booking.provider?.phone && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Phone className="w-3 h-3" /> {booking.provider.phone}
            </p>
          )}
        </div>
      </div>

      {/* Services */}
      {booking.booking_services?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Services</h2>
          <div className="space-y-2">
            {booking.booking_services.map((bs, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-gray-800">{bs.service?.name}</span>
                </div>
                {bs.service?.category && (
                  <span className="text-xs text-gray-400 capitalize">{bs.service.category}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost */}
      {(booking.estimated_cost || booking.final_cost) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Cost</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {booking.estimated_cost && (
              <div>
                <p className="text-xs text-gray-400">Estimated</p>
                <p className="font-semibold text-gray-900">KES {Number(booking.estimated_cost).toLocaleString()}</p>
              </div>
            )}
            {booking.final_cost && (
              <div>
                <p className="text-xs text-gray-400">Final</p>
                <p className="font-semibold text-green-700">KES {Number(booking.final_cost).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {(booking.problem_description || booking.special_instructions) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
          {booking.problem_description && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Problem Description</p>
              <p className="text-sm text-gray-800">{booking.problem_description}</p>
            </div>
          )}
          {booking.special_instructions && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Special Instructions</p>
              <p className="text-sm text-gray-800">{booking.special_instructions}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

    </div>
  )
}