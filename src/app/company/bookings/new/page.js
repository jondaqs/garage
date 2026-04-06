'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, Clock, FileText, AlertCircle, Truck, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const ShopLocationMap = dynamic(
  () => import('@/components/maps/ShopLocationMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading map...</p>
      </div>
    )
  }
)

export default function CompanyNewBookingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const providerId = searchParams.get('provider')
  const vehicleId  = searchParams.get('vehicle')

  const [provider, setProvider] = useState(null)
  const [vehicle, setVehicle]   = useState(null)
  const [shops, setShops]       = useState([])
  const [services, setServices] = useState([])
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState(null)

  const [formData, setFormData] = useState({
    shop_id:              '',
    booking_date:         '',
    booking_time:         '09:00',
    requested_services:   [],
    problem_description:  '',
    special_instructions: '',
    customer_phone:       '',
    customer_email:       '',
  })

  useEffect(() => {
    if (!providerId || !vehicleId) {
      router.push('/company/bookings')
      return
    }
    loadData()

    // Restore pre-selected date from calendar
    const stored = sessionStorage.getItem('selectedBookingDate')
    if (stored) {
      setFormData(prev => ({ ...prev, booking_date: stored }))
      sessionStorage.removeItem('selectedBookingDate')
    }
  }, [providerId, vehicleId])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profileData } = await supabase
        .from('user_profiles').select('id, first_name, last_name, email, phone')
        .eq('auth_user_id', user.id).single()

      setProfile(profileData)
      setFormData(prev => ({
        ...prev,
        customer_email: profileData?.email || '',
        customer_phone: profileData?.phone || '',
      }))

      // Load provider
      const { data: providerData } = await supabase
        .from('service_providers')
        .select('id, name, owner_user_id, provider_type:service_provider_types(display_name)')
        .eq('id', providerId).single()
      setProvider(providerData)

      // Load provider shops
      const { data: shopsData } = await supabase
        .from('shops').select('*')
        .eq('service_provider_id', providerId).eq('is_active', true)
      setShops(shopsData || [])

      // Auto-select shop if only one
      if (shopsData?.length === 1) {
        setFormData(prev => ({ ...prev, shop_id: shopsData[0].id }))
      }

      // Load services
      const { data: servicesData } = await supabase
        .from('services').select('id, name, description, category, display_name')
        .eq('is_active', true).order('name')
      setServices(servicesData || [])

      // Load vehicle
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id, plate_number, make, model, year_of_manufacture, color')
        .eq('id', vehicleId).single()
      setVehicle(vehicleData)

    } catch (err) {
      console.error('Load error:', err)
      setError('Failed to load booking data')
    } finally {
      setLoading(false)
    }
  }

  const toggleService = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      requested_services: prev.requested_services.includes(serviceId)
        ? prev.requested_services.filter(id => id !== serviceId)
        : [...prev.requested_services, serviceId],
    }))
  }

  const calculateEndTime = (startTime) => {
    const [h, m] = startTime.split(':').map(Number)
    const end = new Date(0, 0, 0, h + 2, m)
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.shop_id) { setError('Please select a shop'); return }
    if (formData.requested_services.length === 0) { setError('Please select at least one service'); return }
    if (!formData.booking_date) { setError('Please select a booking date'); return }

    setSubmitting(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: pendingStatus } = await supabase
        .from('booking_statuses').select('id').eq('code', 'pending').single()

      const bookingNumber = `BKCO${Date.now()}`

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          booking_number:        bookingNumber,
          service_provider_id:   providerId,
          shop_id:               formData.shop_id,
          vehicle_id:            vehicleId,
          customer_user_id:      profile.id,
          status_id:             pendingStatus.id,
          booking_date:          formData.booking_date,
          booking_time_start:    formData.booking_time,
          booking_time_end:      calculateEndTime(formData.booking_time),
          requested_services:    formData.requested_services,
          problem_description:   formData.problem_description || null,
          special_instructions:  formData.special_instructions || null,
          customer_phone:        formData.customer_phone || null,
          customer_email:        formData.customer_email || null,
          priority:              'normal',
          created_by:            user.id,
        })
        .select().single()

      if (bookingError) throw bookingError

      // Create booking_services records
      await Promise.all(
        formData.requested_services.map(serviceId =>
          supabase.from('booking_services').insert({ booking_id: booking.id, service_id: serviceId })
        )
      )

      // Notify provider
      if (provider?.owner_user_id) {
        await supabase.from('notifications').insert({
          recipient_user_id: provider.owner_user_id,
          notification_type: 'new_booking',
          type:              'new_booking',
          title:             'New Booking Request',
          message:           `New booking from ${vehicle?.plate_number} for ${formData.booking_date}`,
          reference_id:      booking.id,
          reference_type:    'booking',
          is_read:           false,
        })
      }

      router.push(`/company/bookings/${booking.id}`)

    } catch (err) {
      console.error('Booking error:', err)
      setError('Failed to create booking: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  const selectedShop = shops.find(s => s.id === formData.shop_id)

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      <div className="flex items-center gap-3">
        <Link href="/company/bookings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Book a Service</h1>
          {provider && <p className="text-sm text-gray-500 mt-0.5">{provider.name}</p>}
        </div>
      </div>

      {/* Vehicle + Provider summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-blue-500 font-medium mb-0.5">Fleet Vehicle</p>
          {vehicle ? (
            <>
              <p className="font-semibold text-blue-900">{vehicle.plate_number}</p>
              <p className="text-blue-700 text-xs">
                {[vehicle.year_of_manufacture, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
              </p>
            </>
          ) : <p className="text-blue-700">—</p>}
        </div>
        <div>
          <p className="text-xs text-blue-500 font-medium mb-0.5">Service Provider</p>
          <p className="font-semibold text-blue-900">{provider?.name}</p>
          <p className="text-blue-700 text-xs">{provider?.provider_type?.display_name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Shop selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Select Shop <span className="text-red-500">*</span>
          </h2>
          {shops.length === 0 ? (
            <p className="text-sm text-gray-400">No active shops for this provider</p>
          ) : (
            <div className="space-y-2">
              {shops.map(shop => (
                <label key={shop.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    formData.shop_id === shop.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  }`}>
                  <input type="radio" name="shop" value={shop.id} checked={formData.shop_id === shop.id}
                    onChange={() => setFormData(prev => ({ ...prev, shop_id: shop.id }))}
                    className="mt-0.5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{shop.name}</p>
                    <p className="text-xs text-gray-500">{shop.town}, {shop.county}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Map */}
          {selectedShop?.latitude && selectedShop?.longitude && (
            <div className="mt-4">
              <ShopLocationMap
                shops={[selectedShop]}
                selectedShop={selectedShop}
                height="200px"
              />
            </div>
          )}
        </div>

        {/* Date & Time */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Date & Time</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Booking Date <span className="text-red-500">*</span>
              </label>
              <input type="date" value={formData.booking_date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setFormData(prev => ({ ...prev, booking_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preferred Time</label>
              <input type="time" value={formData.booking_time}
                onChange={e => setFormData(prev => ({ ...prev, booking_time: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Services Needed <span className="text-red-500">*</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {services.map(service => (
              <label key={service.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  formData.requested_services.includes(service.id)
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}>
                <input type="checkbox" checked={formData.requested_services.includes(service.id)}
                  onChange={() => toggleService(service.id)}
                  className="mt-0.5 text-blue-600 rounded" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{service.name}</p>
                  {service.category && (
                    <p className="text-xs text-gray-400 capitalize">{service.category}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Problem description */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Problem Description</label>
              <textarea rows={3} value={formData.problem_description}
                onChange={e => setFormData(prev => ({ ...prev, problem_description: e.target.value }))}
                placeholder="Describe the issue or service needed..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Special Instructions</label>
              <textarea rows={2} value={formData.special_instructions}
                onChange={e => setFormData(prev => ({ ...prev, special_instructions: e.target.value }))}
                placeholder="Any special instructions for the provider..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
                <input type="tel" value={formData.customer_phone}
                  onChange={e => setFormData(prev => ({ ...prev, customer_phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Email</label>
                <input type="email" value={formData.customer_email}
                  onChange={e => setFormData(prev => ({ ...prev, customer_email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={submitting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creating Booking…' : 'Confirm Booking'}
          </button>
          <Link href="/company/bookings"
            className="px-5 py-3 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 text-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}