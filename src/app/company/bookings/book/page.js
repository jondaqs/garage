// src/app/company/bookings/book/page.js
// Provider browser for company owners/admins.
// Mirrors /dashboard/bookings/book but loads fleet vehicles
// and routes to /company/bookings/new after selection.
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Star, MapPin, Truck, ArrowLeft, Calendar } from 'lucide-react'
import Link from 'next/link'

const supabase = createClient()

export default function CompanyBookServicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [providers, setProviders]           = useState([])
  const [fleetVehicles, setFleetVehicles]   = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(searchParams.get('vehicle') || null)
  const [providerTypes, setProviderTypes]   = useState([])
  const [loading, setLoading]               = useState(true)
  const [searchQuery, setSearchQuery]       = useState('')
  const [selectedType, setSelectedType]     = useState('all')
  const [error, setError]                   = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) throw new Error('Profile not found')

      // Resolve company id (owner or active member)
      let companyId = null

      const { data: owned } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('owner_user_id', profile.id)
        .maybeSingle()

      if (owned) {
        companyId = owned.id
      } else {
        const { data: mem } = await supabase
          .from('company_users')
          .select('company_id')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle()
        if (mem) companyId = mem.company_id
      }

      if (!companyId) throw new Error('No company found')

      // Load fleet vehicles
      const { data: ownership } = await supabase
        .from('vehicle_ownership')
        .select(`
          vehicle_id,
          vehicle:vehicles(id, plate_number, make, model, year_of_manufacture, color)
        `)
        .eq('owner_company_id', companyId)

      setFleetVehicles(ownership?.map(o => o.vehicle).filter(Boolean) ?? [])

      // Load active service providers
      const { data: providerData } = await supabase
        .from('service_providers')
        .select(`
          id, name, description, status,
          provider_type:service_provider_types(display_name, code),
          shops(id, name, town, county),
          provider_reviews(rating)
        `)
        .eq('status', 'active')
        .eq('is_active', true)

      const withRatings = (providerData ?? []).map(p => ({
        ...p,
        avgRating: p.provider_reviews?.length
          ? p.provider_reviews.reduce((s, r) => s + r.rating, 0) / p.provider_reviews.length
          : 0,
        reviewCount: p.provider_reviews?.length ?? 0,
      }))
      setProviders(withRatings)

      // Load provider types for filter
      const { data: types } = await supabase
        .from('service_provider_types')
        .select('id, code, display_name')
        .order('display_name')
      setProviderTypes(types ?? [])

    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBook = (provider) => {
    if (!selectedVehicle) {
      alert('Please select a fleet vehicle first')
      return
    }
    router.push(`/company/bookings/new?provider=${provider.id}&vehicle=${selectedVehicle}`)
  }

  const filtered = providers.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchType   = selectedType === 'all' || p.provider_type?.code === selectedType
    return matchSearch && matchType
  })

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error}</div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/company/bookings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Book a Service</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select a fleet vehicle and service provider</p>
        </div>
      </div>

      {/* Step 1: Select vehicle */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
          Select Fleet Vehicle
        </h2>

        {fleetVehicles.length === 0 ? (
          <div className="text-center py-6">
            <Truck className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400 mb-3">No fleet vehicles registered yet</p>
            <Link
              href="/company/fleet/add"
              className="text-sm text-blue-600 font-medium hover:underline"
            >
              Add a vehicle →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fleetVehicles.map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedVehicle(v.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                  selectedVehicle === v.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                  <Truck className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 font-mono">{v.plate_number}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {[v.year_of_manufacture, v.make, v.model].filter(Boolean).join(' ')}
                  </p>
                </div>
                {selectedVehicle === v.id && (
                  <span className="ml-auto text-blue-600 text-xs font-medium shrink-0">Selected ✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: Select provider */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
          Select Service Provider
        </h2>

        {/* Search + filter */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search providers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            {providerTypes.map(t => (
              <option key={t.id} value={t.code}>{t.display_name}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-gray-400">No providers found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(provider => (
              <div
                key={provider.id}
                className="flex items-start gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="p-2.5 bg-blue-50 rounded-lg shrink-0">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{provider.name}</p>
                      <p className="text-xs text-gray-400">{provider.provider_type?.display_name}</p>
                    </div>
                    {provider.avgRating > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                        <span className="text-xs font-medium text-gray-700">
                          {provider.avgRating.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-400">({provider.reviewCount})</span>
                      </div>
                    )}
                  </div>

                  {provider.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{provider.description}</p>
                  )}

                  {provider.shops?.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>
                        {provider.shops.map(s => s.town).filter(Boolean).join(', ') || 'Multiple locations'}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleBook(provider)}
                  disabled={!selectedVehicle}
                  className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Book
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!selectedVehicle && fleetVehicles.length > 0 && (
        <p className="text-center text-sm text-gray-400">
          Select a vehicle above to enable booking
        </p>
      )}
    </div>
  )
}