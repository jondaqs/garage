'use client'

import dynamic from 'next/dynamic'
import { useUserLocation } from '@/hooks/useUserLocation'
import { Navigation } from 'lucide-react'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, Clock, FileText, AlertCircle } from 'lucide-react'

// Dynamic import to avoid SSR issues with Leaflet
const ShopLocationMap = dynamic(
  () => import('@/components/maps/ShopLocationMap'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-80 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-gray-500">Loading map...</div>
      </div>
    )
  }
)

export default function NewBookingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const providerId = searchParams.get('provider')
  const vehicleId = searchParams.get('vehicle')

  const [provider, setProvider] = useState(null)
  const [vehicle, setVehicle] = useState(null)
  const [shops, setShops] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    shop_id: '',
    booking_date: '',
    booking_time: '09:00',
    requested_services: [],
    problem_description: '',
    special_instructions: '',
    customer_phone: '',
    customer_email: ''
  })

  // Add user location hook
  const { 
    location: userLocation, 
    loading: locationLoading, 
    error: locationError,
    permissionDenied,
    requestLocation 
  } = useUserLocation()

  useEffect(() => {
    if (providerId && vehicleId) {
      loadBookingData()
    }
  }, [providerId, vehicleId])

  const loadBookingData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      // Load provider
      const { data: providerData } = await supabase
        .from('service_providers')
        .select('*, provider_type:service_provider_types(display_name)')
        .eq('id', providerId)
        .single()

      setProvider(providerData)

      // Load provider shops
      const { data: shopsData } = await supabase
        .from('shops')
        .select('*')
        .eq('service_provider_id', providerId)
        .eq('is_active', true)

      setShops(shopsData || [])

      // Load available services
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('name')

      setServices(servicesData || [])

      // Load vehicle
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', vehicleId)
        .single()

      setVehicle(vehicleData)

      // Pre-fill user data
      setFormData(prev => ({
        ...prev,
        customer_phone: profile.phone || '',
        customer_email: profile.email || ''
      }))

    } catch (error) {
      console.error('Error loading booking data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleServiceToggle = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      requested_services: prev.requested_services.includes(serviceId)
        ? prev.requested_services.filter(id => id !== serviceId)
        : [...prev.requested_services, serviceId]
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.shop_id) {
      alert('Please select a shop')
      return
    }

    if (formData.requested_services.length === 0) {
      alert('Please select at least one service')
      return
    }

    if (!formData.booking_date) {
      alert('Please select a booking date')
      return
    }

    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // Get pending status
      const { data: pendingStatus } = await supabase
        .from('booking_statuses')
        .select('id')
        .eq('code', 'pending')
        .single()

      // Generate booking number
      const bookingNumber = `BK${Date.now()}`

      // Create booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          booking_number: bookingNumber,
          service_provider_id: providerId,
          shop_id: formData.shop_id,
          vehicle_id: vehicleId,
          customer_user_id: profile.id,
          status_id: pendingStatus.id,
          booking_date: formData.booking_date,
          booking_time_start: formData.booking_time,
          booking_time_end: calculateEndTime(formData.booking_time),
          requested_services: formData.requested_services,
          problem_description: formData.problem_description,
          special_instructions: formData.special_instructions,
          customer_phone: formData.customer_phone,
          customer_email: formData.customer_email,
          priority: 'normal',
          created_by: user.id
        })
        .select()
        .single()

      if (bookingError) throw bookingError

      // Create booking services records
      for (const serviceId of formData.requested_services) {
        await supabase
          .from('booking_services')
          .insert({
            booking_id: booking.id,
            service_id: serviceId
          })
      }

      // Create notification for provider
      await supabase
        .from('notifications')
        .insert({
          recipient_user_id: provider.owner_user_id,
          notification_type: 'new_booking',
          title: 'New Booking Request',
          message: `New booking from ${vehicle.plate_number} for ${formData.booking_date}`,
          reference_id: booking.id,
          reference_type: 'booking'
        })

      alert('Booking created successfully!')
      router.push('/dashboard/bookings')

    } catch (error) {
      console.error('Error creating booking:', error)
      alert('Failed to create booking: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const calculateEndTime = (startTime) => {
    const [hours, minutes] = startTime.split(':')
    const endHours = (parseInt(hours) + 2) % 24
    return `${endHours.toString().padStart(2, '0')}:${minutes}`
  }

  // Get minimum date (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">New Booking</h1>
        <p className="text-gray-600">Book a service appointment</p>
      </div>

      {/* LOCATION PERMISSION BANNER - Show after shop selected with coordinates */}
      {selectedShop?.latitude && selectedShop?.longitude && !userLocation && !permissionDenied && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Navigation className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
            <div>
              <h4 className="font-semibold text-blue-900 mb-1">
                See Shop Location on Map
              </h4>
              <p className="text-blue-700 text-sm mb-3">
                Share your location to see the distance and route to the shop
              </p>
              <button
                onClick={requestLocation}
                disabled={locationLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {locationLoading ? 'Getting Location...' : 'Share My Location'}
              </button>
            </div>
          </div>
        </div>
      )}
 
      {/* LOCATION ERROR MESSAGE */}
      {locationError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{locationError}</p>
          {permissionDenied && (
            <p className="text-red-600 text-xs mt-2">
              To enable location access, please check your browser settings
            </p>
          )}
        </div>
      )}

      {/* Provider & Vehicle Info */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-gray-500">Service Provider</label>
            <p className="font-semibold text-gray-900">{provider?.name}</p>
            <p className="text-sm text-gray-600">{provider?.provider_type?.display_name}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Vehicle</label>
            <p className="font-semibold text-gray-900">{vehicle?.plate_number}</p>
            <p className="text-sm text-gray-600">{vehicle?.make} {vehicle?.model}</p>
          </div>
        </div>
      </div>

      {/* Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Shop Selection */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Select Shop Location *
          </label>
          {shops.length === 0 ? (
            <p className="text-gray-500">No shop locations available</p>
          ) : (
            <div className="space-y-3">
              {shops.map(shop => (
                <label
                  key={shop.id}
                  className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                    formData.shop_id === shop.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="shop"
                    value={shop.id}
                    checked={formData.shop_id === shop.id}
                    onChange={(e) => setFormData({ ...formData, shop_id: e.target.value })}
                    className="sr-only"
                  />
                  <div className="font-medium text-gray-900">{shop.name}</div>
                  <div className="text-sm text-gray-600">{shop.town}, {shop.county}</div>
                  {shop.opening_time && (
                    <div className="text-sm text-gray-500 mt-1">
                      {shop.opening_time} - {shop.closing_time}
                    </div>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* MAP SECTION - Show after shop is selected */}
        {selectedShop?.latitude && selectedShop?.longitude && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Shop Location
            </h2>
            <ShopLocationMap 
              shop={selectedShop}
              userLocation={userLocation}
            />
          </div>
        )}

        {/* Date & Time */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Date & Time</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline mr-2" size={16} />
                Booking Date *
              </label>
              <input
                type="date"
                min={getMinDate()}
                value={formData.booking_date}
                onChange={(e) => setFormData({ ...formData, booking_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="inline mr-2" size={16} />
                Preferred Time *
              </label>
              <select
                value={formData.booking_time}
                onChange={(e) => setFormData({ ...formData, booking_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                {Array.from({ length: 9 }, (_, i) => i + 8).map(hour => (
                  <option key={hour} value={`${hour.toString().padStart(2, '0')}:00`}>
                    {hour}:00 - {hour + 2}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Select Services *</h3>
          <div className="grid grid-cols-2 gap-3">
            {services.map(service => (
              <label
                key={service.id}
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition ${
                  formData.requested_services.includes(service.id)
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={formData.requested_services.includes(service.id)}
                  onChange={() => handleServiceToggle(service.id)}
                  className="mr-3"
                />
                <div className="text-sm font-medium text-gray-900">{service.name}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Problem Description */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <FileText className="inline mr-2" size={16} />
            Problem Description *
          </label>
          <textarea
            value={formData.problem_description}
            onChange={(e) => setFormData({ ...formData, problem_description: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            rows="4"
            placeholder="Describe the issue with your vehicle..."
            required
          />
        </div>

        {/* Special Instructions */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Special Instructions (Optional)
          </label>
          <textarea
            value={formData.special_instructions}
            onChange={(e) => setFormData({ ...formData, special_instructions: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            rows="3"
            placeholder="Any special requests or instructions..."
          />
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
              <input
                type="tel"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
              <input
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Important Notes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Booking requests are subject to provider confirmation</li>
                <li>You will receive a notification once confirmed</li>
                <li>Please arrive 10 minutes before your scheduled time</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {submitting ? 'Creating Booking...' : 'Confirm Booking'}
          </button>
        </div>
      </form>
    </div>
  )
}
