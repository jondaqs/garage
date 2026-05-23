// src/app/dashboard/company/[companyId]/fleet/add/page.js
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, AlertCircle, CheckCircle, Truck } from 'lucide-react'

// ✅ Client outside component — preserves session across renders
const supabase = createClient()

export default function AddCompanyFleetVehiclePage() {
  const { companyId } = useParams()
  const router = useRouter()

  const [profileId, setProfileId] = useState(null)
  // canManage: caller can add a fleet vehicle. True for the company owner,
  // for any active company_user with is_admin OR can_manage_fleet. The
  // server-side gate on add_fleet_vehicle_with_ownership enforces the same
  // rule; this state just controls whether we render the form vs an
  // access-denied notice.
  const [canManage, setCanManage] = useState(false)
  const [checking, setChecking]   = useState(true)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  const [form, setForm] = useState({
    plateNumber: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    vin: '',
    mileage: '',
  })

  // ── Permission guard ──────────────────────────────────────────────────────
  useEffect(() => {
    const checkPermission = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile, error: pErr } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()

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
        .eq('id', companyId)
        .eq('owner_user_id', profile.id)
        .maybeSingle()

      if (owned) {
        setCanManage(true)
        setChecking(false)
        return
      }

      // Active member with admin OR fleet-management permission
      const { data: membership } = await supabase
        .from('company_users')
        .select('is_admin, can_manage_fleet')
        .eq('company_id', companyId)
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (membership?.is_admin || membership?.can_manage_fleet) {
        setCanManage(true)
      } else {
        setError('You do not have permission to add fleet vehicles. Ask a company admin for the Manage Fleet permission.')
      }
      setChecking(false)
    }

    checkPermission()
  }, [companyId, router])

  const field = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (!form.plateNumber.trim() || !/[A-Za-z0-9]/.test(form.plateNumber)) {
      setError('Plate number is required.')
      setLoading(false)
      return
    }

    if (!form.vin.trim()) {
      setError('VIN is required.')
      setLoading(false)
      return
    }

    try {
      const plate = form.plateNumber.trim().toUpperCase()

      // Duplicate detection is owned by add_fleet_vehicle_with_ownership:
      //   * Active collision → RPC raises a clear error.
      //   * Inactive collision → RPC reactivates the existing row under
      //     this company, preserving service history.
      // No client-side pre-check — a naive SELECT can't tell active
      // from inactive and would block legitimate re-registrations of
      // soft-deleted vehicles.

      // Single atomic RPC — inserts vehicle + ownership (+ optional mileage history)
      // SECURITY DEFINER sidesteps the RLS chicken-and-egg.
      //
      // Returns JSONB: { success, vehicle_id, reactivated, immutable_overrides }.
      // See add_fleet_vehicle_with_ownership for the full contract.
      const { data: result, error: rpcError } = await supabase.rpc('add_fleet_vehicle_with_ownership', {
        p_plate_number:        plate,
        p_make:                form.make,
        p_model:               form.model,
        p_year_of_manufacture: form.year ? parseInt(form.year) : null,
        p_color:               form.color || null,
        p_vin:                 form.vin.trim().toUpperCase(),
        p_mileage:             form.mileage ? parseInt(form.mileage) : null,
        p_owner_user_id:       profileId,
        p_owner_company_id:    companyId,
      })

      if (rpcError) throw rpcError
      if (result?.success === false) throw new Error(result.error || 'Failed to add vehicle')

      const overrides = Array.isArray(result?.immutable_overrides) ? result.immutable_overrides : []
      let message = 'Vehicle added to fleet successfully!'
      let redirectDelay = 1800
      if (result?.reactivated) {
        message =
          'This vehicle has been re-registered to your fleet. ' +
          'Its full service history from previous ownership has been preserved.'
        if (overrides.length > 0) {
          message +=
            ' Note: ' + overrides.join(', ').replace('year_of_manufacture', 'year') +
            ' could not be changed — these are tied to the VIN and were kept from the existing record.'
        }
        redirectDelay = 5000
      }
      setSuccess(message)
      setTimeout(() => router.push(`/dashboard/company/${companyId}/fleet`), redirectDelay)

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
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
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
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => router.back()}
        className="mb-6 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
      >
        <ArrowLeft size={18} />
        Back to Fleet
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 bg-blue-100 rounded-xl">
          <Truck className="w-6 h-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Fleet Vehicle</h1>
          <p className="text-sm text-gray-500">Register a new vehicle for this company</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-green-700 text-sm">{success}</p>
              <p className="text-green-600 text-xs italic mt-1">Redirecting…</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Plate Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.plateNumber}
              onChange={e => field('plateNumber', e.target.value.toUpperCase())}
              required
              placeholder="KAA 123A"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase tracking-widest font-mono text-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Make <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.make}
                onChange={e => field('make', e.target.value)}
                required
                placeholder="Toyota"
                list="makes-list"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <datalist id="makes-list">
                {['Toyota','Nissan','Mazda','Isuzu','Subaru','Mitsubishi','Ford','Mercedes-Benz','BMW','Volkswagen'].map(m => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Model <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.model}
                onChange={e => field('model', e.target.value)}
                required
                placeholder="Hilux"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Year <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.year}
                onChange={e => field('year', e.target.value)}
                required
                min="1900"
                max={new Date().getFullYear() + 1}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
              <input
                type="text"
                value={form.color}
                onChange={e => field('color', e.target.value)}
                placeholder="White"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">VIN</label>
              <input
                type="text"
                value={form.vin}
                onChange={e => field('vin', e.target.value.toUpperCase())}
                required
                maxLength={17}
                placeholder="1HGBH41JXMN109186"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Current Mileage (km) <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                value={form.mileage}
                onChange={e => field('mileage', e.target.value)}
                min="0"
                placeholder="50000"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !!success}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
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
  )
}