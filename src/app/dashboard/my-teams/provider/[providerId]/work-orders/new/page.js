'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Search, Car, User, Building2,
  UserX, Mail, Phone, CheckCircle, AlertCircle, Loader2,
  ClipboardList, Plus, Info, Shield, Lock
} from 'lucide-react'

/**
 * Member-side walk-in work order page.
 *
 * Same 4-step flow as the provider walk-in page (Vehicle → Owner → Details →
 * Confirm), but:
 *   • scoped to a single provider via /provider/[providerId] in the URL
 *   • requires `can_approve_work` on the caller's membership for THIS provider
 *   • POSTs to /api/provider/work-orders with `providerId` and
 *     `notifyOwnerAndAdmins: true` so the owner + admins get fan-out comms
 *     (the API excludes the initiator)
 *   • blue branding (member surface) rather than green
 *   • success screen routes to the member work-order page, not the provider one
 */

const STEPS = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'owner',   label: 'Owner'   },
  { id: 'details', label: 'Details' },
  { id: 'confirm', label: 'Confirm' },
]

export default function MemberNewWalkInWorkOrderPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const providerId = params.providerId

  // ── Auth / permission state ────────────────────────────────────────────
  const [authChecked,   setAuthChecked]   = useState(false)
  const [authError,     setAuthError]     = useState('')
  const [provider,      setProvider]      = useState(null)
  const [membership,    setMembership]    = useState(null)

  // ── Flow state ─────────────────────────────────────────────────────────
  const [step,    setStep]    = useState(0)    // 0=vehicle, 1=owner, 2=details, 3=confirm, 4=success
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  // Vehicle lookup
  const [searchValue,  setSearchValue]  = useState('')
  const [searching,    setSearching]    = useState(false)
  const [lookupResult, setLookupResult] = useState(null)
  const [vehicleForm,  setVehicleForm]  = useState({
    make: '', model: '', year: '', color: '', vin: ''
  })
  const searchRef = useRef(null)

  // Owner selection
  const [ownerMode,   setOwnerMode]   = useState(null)   // 'use_found' | 'invite_email' | 'skip'
  const [walkInOwner, setWalkInOwner] = useState({ name: '', phone: '', email: '' })

  // WO details
  const [details, setDetails] = useState({
    problem_description: '',
    priority:            'normal',
    shop_id:             '',
    initial_mileage:     '',
  })
  const [shops, setShops] = useState([])

  // Result
  const [result, setResult] = useState(null)

  // ── 1. Verify member + can_approve_work for THIS provider ──────────────
  useEffect(() => {
    if (!providerId) return
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }

        const { data: profile } = await supabase
          .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
        if (!profile) {
          setAuthError('Profile not found')
          setAuthChecked(true)
          return
        }

        const [{ data: spu }, { data: mech }] = await Promise.all([
          supabase.from('service_provider_users')
            .select('role, can_approve_work')
            .eq('service_provider_id', providerId)
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .maybeSingle(),
          supabase.from('mechanics')
            .select('role, can_approve_work')
            .eq('service_provider_id', providerId)
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .maybeSingle(),
        ])

        if (!spu && !mech) {
          setAuthError("You aren't a member of this service provider.")
          setAuthChecked(true)
          return
        }

        const merged = {
          role: spu?.role || mech?.role || 'mechanic',
          can_approve_work: !!(spu?.can_approve_work || mech?.can_approve_work),
        }
        if (!merged.can_approve_work) {
          setAuthError(
            "Creating walk-in work orders requires the 'WO access' permission. " +
            "Ask a team admin to enable it for you."
          )
          setMembership(merged)
          setAuthChecked(true)
          return
        }
        setMembership(merged)

        const { data: prov } = await supabase
          .from('service_providers').select('id, name')
          .eq('id', providerId).maybeSingle()
        setProvider(prov)

        setAuthChecked(true)
        loadShops()
      } catch (e) {
        setAuthError(e.message)
        setAuthChecked(true)
      }
    })()
  }, [providerId, router])

  const loadShops = useCallback(async () => {
    if (!providerId) return
    try {
      const { data } = await supabase
        .from('shops').select('id, name, town')
        .eq('service_provider_id', providerId)
        .eq('is_active', true)
        .order('name')
      setShops(data || [])
    } catch {}
  }, [providerId])

  // ── 2. Step 1: Vehicle lookup ──────────────────────────────────────────
  const handleVehicleLookup = async () => {
    if (!searchValue.trim() || searchValue.trim().length < 3) {
      setError('Enter at least 3 characters of the plate or VIN')
      return
    }
    setSearching(true); setError(''); setLookupResult(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('lookup_vehicle_and_owner', {
        p_search_value:    searchValue.trim().toUpperCase(),
        p_requesting_user: user.id,
      })
      if (rpcErr) throw rpcErr
      setLookupResult(data)
    } catch (e) {
      setError(e.message || 'Lookup failed')
    } finally {
      setSearching(false)
    }
  }

  const canProceedFromVehicle = () => {
    if (!searchValue.trim() || searchValue.trim().length < 3) return false
    if (!lookupResult) return false
    if (lookupResult.found) return true
    // not found — require make/model to register the vehicle
    return vehicleForm.make.trim() && vehicleForm.model.trim()
  }

  const goToOwnerStep = () => {
    if (lookupResult?.found && lookupResult.owner_type === 'user') {
      setOwnerMode('use_found')
    } else if (lookupResult?.found && lookupResult.owner_type === 'company') {
      setOwnerMode('use_found')
    } else {
      setOwnerMode(null)
    }
    setStep(1)
  }

  // ── 3. Step 2: Owner ───────────────────────────────────────────────────
  const canProceedFromOwner = () => {
    if (!ownerMode) return false
    if (ownerMode === 'use_found') return true
    if (ownerMode === 'skip')      return true
    if (ownerMode === 'invite_email') return walkInOwner.email.includes('@')
    return false
  }

  // ── 4. Step 4: Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true); setError('')
    try {
      const payload = {
        // Member flow — tell the API which provider this is for + that the
        // owner+admin fan-out should run (the API filters out the initiator).
        providerId,
        notifyOwnerAndAdmins: true,

        plate_number:        searchValue.trim().toUpperCase(),
        make:                !lookupResult?.found ? vehicleForm.make  : undefined,
        model:               !lookupResult?.found ? vehicleForm.model : undefined,
        year:                !lookupResult?.found ? vehicleForm.year  : undefined,
        color:               !lookupResult?.found ? vehicleForm.color : undefined,
        vin:                 !lookupResult?.found ? vehicleForm.vin   : undefined,
        problem_description: details.problem_description || null,
        priority:            details.priority,
        shop_id:             details.shop_id || null,
        initial_mileage:     details.initial_mileage || null,
      }

      if (ownerMode === 'use_found' && lookupResult?.owner_type === 'user') {
        payload.owner_user_id = lookupResult.owner.id
      } else if (ownerMode === 'use_found' && lookupResult?.owner_type === 'company') {
        payload.owner_company_id = lookupResult.owner.id
      } else if (ownerMode === 'invite_email') {
        payload.walk_in_owner_name  = walkInOwner.name  || null
        payload.walk_in_owner_phone = walkInOwner.phone || null
        payload.walk_in_owner_email = walkInOwner.email
      } else if (ownerMode === 'skip') {
        payload.walk_in_owner_name  = walkInOwner.name  || null
        payload.walk_in_owner_phone = walkInOwner.phone || null
      }

      const resp = await fetch('/api/provider/work-orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Failed to create work order')
      }
      setResult(data)
      setStep(4)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render gates
  // ─────────────────────────────────────────────────────────────────────────
  if (!authChecked) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin h-10 w-10 text-blue-600" />
    </div>
  )

  if (authError) return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <button onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}`)}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
        <ArrowLeft size={16} /> Back to provider
      </button>

      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
        <Lock className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
        <div>
          <p className="font-semibold text-red-900">Access denied</p>
          <p className="text-sm text-red-700 mt-1">{authError}</p>
          {membership && (
            <p className="text-xs text-red-600 mt-2">
              Your current role: <span className="font-medium capitalize">{membership.role?.replace(/_/g, ' ')}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

      {/* Back link */}
      <button onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to {provider?.name || 'Provider'}
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList size={22} className="text-blue-600" />
          New Walk-In Work Order
        </h1>
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 mt-1">
          <span className="font-medium text-gray-700 truncate">{provider?.name}</span>
          <span>·</span>
          <span className="capitalize">{membership?.role?.replace(/_/g, ' ')}</span>
          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold flex items-center gap-1">
            <Shield size={9} /> WO access
          </span>
        </div>
      </div>

      {/* Step indicator (hidden on success) */}
      {step < 4 && (
        <div className="bg-white rounded-xl shadow-sm p-3 flex items-center justify-between gap-1 sm:gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold flex-shrink-0 ${
                i < step ? 'bg-blue-600 text-white'
                  : i === step ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={`text-xs sm:text-sm font-medium truncate ${
                i === step ? 'text-gray-900' : i < step ? 'text-blue-700' : 'text-gray-400'
              }`}>{s.label}</span>
              {i < STEPS.length - 1 && (
                <div className={`hidden sm:block flex-1 h-px ${i < step ? 'bg-blue-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* ══════════════════ STEP 1 — VEHICLE ══════════════════ */}
      {step === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Plate Number or VIN
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input ref={searchRef}
                  type="text" value={searchValue}
                  onChange={e => setSearchValue(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleVehicleLookup()}
                  placeholder="e.g. KCA123A or full/partial VIN"
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg
                             focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                             text-sm uppercase tracking-wide" />
              </div>
              <button onClick={handleVehicleLookup}
                disabled={searching || searchValue.trim().length < 3}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2">
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Search
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              Minimum 3 characters. Searches all vehicles registered in the platform.
            </p>
          </div>

          {/* Lookup result */}
          {lookupResult && (
            <div className={`rounded-lg border p-4 ${
              lookupResult.found ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
            }`}>
              {lookupResult.found ? (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
                    <div className="text-sm">
                      <p className="font-medium text-green-900">Vehicle found</p>
                      <p className="text-green-800 mt-0.5">
                        {lookupResult.owner_type === 'user'
                          ? 'Owner is a registered user.'
                          : lookupResult.owner_type === 'company'
                            ? 'Belongs to a company fleet.'
                            : 'Vehicle exists but has no registered owner.'}
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-white rounded p-3 border border-green-100">
                      <p className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                        <Car size={12} /> Vehicle
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {lookupResult.vehicle.plate_number}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {[lookupResult.vehicle.make, lookupResult.vehicle.model, lookupResult.vehicle.year_of_manufacture]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {lookupResult.owner_type === 'user' && (
                      <div className="bg-white rounded p-3 border border-green-100">
                        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                          <User size={12} /> Owner
                        </p>
                        <p className="text-sm font-semibold text-gray-900">
                          {[lookupResult.owner?.first_name, lookupResult.owner?.last_name]
                            .filter(Boolean).join(' ') || 'Customer'}
                        </p>
                        {lookupResult.owner?.phone && (
                          <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                            <Phone size={10} /> {lookupResult.owner.phone}
                          </p>
                        )}
                      </div>
                    )}
                    {lookupResult.owner_type === 'company' && (
                      <div className="bg-white rounded p-3 border border-green-100">
                        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                          <Building2 size={12} /> Fleet
                        </p>
                        <p className="text-sm font-semibold text-gray-900">
                          {lookupResult.owner?.name || 'Company'}
                        </p>
                        {lookupResult.owner?.phone && (
                          <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                            <Phone size={10} /> {lookupResult.owner.phone}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900">Vehicle not in the system</p>
                      <p className="text-amber-800 mt-0.5">
                        Fill in the basics so we can register it as part of this work order.
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Make *</label>
                      <input type="text" value={vehicleForm.make}
                        onChange={e => setVehicleForm(f => ({ ...f, make: e.target.value }))}
                        placeholder="e.g. Toyota"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Model *</label>
                      <input type="text" value={vehicleForm.model}
                        onChange={e => setVehicleForm(f => ({ ...f, model: e.target.value }))}
                        placeholder="e.g. Corolla"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                      <input type="number" value={vehicleForm.year}
                        onChange={e => setVehicleForm(f => ({ ...f, year: e.target.value }))}
                        placeholder="e.g. 2018"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Colour</label>
                      <input type="text" value={vehicleForm.color}
                        onChange={e => setVehicleForm(f => ({ ...f, color: e.target.value }))}
                        placeholder="e.g. Silver"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">VIN (optional)</label>
                      <input type="text" value={vehicleForm.vin}
                        onChange={e => setVehicleForm(f => ({ ...f, vin: e.target.value.toUpperCase() }))}
                        placeholder="17-character VIN"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase tracking-wide focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={goToOwnerStep}
              disabled={!canProceedFromVehicle()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              Continue <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ STEP 2 — OWNER ══════════════════ */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <p className="text-sm text-gray-600">
            How would you like to record the owner of this vehicle?
          </p>

          <div className="space-y-2">
            {lookupResult?.found && lookupResult.owner_type === 'user' && (
              <OwnerOption
                selected={ownerMode === 'use_found'}
                onClick={() => setOwnerMode('use_found')}
                icon={User}
                title="Use the registered owner"
                desc={[lookupResult.owner?.first_name, lookupResult.owner?.last_name]
                  .filter(Boolean).join(' ') + (lookupResult.owner?.phone ? ` · ${lookupResult.owner.phone}` : '')}
              />
            )}
            {lookupResult?.found && lookupResult.owner_type === 'company' && (
              <OwnerOption
                selected={ownerMode === 'use_found'}
                onClick={() => setOwnerMode('use_found')}
                icon={Building2}
                title="Use the fleet owner"
                desc={`${lookupResult.owner?.name || 'Company'}${lookupResult.owner?.phone ? ` · ${lookupResult.owner.phone}` : ''}`}
              />
            )}

            <OwnerOption
              selected={ownerMode === 'invite_email'}
              onClick={() => setOwnerMode('invite_email')}
              icon={Mail}
              title="Send an invitation email"
              desc="The owner gets an email link to register and track the service."
            />

            <OwnerOption
              selected={ownerMode === 'skip'}
              onClick={() => setOwnerMode('skip')}
              icon={UserX}
              title="Walk-in only — no invitation"
              desc="Record name and phone (optional). The owner won't get email/SMS until they're added later."
            />
          </div>

          {/* Owner contact fields when not using found */}
          {(ownerMode === 'invite_email' || ownerMode === 'skip') && (
            <div className="space-y-3 border-t border-gray-100 pt-4 mt-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" value={walkInOwner.name}
                    onChange={e => setWalkInOwner(o => ({ ...o, name: e.target.value }))}
                    placeholder="Owner's full name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={walkInOwner.phone}
                    onChange={e => setWalkInOwner(o => ({ ...o, phone: e.target.value }))}
                    placeholder="e.g. 0712 000 000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                {ownerMode === 'invite_email' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                    <input type="email" value={walkInOwner.email}
                      onChange={e => setWalkInOwner(o => ({ ...o, email: e.target.value }))}
                      placeholder="owner@example.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(0)}
              className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button onClick={() => setStep(2)}
              disabled={!canProceedFromOwner()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              Continue <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ STEP 3 — DETAILS ══════════════════ */}
      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Problem description
            </label>
            <textarea rows={3}
              value={details.problem_description}
              onChange={e => setDetails(d => ({ ...d, problem_description: e.target.value }))}
              placeholder="What did the customer report? (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <select value={details.priority}
                onChange={e => setDetails(d => ({ ...d, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Initial mileage</label>
              <input type="number" value={details.initial_mileage}
                onChange={e => setDetails(d => ({ ...d, initial_mileage: e.target.value }))}
                placeholder="km on the odometer"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {shops.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shop (optional)</label>
              <select value={details.shop_id}
                onChange={e => setDetails(d => ({ ...d, shop_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">— No specific shop —</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.town ? ` · ${s.town}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)}
              className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button onClick={() => setStep(3)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              Review <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ STEP 4 — CONFIRM ══════════════════ */}
      {step === 3 && (
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-sm">
            <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-blue-900">
              On submit, the owner of <strong>{provider?.name}</strong> and any active admins
              will be notified by email, SMS and in-app. You won't be notified about your own action.
            </p>
          </div>

          {/* Vehicle */}
          <ReviewCard icon={Car} title="Vehicle">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Plate:</span>{' '}
                <strong>{lookupResult?.vehicle?.plate_number || searchValue.trim().toUpperCase()}</strong>
              </div>
              {(lookupResult?.found ? lookupResult.vehicle.make : vehicleForm.make) && (
                <div><span className="text-gray-500">Make / Model:</span>{' '}
                  {lookupResult?.found
                    ? `${lookupResult.vehicle.make} ${lookupResult.vehicle.model || ''}`
                    : `${vehicleForm.make} ${vehicleForm.model}`}
                </div>
              )}
            </div>
          </ReviewCard>

          {/* Owner */}
          <ReviewCard icon={User} title="Owner">
            <div className="text-sm text-gray-700">
              {ownerMode === 'use_found' && lookupResult?.owner_type === 'user' && (
                <>Registered: <strong>{[lookupResult.owner?.first_name, lookupResult.owner?.last_name].filter(Boolean).join(' ')}</strong></>
              )}
              {ownerMode === 'use_found' && lookupResult?.owner_type === 'company' && (
                <>Fleet: <strong>{lookupResult.owner?.name}</strong></>
              )}
              {ownerMode === 'invite_email' && (
                <>Invite will be sent to <strong>{walkInOwner.email}</strong>{walkInOwner.name ? ` (${walkInOwner.name})` : ''}</>
              )}
              {ownerMode === 'skip' && (
                <>Walk-in: <strong>{walkInOwner.name || 'No name'}</strong>{walkInOwner.phone ? ` · ${walkInOwner.phone}` : ''}</>
              )}
            </div>
          </ReviewCard>

          {/* Work order */}
          <ReviewCard icon={ClipboardList} title="Work Order">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Priority:</span>{' '}
                <span className={details.priority === 'urgent' ? 'text-red-600 font-semibold' : 'text-gray-900'}>
                  {details.priority}
                </span>
              </div>
              {details.initial_mileage && (
                <div><span className="text-gray-500">Mileage:</span> {parseInt(details.initial_mileage).toLocaleString()} km</div>
              )}
              {details.shop_id && shops.length > 0 && (
                <div className="col-span-2">
                  <span className="text-gray-500">Shop:</span>{' '}
                  {shops.find(s => s.id === details.shop_id)?.name || '—'}
                </div>
              )}
              {details.problem_description && (
                <div className="col-span-2">
                  <span className="text-gray-500">Description:</span>{' '}
                  <span className="text-gray-800">{details.problem_description}</span>
                </div>
              )}
            </div>
          </ReviewCard>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)}
              className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-7 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm">
              {saving
                ? <><Loader2 size={16} className="animate-spin" /> Creating…</>
                : <><CheckCircle size={16} /> Create Work Order</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ SUCCESS ══════════════════ */}
      {step === 4 && result && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="text-blue-600" size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Work Order Created</h2>
          <p className="text-gray-500">
            Work order{' '}
            <span className="font-semibold text-gray-900">{result.work_order_number}</span>
            {' '}has been created successfully.
          </p>

          {/* Customer-comms feedback */}
          {result.invitation_id && (
            <div className={`mx-auto max-w-sm p-4 rounded-lg border text-sm ${
              result.email_sent ? 'bg-blue-50 border-blue-200 text-blue-800'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {result.email_sent ? (
                <>
                  <Mail size={16} className="inline mr-1" />
                  Invitation email sent to <strong>{walkInOwner.email}</strong>.
                  Once they register, the vehicle appears in their dashboard.
                </>
              ) : (
                <>
                  <AlertCircle size={16} className="inline mr-1" />
                  {result.email_warning || 'Email could not be sent. You can resend from the work order page.'}
                </>
              )}
            </div>
          )}
          {result.customer_notified && !result.invitation_id && (
            <div className="mx-auto max-w-sm p-3 rounded-lg border bg-blue-50 border-blue-200 text-blue-800 text-xs">
              <Mail size={13} className="inline mr-1" />
              The vehicle owner has been notified by email, SMS and in-app.
            </div>
          )}
          <div className="mx-auto max-w-sm p-3 rounded-lg border bg-gray-50 border-gray-200 text-gray-700 text-xs">
            <Info size={13} className="inline mr-1" />
            The owner and admins of <strong>{provider?.name}</strong> have been notified.
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button onClick={() => router.push(`/dashboard/my-teams/work-order/${result.work_order_id}`)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
              <ClipboardList size={16} /> Open Work Order
            </button>
            <button
              onClick={() => {
                setStep(0); setSearchValue(''); setLookupResult(null)
                setOwnerMode(null); setWalkInOwner({ name: '', phone: '', email: '' })
                setDetails({ problem_description: '', priority: 'normal', shop_id: '', initial_mileage: '' })
                setResult(null); setError('')
                setVehicleForm({ make: '', model: '', year: '', color: '', vin: '' })
              }}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">
              <Plus size={16} /> Create Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Small visual helpers ───────────────────────────────────────────────────
function OwnerOption({ selected, onClick, icon: Icon, title, desc }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
        selected ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100'
                 : 'bg-white border-gray-200 hover:border-gray-300'
      }`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 p-1.5 rounded ${selected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${selected ? 'text-blue-900' : 'text-gray-900'}`}>{title}</p>
          {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
        </div>
      </div>
    </button>
  )
}

function ReviewCard({ icon: Icon, title, children }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
        <Icon size={15} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}