// src/app/dashboard/vehicles/add/page.js
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, AlertCircle, CheckCircle, Car, Lock, Sparkles, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient()

export default function AddVehiclePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profileId, setProfileId] = useState(null)
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

  // ── Vehicle limit state ────────────────────────────────────────────────
  const [limitLoading, setLimitLoading] = useState(true)
  const [limitInfo, setLimitInfo] = useState(null) // { can_add, current_count, max_allowed, remaining, source, plan_name, reason }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)

      // Get profile id
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) { setLimitLoading(false); return }
      setProfileId(profile.id)

      // Check vehicle limit
      try {
        const { data, error: rpcErr } = await supabase.rpc('check_vehicle_limit', {
          p_user_id: profile.id
        })
        if (!rpcErr && data) {
          setLimitInfo(data)
        }
      } catch (err) {
        console.error('Limit check error:')
      } finally {
        setLimitLoading(false)
      }
    }
    init()
  }, [router])

  const validatePlateNumber = (plate) => {
    const trimmed = plate.trim()
    return trimmed.length > 0 && /[A-Za-z0-9]/.test(trimmed)
  }

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

      const { data: result, error: rpcError } = await supabase.rpc('add_vehicle_with_ownership', {
        p_plate_number:        plate,
        p_make:                vehicleForm.make,
        p_model:               vehicleForm.model,
        p_year_of_manufacture: vehicleForm.year ? parseInt(vehicleForm.year) : null,
        p_color:               vehicleForm.color || null,
        p_vin:                 vehicleForm.vin.trim().toUpperCase(),
        p_owner_user_id:       profileId,
      })

      if (rpcError) throw rpcError
      if (result?.success === false) {
        // If the server returned limit_info, update our local state
        if (result?.limit_info) setLimitInfo(result.limit_info)
        throw new Error(result.error || 'Failed to add vehicle')
      }

      // Update limit info from the response
      if (result?.limit_info) setLimitInfo(result.limit_info)

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
      console.error('Add vehicle error:')
      setError(err?.message || 'Failed to add vehicle. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Limit reached → block UI ──────────────────────────────────────────
  const atLimit = limitInfo && !limitInfo.can_add

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

      {/* Vehicle limit info banner */}
      {!limitLoading && limitInfo && (
        <div className={`mb-6 flex items-start gap-3 p-4 rounded-xl border ${
          atLimit
            ? 'border-amber-300 bg-amber-50'
            : 'border-gray-200 bg-gray-50'
        }`}>
          <Car size={20} className={atLimit ? 'text-amber-600 mt-0.5' : 'text-gray-500 mt-0.5'} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${atLimit ? 'text-amber-800' : 'text-gray-700'}`}>
              {limitInfo.current_count} of {limitInfo.max_allowed ?? '∞'} vehicle{limitInfo.max_allowed !== 1 ? 's' : ''} used
              <span className="font-normal text-xs ml-2 opacity-70">({limitInfo.plan_name})</span>
            </p>
            <p className={`text-xs mt-0.5 ${atLimit ? 'text-amber-600' : 'text-gray-500'}`}>
              {limitInfo.reason}
            </p>
          </div>
          {atLimit && limitInfo.source !== 'subscription' && (
            <Link href="/dashboard/subscription"
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              <Sparkles size={12} /> Upgrade
            </Link>
          )}
          {atLimit && limitInfo.source === 'subscription' && (
            <Link href="/dashboard/subscription"
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors">
              Upgrade Plan <ArrowRight size={12} />
            </Link>
          )}
        </div>
      )}

      {/* Limit reached — full block */}
      {atLimit ? (
        <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Lock className="text-amber-400" size={28} />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Vehicle limit reached</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Your {limitInfo.plan_name} allows up to {limitInfo.max_allowed} vehicle{limitInfo.max_allowed !== 1 ? 's' : ''} and
            you currently have {limitInfo.current_count}. Upgrade your plan to register more vehicles.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/dashboard/subscription"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors">
              <Sparkles size={14} /> View Plans
            </Link>
            <button onClick={() => router.push('/dashboard')}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
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
              <label className="block text-sm font-medium text-gray-700 mb-2">VIN *</label>
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
                disabled={loading || !!success || limitLoading}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                {loading ? 'Adding Vehicle…' : 'Add Vehicle'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}