'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { MapPin, Phone, Mail, Clock, Plus, Edit, Trash2, AlertCircle, DollarSign } from 'lucide-react'
import useProviderAccess from '@/hooks/useProviderAccess'
import CompanyWriteGate from '@/components/CompanyWriteGate'
import ProviderAccessBanner from '@/components/ProviderAccessBanner'

export default function ProviderShopsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [shops, setShops] = useState([])
  const providerAccess = useProviderAccess()
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadShops()
  }, [])

  const loadShops = async () => {
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

      // Get provider
      const { data: providerData, error: providerError } = await supabase
        .from('service_providers_secure')
        .select('*')
        .eq('owner_user_id', profile.id)
        .single()

      if (providerError) throw providerError
      setProvider(providerData)

      // Load shops
      const { data: shopsData, error: shopsError } = await supabase
        .from('shops_secure')
        .select(`
          *,
          currency:currencies(code, symbol, display_name)
        `)
        .eq('service_provider_id', providerData.id)
        .order('created_at', { ascending: false })

      if (shopsError) throw shopsError
      setShops(shopsData || [])

    } catch (err) {
      console.error('Error loading shops:', err)
      setError('Failed to load shops')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (shopId) => {
    if (!confirm('Are you sure you want to delete this shop? This action cannot be undone.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('shops')
        .delete()
        .eq('id', shopId)

      if (error) throw error

      alert('Shop deleted successfully')
      loadShops()
    } catch (err) {
      console.error('Error deleting shop:', err)
      alert('Failed to delete shop: ' + err.message)
    }
  }

  const toggleActive = async (shop) => {
    try {
      const { error } = await supabase
        .from('shops')
        .update({ is_active: !shop.is_active })
        .eq('id', shop.id)

      if (error) throw error

      loadShops()
    } catch (err) {
      console.error('Error updating shop:', err)
      alert('Failed to update shop status')
    }
  }

  const handleEdit = (shopId) => {
    console.log('Editing shop ID:', shopId)
    // Navigate to edit page with shop ID in URL
    router.push(`/provider/shops/${shopId}/edit`)
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Shops</h1>
          <p className="text-gray-600">Manage your shop locations</p>
        </div>
        <CompanyWriteGate canWrite={providerAccess.canWrite} state={providerAccess.state}>
        <button
          onClick={() => router.push('/provider/shops/add')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Add Shop
        </button>
        </CompanyWriteGate>
      </div>

      {!providerAccess.loading && <ProviderAccessBanner {...providerAccess} />}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="text-red-600 mr-3 mt-0.5" size={20} />
          <div>
            <h4 className="font-semibold text-red-800">Error</h4>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      )}

      {shops.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <MapPin className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No shops yet</h3>
          <p className="text-gray-500 mb-4">Add your first shop location to start receiving bookings</p>
          <button
            onClick={() => router.push('/provider/shops/add')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Your First Shop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shops.map((shop) => (
            <div
              key={shop.id}
              className={`bg-white rounded-lg shadow-sm overflow-hidden border-2 ${
                shop.is_active ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{shop.name}</h3>
                  <div className="flex items-center gap-2">
                    {shop.is_active ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {shop.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{shop.description}</p>
                )}

                <div className="space-y-2 mb-4">
                  {/* Location */}
                  <div className="flex items-start text-sm text-gray-600">
                    <MapPin size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                    <div>
                      {shop.street && <div>{shop.street}</div>}
                      <div>{shop.town}, {shop.county}</div>
                    </div>
                  </div>

                  {/* Phone */}
                  {shop.phone && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Phone size={16} className="mr-2" />
                      <span>{shop.phone}</span>
                    </div>
                  )}

                  {/* Email */}
                  {shop.email && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Mail size={16} className="mr-2" />
                      <span className="truncate">{shop.email}</span>
                    </div>
                  )}

                  {/* Hours */}
                  {shop.opening_time && shop.closing_time && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock size={16} className="mr-2" />
                      <span>{shop.opening_time} - {shop.closing_time}</span>
                    </div>
                  )}

                  {/* Currency */}
                  {shop.currency && (
                    <div className="flex items-center text-sm text-gray-600">
                      <DollarSign size={16} className="mr-2" />
                      <span>
                        {shop.currency.code}
                        {shop.currency.symbol ? ` (${shop.currency.symbol})` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleEdit(shop.id)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2 text-sm"
                  >
                    <Edit size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(shop)}
                    className={`px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm ${
                      shop.is_active
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {shop.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>

                <button
                  onClick={() => handleDelete(shop.id)}
                  className="w-full mt-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 text-sm"
                >
                  <Trash2 size={16} />
                  Delete Shop
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}