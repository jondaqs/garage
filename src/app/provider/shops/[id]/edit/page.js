'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertCircle, MapPin } from 'lucide-react'

const KENYA_COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi',
  'Kitale', 'Garissa', 'Kakamega', 'Machakos', 'Meru', 'Nyeri', 'Kiambu',
  'Kajiado', 'Kilifi', 'Kwale', 'Lamu', 'Taita Taveta', 'Tana River',
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo Marakwet', 'Embu',
  'Homa Bay', 'Isiolo', 'Kericho', 'Kirinyaga', 'Kisii', 'Laikipia',
  'Makueni', 'Mandera', 'Marsabit', 'Migori', 'Murang\'a', 'Nandi',
  'Narok', 'Nyandarua', 'Nyamira', 'Samburu', 'Siaya', 'Trans Nzoia',
  'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
]

export default function EditShopPage({ params }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    phone: '',
    email: '',
    county: '',
    town: '',
    street: '',
    latitude: '',
    longitude: '',
    opening_time: '',
    closing_time: ''
  })

  useEffect(() => {
    loadShop()
  }, [params.id])

  const loadShop = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('shops')
        .select('*')
        .eq('id', params.id)
        .single()

      if (fetchError) throw fetchError

      setFormData({
        name: data.name || '',
        description: data.description || '',
        phone: data.phone || '',
        email: data.email || '',
        county: data.county || '',
        town: data.town || '',
        street: data.street || '',
        latitude: data.latitude?.toString() || '',
        longitude: data.longitude?.toString() || '',
        opening_time: data.opening_time || '',
        closing_time: data.closing_time || ''
      })

    } catch (err) {
      console.error('Error loading shop:', err)
      setError('Failed to load shop details')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const shopData = {
        name: formData.name,
        description: formData.description || null,
        phone: formData.phone,
        email: formData.email || null,
        county: formData.county,
        town: formData.town,
        street: formData.street || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        opening_time: formData.opening_time,
        closing_time: formData.closing_time,
        updated_by: user.id
      }

      const { error: updateError } = await supabase
        .from('shops')
        .update(shopData)
        .eq('id', params.id)

      if (updateError) throw updateError

      setSuccess('Shop updated successfully!')
      
      setTimeout(() => {
        router.push('/provider/shops')
      }, 2000)

    } catch (err) {
      console.error('Error updating shop:', err)
      setError(err.message || 'Failed to update shop')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-6 text-blue-600 hover:text-blue-700 font-medium flex items-center"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Shops
      </button>

      <h1 className="text-3xl font-bold text-gray-900 mb-8">Edit Shop</h1>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="text-red-600 mr-3 mt-0.5" size={20} />
            <div>
              <h4 className="font-semibold text-red-800">Error</h4>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
            <AlertCircle className="text-green-600 mr-3 mt-0.5" size={20} />
            <div>
              <h4 className="font-semibold text-green-800">Success!</h4>
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Basic Information */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shop Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Main Branch"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of this shop location..."
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0712345678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="shop@example.com"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin size={20} />
              Location
            </h2>
            
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    County *
                  </label>
                  <select
                    name="county"
                    value={formData.county}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select County</option>
                    {KENYA_COUNTIES.map(county => (
                      <option key={county} value={county}>{county}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Town/City *
                  </label>
                  <input
                    type="text"
                    name="town"
                    value={formData.town}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Nairobi"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Street Address (Optional)
                </label>
                <input
                  type="text"
                  name="street"
                  value={formData.street}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="123 Main Street, CBD"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Latitude (Optional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="-1.2921"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Longitude (Optional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="36.8219"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Operating Hours</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Opening Time *
                </label>
                <input
                  type="time"
                  name="opening_time"
                  value={formData.opening_time}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Closing Time *
                </label>
                <input
                  type="time"
                  name="closing_time"
                  value={formData.closing_time}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
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
              disabled={saving}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {saving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}