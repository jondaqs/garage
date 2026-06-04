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

  // Plate validation is now intentionally permissive — non-empty and at
  // least one alphanumeric character. The DB enforces UNIQUE; format is
  // the caller's responsibility (we may register vehicles from various
  // jurisdictions, not just Kenya).
  const validatePlateNumber = (plate) => {
    const trimmed = plate.trim()
    return trimmed.length > 0 && /[A-Za-z0-9]/.test(trimmed)
  }

  // VIN is mandatory at creation. Minimum sanity check: non-empty after
  // trimming. The server-side RPC enforces the same rule.
  const validateVin = (vin) => vin.trim().length > 0

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
      setError('Plate number is required.')
      setLoading(false)
      return
    }

    if (!validateVin(vehicleForm.vin)) {
      setError('VIN is required.')
      setLoading(false)
      return
    }

    try {
      const plate = vehicleForm.plateNumber.trim().toUpperCase()

      // Duplicate detection is now handled inside add_vehicle_with_ownership:
      //   * Active collision → RPC raises a clear error.
      //   * Inactive collision → RPC reactivates the existing row under
      //     the new owner, preserving service history.
      // We deliberately don't pre-check here — a naive SELECT can't tell
      // active from inactive and would block legitimate re-registrations
      // of soft-deleted vehicles.

      // Get user profile id first
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles_secure')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (profileError || !profile) {
        throw new Error('Could not find your user profile. Please contact support.')
      }

      // Insert vehicle AND ownership in one atomic RPC call.
      // SECURITY DEFINER bypasses RLS for the duplicate check + the
      // inserts, so duplicates against vehicles the caller can't read
      // (e.g. owned by a different user) are still detected.
      //
      // The RPC returns JSONB: { success, vehicle_id, reactivated,
      // immutable_overrides }. reactivated=true means we matched an
      // existing (soft-deleted) row by VIN and brought it back under
      // this user; in that case make/model/year_of_manufacture are
      // *not* overwritten because they're physical-vehicle attributes
      // tied to the VIN. immutable_overrides lists fields the user
      // tried to change but which we kept from the existing record —
      // we surface that so they know.
      const { data: result, error: rpcError } = await supabase.rpc('add_vehicle_with_ownership', {
        p_plate_number:        plate,
        p_make:                vehicleForm.make,
        p_model:               vehicleForm.model,
        p_year_of_manufacture: vehicleForm.year ? parseInt(vehicleForm.year) : null,
        p_color:               vehicleForm.color || null,
        p_vin:                 vehicleForm.vin.trim().toUpperCase(),
        p_owner_user_id:       profile.id,
      })

      if (rpcError) throw rpcError
      if (result?.success === false) throw new Error(result.error || 'Failed to add vehicle')

      // Compose the success message. Reactivation gets a longer,
      // explanatory message so the user understands why their fields
      // may differ from what they entered, and a delayed redirect so
      // they can actually read it.
      const overrides = Array.isArray(result?.immutable_overrides)
        ? result.immutable_overrides
        : []
      let message = 'Vehicle added successfully!'
      let redirectDelay = 1800
      if (result?.reactivated) {
        message =
          'This vehicle has been re-registered under your account. ' +
          'Its full service history from previous ownership has been preserved.'
        if (overrides.length > 0) {
          message +=
            ' Note: ' + overrides.join(', ').replace('year_of_manufacture', 'year') +
            ' could not be changed — these are tied to the VIN and were kept from the existing record.'
        }
        redirectDelay = 5000
      }
      setSuccess(message)
      setVehicleForm({ plateNumber: '', make: '', model: '', year: '', color: '', vin: '' })

      setTimeout(() => router.push('/dashboard'), redirectDelay)

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
              <p className="text-green-600 text-sm">{success}</p>
              <p className="text-green-500 text-xs mt-1 italic">Redirecting…</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">VIN</label>
            <input
              type="text"
              value={vehicleForm.vin}
              onChange={(e) => setVehicleForm({ ...vehicleForm, vin: e.target.value.toUpperCase() })}
              required
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