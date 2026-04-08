// src/app/company/fleet/add/page.js
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react'

// ✅ Client outside component — preserves session across renders
const supabase = createClient()

export default function AddFleetVehiclePage() {
  const router = useRouter()

  const [user, setUser]           = useState(null)
  const [profileId, setProfileId] = useState(null)
  const [companyId, setCompanyId] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [checking, setChecking]   = useState(true)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  const [formData, setFormData] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    vin: '',
    mileage: '',
    fuelType: 'petrol',
    notes: '',
  })

  // ── Auth + permission check on mount ─────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)

      const { data: profile, error: pErr } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (pErr || !profile) {
        setError('Could not load your profile.')
        setChecking(false)
        return
      }
      setProfileId(profile.id)

      // Company owner?
      const { data: owned } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('owner_user_id', profile.id)
        .maybeSingle()

      if (owned) {
        setCompanyId(owned.id)
        setChecking(false)
        return
      }

      // Active admin member?
      const { data: membership } = await supabase
        .from('company_users')
        .select('company_id, is_admin')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (membership?.is_admin) {
        setCompanyId(membership.company_id)
      } else {
        setError('Only company owners or admins can add fleet vehicles.')
      }
      setChecking(false)
    }

    init()
  }, [router])

  const field = (key, value) => setFormData(prev => ({ ...prev, [key]: value }))

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const kenyaPlate = /^[A-Z]{3}\s?\d{3}[A-Z]?$/i
    if (!kenyaPlate.test(formData.plateNumber.trim())) {
      setError('Invalid plate number format. Expected e.g. KAA 123A')
      setLoading(false)
      return
    }

    try {
      const plate = formData.plateNumber.trim().toUpperCase()

      // Duplicate plate check
      const { data: existing } = await supabase
        .from('vehicles')
        .select('id')
        .eq('plate_number', plate)
        .maybeSingle()

      if (existing) {
        setError('A vehicle with this plate number already exists.')
        setLoading(false)
        return
      }

      // Single atomic RPC — inserts vehicle + ownership (+ optional mileage history)
      // SECURITY DEFINER function sidesteps the RLS chicken-and-egg
      const { error: rpcError } = await supabase.rpc('add_fleet_vehicle_with_ownership', {
        p_plate_number:        plate,
        p_make:                formData.make,
        p_model:               formData.model,
        p_year_of_manufacture: formData.year ? parseInt(formData.year) : null,
        p_color:               formData.color || null,
        p_vin:                 formData.vin.trim() || null,
        p_mileage:             formData.mileage ? parseInt(formData.mileage) : null,
        p_owner_user_id:       profileId,
        p_owner_company_id:    companyId,
      })

      if (rpcError) throw rpcError

      setSuccess('Vehicle added to fleet successfully!')
      setTimeout(() => router.push('/company/dashboard?tab=fleet'), 1800)

    } catch (err) {
      console.error('Add fleet vehicle error:', err)
      setError(err?.message || 'Failed to add vehicle. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Loading / access denied states ───────────────────────────────────────
  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!companyId) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-lg mx-auto bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800">Access Denied</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button onClick={() => router.back()} className="mt-3 text-sm text-red-700 underline">
              Go back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            <ArrowLeft size={18} />
            Back to Fleet
          </button>
          <h1 className="text-3xl font-bold mb-1">Add Vehicle to Fleet</h1>
          <p className="text-gray-500">Register a new company vehicle</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {error && (
            <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mx-6 mt-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{success} Redirecting…</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <div>
                <label className="block text-sm font-medium mb-2">
                  Plate Number * <span className="text-gray-400 font-normal">(e.g. KAA 123A)</span>
                </label>
                <input
                  type="text"
                  value={formData.plateNumber}
                  onChange={(e) => field('plateNumber', e.target.value.toUpperCase())}
                  className="w-full p-3 border border-gray-300 rounded-lg uppercase tracking-widest font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="KAA 123A"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Make *</label>
                <input
                  type="text"
                  value={formData.make}
                  onChange={(e) => field('make', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Toyota"
                  required
                  list="make-suggestions"
                />
                <datalist id="make-suggestions">
                  {['Toyota','Nissan','Mazda','Mitsubishi','Subaru','Isuzu','Mercedes-Benz','BMW','Volkswagen','Ford'].map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Model *</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => field('model', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Hilux"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Year *</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => field('year', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Color</label>
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => field('color', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="White"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  VIN <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.vin}
                  onChange={(e) => field('vin', e.target.value.toUpperCase())}
                  className="w-full p-3 border border-gray-300 rounded-lg uppercase font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="17-character VIN"
                  maxLength={17}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Current Mileage (km) <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  value={formData.mileage}
                  onChange={(e) => field('mileage', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="50000"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Fuel Type</label>
                <select
                  value={formData.fuelType}
                  onChange={(e) => field('fuelType', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="electric">Electric</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Notes <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => field('notes', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Additional information about this vehicle..."
              />
            </div>

            <div className="border-t pt-6 flex gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !!success}
                className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Adding Vehicle…
                  </>
                ) : 'Add to Fleet'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}