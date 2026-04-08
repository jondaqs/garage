// src/app/dashboard/vehicles/add/page.js
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ✅ CRITICAL: supabase client must be created OUTSIDE the component.
// Creating it inside causes a new unauthenticated instance on every render.
const supabase = createClient()

export default function AddVehiclePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [vehicleForm, setVehicleForm] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    color: '',
    vin: ''
  })

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }
      setUser(user)
    }
    getUser()
  }, [router])

  const validatePlateNumber = (plate) => {
    const kenyaFormat = /^[A-Z]{3}\s?\d{3}[A-Z]?$/i
    return kenyaFormat.test(plate.trim())
  }

  const handleAddVehicle = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (!user) {
      setError('You must be logged in to add a vehicle.')
      setLoading(false)
      return
    }

    if (!validatePlateNumber(vehicleForm.plateNumber)) {
      setError('Invalid plate number format. Use format: KAA 123A')
      setLoading(false)
      return
    }

    try {
      const plate = vehicleForm.plateNumber.trim().toUpperCase()

      // Step 1: Check for duplicate plate
      const { data: existing, error: checkError } = await supabase
        .from('vehicles')
        .select('id')
        .eq('plate_number', plate)
        .maybeSingle()

      if (checkError) throw checkError

      if (existing) {
        setError('A vehicle with this plate number already exists.')
        setLoading(false)
        return
      }

      // Step 2: Get user profile id first
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (profileError || !profile) {
        throw new Error('Could not find your user profile. Please contact support.')
      }

      // Step 3: Insert vehicle AND ownership in one atomic RPC call.
      // This avoids the RLS chicken-and-egg problem where:
      //   - INSERT vehicles needs no .select() (would fail: ownership not yet created)
      //   - ownership INSERT needs the vehicle id
      // The function runs as SECURITY DEFINER so it can read the inserted id
      // before ownership exists, then creates both rows atomically.
      const { error: rpcError } = await supabase.rpc('add_vehicle_with_ownership', {
        p_plate_number:        plate,
        p_make:                vehicleForm.make,
        p_model:               vehicleForm.model,
        p_year_of_manufacture: vehicleForm.year ? parseInt(vehicleForm.year) : null,
        p_color:               vehicleForm.color || null,
        p_vin:                 vehicleForm.vin.trim() || null,
        p_owner_user_id:       profile.id,
      })

      if (rpcError) throw rpcError

      setSuccess('Vehicle added successfully!')
      setVehicleForm({ plateNumber: '', make: '', model: '', year: '', color: '', vin: '' })

      setTimeout(() => router.push('/dashboard'), 1800)

    } catch (err) {
      console.error('Add vehicle error:', err)
      setError(err?.message || 'Failed to add vehicle. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => router.back()}
        className="mb-6 text-blue-600 hover:text-blue-700 font-medium flex items-center"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back
      </button>

      <h2 className="text-3xl font-bold text-gray-800 mb-8">Add New Vehicle</h2>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="text-red-600 mr-3 mt-0.5 flex-shrink-0" size={20} />
            <div>
              <h4 className="font-semibold text-red-800">Error</h4>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
            <CheckCircle className="text-green-600 mr-3 mt-0.5 flex-shrink-0" size={20} />
            <div>
              <h4 className="font-semibold text-green-800">Success!</h4>
              <p className="text-green-600 text-sm">{success} Redirecting…</p>
            </div>
          </div>
        )}

        <form onSubmit={handleAddVehicle}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Plate Number *</label>
            <input
              type="text"
              value={vehicleForm.plateNumber}
              onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value.toUpperCase() })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase tracking-widest font-mono"
              placeholder="KAA 123A"
              maxLength={8}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Make *</label>
              <input
                type="text"
                value={vehicleForm.make}
                onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Toyota"
                list="makes-list"
              />
              <datalist id="makes-list">
                {['Toyota','Nissan','Mazda','Isuzu','Subaru','Mitsubishi','Ford','Mercedes-Benz','BMW','Volkswagen'].map(m => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Model *</label>
              <input
                type="text"
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Corolla"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year *</label>
              <input
                type="number"
                value={vehicleForm.year}
                onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })}
                required
                min="1900"
                max={new Date().getFullYear() + 1}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="2020"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color *</label>
              <input
                type="text"
                value={vehicleForm.color}
                onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="White"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">VIN <span className="text-gray-400 font-normal">(Optional)</span></label>
            <input
              type="text"
              value={vehicleForm.vin}
              onChange={(e) => setVehicleForm({ ...vehicleForm, vin: e.target.value.toUpperCase() })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase font-mono"
              placeholder="1HGBH41JXMN109186"
              maxLength={17}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !!success}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
            >
              {loading ? 'Adding Vehicle…' : 'Add Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}