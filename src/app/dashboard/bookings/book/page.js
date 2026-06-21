'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Clock, MapPin, Search, Star, X, CalendarDays } from 'lucide-react'
import VerificationScore from '@/components/VerificationScore'
import { useRouter, useSearchParams } from 'next/navigation'
import ProviderDetailModal from '@/components/ProviderDetailModal'

export default function BookServicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [providers, setProviders] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(searchParams.get('vehicle') || null)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [previewProvider,  setPreviewProvider]  = useState(null)
  const [selectedDate, setSelectedDate] = useState(null) // ← ADD THIS
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [providerTypes, setProviderTypes] = useState([])

  useEffect(() => {
    loadData()
    
    // Check for pre-selected date from calendar — consume and clear immediately
    // so stale values from previous sessions never show up on fresh visits
    const storedDate = sessionStorage.getItem('selectedBookingDate')
    if (storedDate) {
      sessionStorage.removeItem('selectedBookingDate')
      // Only use it if it's today or in the future
      const picked = new Date(storedDate)
      const today  = new Date(); today.setHours(0,0,0,0)
      if (!isNaN(picked) && picked >= today) {
        setSelectedDate(storedDate)
      }
    }
  }, [])

  const clearSelectedDate = () => {
    sessionStorage.removeItem('selectedBookingDate')
    setSelectedDate(null)
  }

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // Load user's vehicles — query from ownership table (reliable FK)
      const { data: ownershipData } = await supabase
        .from('vehicle_ownership')
        .select(`
          vehicle_id,
          vehicle:vehicles_secure(id, plate_number, make, model, year_of_manufacture, color, vin, is_active)
        `)
        .eq('owner_user_id', profile.id)

      setVehicles(
        (ownershipData || [])
          .filter(row => row.vehicle && row.vehicle.is_active !== false)
          .map(row => ({ ...row.vehicle }))
      )

      // Load active service providers with reviews
      const { data: providerData } = await supabase
        .from('service_providers_secure')
        .select(`
          *,
          provider_type:service_provider_types(display_name, code),
          shops_secure(id, name, town, county, latitude, longitude),
          provider_reviews(rating)
        `)
        .eq('status', 'active')
        .eq('is_active', true)
        .eq('is_searchable', true)

      // Calculate average ratings
      const providersWithRatings = providerData?.map(p => ({
        ...p,
        avgRating: p.provider_reviews?.length > 0
          ? p.provider_reviews.reduce((sum, r) => sum + r.rating, 0) / p.provider_reviews.length
          : 0,
        reviewCount: p.provider_reviews?.length || 0
      })) || []

      setProviders(providersWithRatings)

      // Load provider types for filter
      const { data: types } = await supabase
        .from('service_provider_types')
        .select('*')
        .eq('is_active', true)
        .order('display_name')

      setProviderTypes(types || [])

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredProviders = providers.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = selectedType === 'all' || p.provider_type?.code === selectedType
    return matchesSearch && matchesType
  })

  const handleBookProvider = (provider) => {
    if (!selectedVehicle) {
      alert('Please select a vehicle first')
      return
    }
    setSelectedProvider(provider)
    const params = new URLSearchParams({ provider: provider.id, vehicle: selectedVehicle })
    if (selectedDate) params.set('date', selectedDate)
    router.push(`/dashboard/bookings/new?${params.toString()}`)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Book a Service</h1>
        <p className="text-gray-600">Find and book trusted service providers</p>
      </div>

      {/* DATE SELECTION BANNER - ADD THIS */}
      {selectedDate && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <CalendarDays className="text-blue-600 mt-1 flex-shrink-0" size={32} />
              <div>
                <h3 className="font-semibold text-blue-900 text-lg mb-2">
                  📅 Booking Date Selected: {new Date(selectedDate).toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h3>
                <p className="text-blue-700">
                  Select your vehicle and service provider below. The date will be automatically filled in the booking form.
                </p>
              </div>
            </div>
            <button
              onClick={clearSelectedDate}
              className="text-blue-600 hover:text-blue-800 p-2"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Vehicle Selection */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Select Vehicle</h2>
        {vehicles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No vehicles added yet</p>
            <button
              onClick={() => {
                clearSelectedDate()
                router.push('/dashboard/vehicles/add')
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Vehicle
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => setSelectedVehicle(vehicle.id)}
                className={`p-4 border-2 rounded-lg text-left transition ${
                  selectedVehicle === vehicle.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="font-semibold text-gray-900">{vehicle.plate_number}</div>
                <div className="text-sm text-gray-600">
                  {vehicle.make} {vehicle.model} {vehicle.year_of_manufacture}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {providerTypes.map(type => (
                <option key={type.id} value={type.code}>{type.display_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Service Providers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProviders.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-500">No providers found</p>
          </div>
        ) : (
          filteredProviders.map((provider) => (
            <div key={provider.id}
              onClick={() => setPreviewProvider(provider)}
              className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition cursor-pointer group ring-0 hover:ring-2 hover:ring-blue-300"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{provider.name}</h3>
                    <p className="text-sm text-blue-600 mb-2">{provider.provider_type?.display_name}</p>
                  </div>
                  {provider.is_verified && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                      Verified
                    </span>
                  )}
                  <VerificationScore score={provider.verification_score} />
                </div>

                {/* Rating */}
                {provider.avgRating > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center">
                      <Star className="text-yellow-400 fill-yellow-400" size={16} />
                      <span className="ml-1 text-sm font-medium">{provider.avgRating.toFixed(1)}</span>
                    </div>
                    <span className="text-sm text-gray-500">({provider.reviewCount} reviews)</span>
                  </div>
                )}

                {/* Description */}
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {provider.description || 'Professional service provider'}
                </p>

                {/* Location */}
                {provider.shops?.[0] && (
                  <div className="flex items-center text-sm text-gray-500 mb-4">
                    <MapPin size={16} className="mr-1" />
                    <span>{provider.shops[0].town}, {provider.shops[0].county}</span>
                  </div>
                )}

                {/* Book Button */}
                <button
                  onClick={e => { e.stopPropagation(); handleBookProvider(provider) }}
                  disabled={!selectedVehicle}
                  className={`w-full py-2 rounded-lg font-medium transition ${
                    selectedVehicle
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {selectedVehicle ? 'Book Service' : 'Select Vehicle First'}
                </button>
                <p className="text-center text-xs text-gray-400 mt-2">Tap card for more details</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Provider detail modal */}
      {previewProvider && (
        <ProviderDetailModal
          provider={previewProvider}
          onClose={() => setPreviewProvider(null)}
          onBook={p => { setPreviewProvider(null); handleBookProvider(p) }}
          canBook={!!selectedVehicle}
        />
      )}
    </div>
  )
}