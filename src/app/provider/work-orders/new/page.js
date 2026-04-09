'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Search, Car, User, Building2,
  UserX, Mail, Phone, CheckCircle, AlertCircle, Loader2,
  ClipboardList, Plus, Info
} from 'lucide-react'

// ─── Step definitions ──────────────────────────────────────────────────────
const STEPS = [
  { id: 'vehicle',   label: 'Vehicle'  },
  { id: 'owner',     label: 'Owner'    },
  { id: 'details',   label: 'Details'  },
  { id: 'confirm',   label: 'Confirm'  },
]

export default function NewWalkInWorkOrderPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [step, setStep]     = useState(0)   // 0=vehicle, 1=owner, 2=details, 3=confirm
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // ── Step 1: Vehicle lookup state ──
  const [searchValue, setSearchValue]     = useState('')
  const [searching, setSearching]         = useState(false)
  const [lookupResult, setLookupResult]   = useState(null)  // null | { found, owner_type, vehicle, owner }
  const [vehicleForm, setVehicleForm]     = useState({      // shown when vehicle not in system
    make: '', model: '', year: '', color: '', vin: ''
  })
  const searchRef = useRef(null)

  // ── Step 2: Owner selection state ──
  const [ownerMode, setOwnerMode] = useState(null)
  // 'use_found'      → found in system, confirm
  // 'invite_email'   → not found, send invite
  // 'skip'           → proceed without owner
  const [walkInOwner, setWalkInOwner] = useState({ name: '', phone: '', email: '' })

  // ── Step 3: WO details ──
  const [details, setDetails] = useState({
    problem_description: '',
    priority:            'normal',
    shop_id:             '',
    initial_mileage:     '',
  })
  const [shops, setShops] = useState([])

  // ── Result ──
  const [result, setResult] = useState(null)

  useEffect(() => { loadShops() }, [])

  const loadShops = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { data: provider } = await supabase
        .from('service_providers').select('id').eq('owner_user_id', profile.id).single()
      if (!provider) return
      const { data } = await supabase
        .from('shops').select('id, name, town').eq('service_provider_id', provider.id).eq('is_active', true)
      setShops(data || [])
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — Vehicle lookup
  // ─────────────────────────────────────────────────────────────────────────
  const handleVehicleLookup = async () => {
    if (!searchValue.trim() || searchValue.trim().length < 3) {
      setError('Enter at least 3 characters of the plate number or VIN')
      return
    }
    setSearching(true)
    setError('')
    setLookupResult(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: res, error: rpcErr } = await supabase.rpc('lookup_vehicle_and_owner', {
        p_search_value:    searchValue.trim().toUpperCase(),
        p_requesting_user: user.id,
      })
      if (rpcErr) throw rpcErr
      setLookupResult(res)

      // Pre-fill vehicle form if not found in system
      if (res.found) {
        // Vehicle found, pre-populate vehicleForm too (user might want to update)
        const v = res.vehicle
        setVehicleForm({
          make:  v.make  || '',
          model: v.model || '',
          year:  v.year_of_manufacture?.toString() || '',
          color: v.color || '',
          vin:   v.vin   || '',
        })
      }
    } catch (err) {
      setError(err.message || 'Lookup failed')
    } finally {
      setSearching(false)
    }
  }

  const canProceedFromVehicle = () => {
    if (!lookupResult) return false
    if (lookupResult.found) return true
    // Not found: plate + make + model required
    return searchValue.trim().length >= 3
      && vehicleForm.make.trim()
      && vehicleForm.model.trim()
  }

  const proceedToOwner = () => {
    setError('')
    // If vehicle found and has a known owner, pre-set mode
    if (lookupResult?.found && lookupResult.owner_type === 'user') {
      setOwnerMode('use_found')
    } else if (lookupResult?.found && lookupResult.owner_type === 'company') {
      setOwnerMode('use_found')
    } else {
      setOwnerMode(null) // let them choose
    }
    setStep(1)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — Owner
  // ─────────────────────────────────────────────────────────────────────────
  const canProceedFromOwner = () => {
    if (!ownerMode) return false
    if (ownerMode === 'use_found') return true
    if (ownerMode === 'skip') return true
    if (ownerMode === 'invite_email') {
      return walkInOwner.email.includes('@')
    }
    return false
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 — Submit
  // ─────────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        plate_number:        searchValue.trim().toUpperCase(),
        make:                !lookupResult?.found ? vehicleForm.make  : undefined,
        model:               !lookupResult?.found ? vehicleForm.model : undefined,
        year:                !lookupResult?.found ? vehicleForm.year  : undefined,
        color:               !lookupResult?.found ? vehicleForm.color : undefined,
        vin:                 !lookupResult?.found ? vehicleForm.vin   : undefined,
        problem_description: details.problem_description || null,
        priority:            details.priority,
        shop_id:             details.shop_id  || null,
        initial_mileage:     details.initial_mileage || null,
      }

      // Owner
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
      setStep(4) // success screen
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => step === 0 ? router.push('/provider/work-orders') : setStep(s => s - 1)}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6 text-sm"
      >
        <ArrowLeft size={18} className="mr-1" />
        {step === 0 ? 'Back to Work Orders' : 'Back'}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
        <Plus size={22} className="text-green-600" /> New Walk-In Work Order
      </h1>
      <p className="text-gray-500 text-sm mb-6">
        Create a work order for a vehicle that arrived without a prior booking.
      </p>

      {/* Step indicator */}
      {step < 4 && (
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all ${
                i < step  ? 'bg-green-600 text-white'
                : i === step ? 'bg-green-600 text-white ring-2 ring-green-200'
                : 'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${
                i === step ? 'text-gray-900' : i < step ? 'text-green-700' : 'text-gray-400'
              }`}>{s.label}</span>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-6 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={17} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* ══════════════════ STEP 1: VEHICLE ══════════════════ */}
      {step === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">Search for Vehicle</h2>

          {/* Search box */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Plate Number or VIN / Chassis Number
            </label>
            <div className="flex gap-2">
              <input
                ref={searchRef}
                type="text"
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value.toUpperCase())
                  setLookupResult(null)
                  setError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleVehicleLookup()}
                placeholder="e.g. KDC 123A or VIN..."
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm font-mono uppercase"
              />
              <button
                onClick={handleVehicleLookup}
                disabled={searching || searchValue.trim().length < 3}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* ── Lookup result ── */}
          {lookupResult && (
            <div className={`rounded-lg border p-4 ${
              lookupResult.found
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              {lookupResult.found ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="text-green-600" size={18} />
                    <p className="font-medium text-green-900 text-sm">Vehicle found in system</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Plate:</span> <strong>{lookupResult.vehicle.plate_number}</strong></div>
                    <div><span className="text-gray-500">Make:</span> {lookupResult.vehicle.make || '—'}</div>
                    <div><span className="text-gray-500">Model:</span> {lookupResult.vehicle.model || '—'}</div>
                    <div><span className="text-gray-500">Year:</span> {lookupResult.vehicle.year_of_manufacture || '—'}</div>
                    {lookupResult.vehicle.color && (
                      <div><span className="text-gray-500">Color:</span> {lookupResult.vehicle.color}</div>
                    )}
                    {lookupResult.vehicle.vin && (
                      <div className="col-span-2">
                        <span className="text-gray-500">VIN:</span>{' '}
                        <span className="font-mono text-xs">{lookupResult.vehicle.vin}</span>
                      </div>
                    )}
                  </div>
                  {lookupResult.owner_type === 'user' && (
                    <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-2 text-sm text-green-800">
                      <User size={14} />
                      Owner: <strong>{lookupResult.owner.first_name} {lookupResult.owner.last_name}</strong>
                      {lookupResult.owner.phone && <span className="text-green-600">· {lookupResult.owner.phone}</span>}
                    </div>
                  )}
                  {lookupResult.owner_type === 'company' && (
                    <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-2 text-sm text-green-800">
                      <Building2 size={14} />
                      Fleet: <strong>{lookupResult.owner.name}</strong>
                    </div>
                  )}
                  {lookupResult.owner_type === 'none' && (
                    <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-2 text-sm text-amber-700">
                      <Info size={14} />
                      No owner registered for this vehicle
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="text-amber-500" size={18} />
                    <p className="font-medium text-amber-900 text-sm">
                      Vehicle not found — fill in details to register it
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { field: 'make',  label: 'Make *',  placeholder: 'Toyota' },
                      { field: 'model', label: 'Model *', placeholder: 'Corolla' },
                      { field: 'year',  label: 'Year',    placeholder: '2018' },
                      { field: 'color', label: 'Color',   placeholder: 'White' },
                    ].map(({ field, label, placeholder }) => (
                      <div key={field}>
                        <label className="block text-xs text-gray-600 mb-1">{label}</label>
                        <input
                          type="text"
                          value={vehicleForm[field]}
                          onChange={(e) => setVehicleForm(f => ({ ...f, [field]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-1">VIN / Chassis (optional)</label>
                      <input
                        type="text"
                        value={vehicleForm.vin}
                        onChange={(e) => setVehicleForm(f => ({ ...f, vin: e.target.value.toUpperCase() }))}
                        placeholder="17-char VIN"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Next button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={proceedToOwner}
              disabled={!canProceedFromVehicle()}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 text-sm font-medium"
            >
              Next: Owner <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ STEP 2: OWNER ══════════════════ */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">Vehicle Owner</h2>

          {/* If owner found */}
          {lookupResult?.found && lookupResult.owner_type === 'user' && (
            <div className="space-y-3">
              <button
                onClick={() => setOwnerMode('use_found')}
                className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                  ownerMode === 'use_found'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <User className={ownerMode === 'use_found' ? 'text-green-600' : 'text-gray-400'} size={22} />
                <div>
                  <p className="font-medium text-gray-900">
                    {lookupResult.owner.first_name} {lookupResult.owner.last_name}
                  </p>
                  <p className="text-sm text-gray-500">Registered user · {lookupResult.owner.phone || 'No phone'}</p>
                  <p className="text-xs text-green-700 mt-1">Select this owner</p>
                </div>
                {ownerMode === 'use_found' && <CheckCircle className="text-green-600 ml-auto" size={18} />}
              </button>
            </div>
          )}

          {lookupResult?.found && lookupResult.owner_type === 'company' && (
            <button
              onClick={() => setOwnerMode('use_found')}
              className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                ownerMode === 'use_found'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Building2 className={ownerMode === 'use_found' ? 'text-green-600' : 'text-gray-400'} size={22} />
              <div>
                <p className="font-medium text-gray-900">{lookupResult.owner.name}</p>
                <p className="text-sm text-gray-500">Fleet / Company vehicle</p>
              </div>
              {ownerMode === 'use_found' && <CheckCircle className="text-green-600 ml-auto" size={18} />}
            </button>
          )}

          {/* Divider if owner found but still showing alternatives */}
          {lookupResult?.found && lookupResult.owner_type !== 'none' && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          )}

          {/* Invite by email */}
          <button
            onClick={() => setOwnerMode('invite_email')}
            className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
              ownerMode === 'invite_email'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Mail className={ownerMode === 'invite_email' ? 'text-blue-600' : 'text-gray-400'} size={22} />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Send invite email to owner</p>
              <p className="text-sm text-gray-500">Owner not in system — invite them to register</p>
            </div>
            {ownerMode === 'invite_email' && <CheckCircle className="text-blue-600 ml-auto" size={18} />}
          </button>

          {ownerMode === 'invite_email' && (
            <div className="ml-10 space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Owner Email *</label>
                <input
                  type="email"
                  value={walkInOwner.email}
                  onChange={(e) => setWalkInOwner(o => ({ ...o, email: e.target.value }))}
                  placeholder="owner@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Owner Name (optional)</label>
                  <input
                    type="text"
                    value={walkInOwner.name}
                    onChange={(e) => setWalkInOwner(o => ({ ...o, name: e.target.value }))}
                    placeholder="John Kamau"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone (optional)</label>
                  <input
                    type="tel"
                    value={walkInOwner.phone}
                    onChange={(e) => setWalkInOwner(o => ({ ...o, phone: e.target.value }))}
                    placeholder="0722 000 000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <p className="text-xs text-blue-700">
                An email with a registration link will be sent. Once they register,
                the vehicle and work order will appear in their dashboard automatically.
              </p>
            </div>
          )}

          {/* Skip owner */}
          <button
            onClick={() => setOwnerMode('skip')}
            className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
              ownerMode === 'skip'
                ? 'border-gray-500 bg-gray-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <UserX className={ownerMode === 'skip' ? 'text-gray-600' : 'text-gray-400'} size={22} />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Proceed without owner details</p>
              <p className="text-sm text-gray-500">Record name/phone manually, no system invite</p>
            </div>
            {ownerMode === 'skip' && <CheckCircle className="text-gray-600 ml-auto" size={18} />}
          </button>

          {ownerMode === 'skip' && (
            <div className="ml-10 grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Owner Name</label>
                <input
                  type="text"
                  value={walkInOwner.name}
                  onChange={(e) => setWalkInOwner(o => ({ ...o, name: e.target.value }))}
                  placeholder="John Kamau"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={walkInOwner.phone}
                  onChange={(e) => setWalkInOwner(o => ({ ...o, phone: e.target.value }))}
                  placeholder="0722 000 000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(0)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={() => { setError(''); setStep(2) }}
              disabled={!canProceedFromOwner()}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 text-sm font-medium"
            >
              Next: Details <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ STEP 3: DETAILS ══════════════════ */}
      {step === 2 && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">Work Order Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Problem / Job Description</label>
            <textarea
              value={details.problem_description}
              onChange={(e) => setDetails(d => ({ ...d, problem_description: e.target.value }))}
              placeholder="Describe the problem or work to be done..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={details.priority}
                onChange={(e) => setDetails(d => ({ ...d, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Mileage (km)</label>
              <input
                type="number"
                value={details.initial_mileage}
                onChange={(e) => setDetails(d => ({ ...d, initial_mileage: e.target.value }))}
                placeholder="e.g. 85000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {shops.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop / Location</label>
              <select
                value={details.shop_id}
                onChange={(e) => setDetails(d => ({ ...d, shop_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select a shop (optional)</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.town ? ` — ${s.town}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={() => { setError(''); setStep(3) }}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              Review &amp; Confirm <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ STEP 4: CONFIRM ══════════════════ */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">Review &amp; Confirm</h2>

          {/* Vehicle summary */}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-t-lg">
              <Car size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Vehicle</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Plate:</span> <strong>{searchValue.trim().toUpperCase()}</strong></div>
              {lookupResult?.found ? (
                <>
                  <div><span className="text-gray-500">Make:</span> {lookupResult.vehicle.make || '—'}</div>
                  <div><span className="text-gray-500">Model:</span> {lookupResult.vehicle.model || '—'}</div>
                  <div><span className="text-gray-500">Year:</span> {lookupResult.vehicle.year_of_manufacture || '—'}</div>
                </>
              ) : (
                <>
                  <div><span className="text-gray-500">Make:</span> {vehicleForm.make}</div>
                  <div><span className="text-gray-500">Model:</span> {vehicleForm.model}</div>
                  {vehicleForm.year && <div><span className="text-gray-500">Year:</span> {vehicleForm.year}</div>}
                  {vehicleForm.color && <div><span className="text-gray-500">Color:</span> {vehicleForm.color}</div>}
                </>
              )}
            </div>
          </div>

          {/* Owner summary */}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-t-lg">
              <User size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Owner</span>
            </div>
            <div className="px-4 py-3 text-sm">
              {ownerMode === 'use_found' && lookupResult?.owner_type === 'user' && (
                <p>
                  <strong>{lookupResult.owner.first_name} {lookupResult.owner.last_name}</strong>
                  {' '}— registered user
                </p>
              )}
              {ownerMode === 'use_found' && lookupResult?.owner_type === 'company' && (
                <p><strong>{lookupResult.owner.name}</strong> — fleet / company</p>
              )}
              {ownerMode === 'invite_email' && (
                <div className="space-y-1">
                  {walkInOwner.name && <p><strong>{walkInOwner.name}</strong></p>}
                  <p className="flex items-center gap-1 text-blue-700">
                    <Mail size={13} /> Invite will be sent to <strong>{walkInOwner.email}</strong>
                  </p>
                </div>
              )}
              {ownerMode === 'skip' && (
                <p className="text-gray-500">
                  {walkInOwner.name || 'No name provided'}
                  {walkInOwner.phone ? ` · ${walkInOwner.phone}` : ''}
                  {' '}— not linked to a system account
                </p>
              )}
            </div>
          </div>

          {/* WO details summary */}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-t-lg">
              <ClipboardList size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Work Order</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Priority:</span>{' '}
                <span className={details.priority === 'urgent'
                  ? 'text-red-600 font-semibold' : 'text-gray-900'}>
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
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-7 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
            >
              {saving
                ? <><Loader2 size={16} className="animate-spin" /> Creating...</>
                : <><CheckCircle size={16} /> Create Work Order</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════ SUCCESS ══════════════════ */}
      {step === 4 && result && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="text-green-600" size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Work Order Created!</h2>
          <p className="text-gray-500">
            Work order{' '}
            <span className="font-semibold text-gray-900">{result.work_order_number}</span>
            {' '}has been created successfully.
          </p>

          {result.invitation_id && (
            <div className={`mx-auto max-w-sm p-4 rounded-lg border text-sm ${
              result.email_sent
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              {result.email_sent ? (
                <>
                  <Mail size={16} className="inline mr-1" />
                  Invitation email sent to <strong>{walkInOwner.email}</strong>.
                  Once they register, the vehicle will appear in their dashboard.
                </>
              ) : (
                <>
                  <AlertCircle size={16} className="inline mr-1" />
                  {result.email_warning || 'Email could not be sent. You can resend from the work order page.'}
                </>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => router.push(`/provider/work-orders/${result.work_order_id}`)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
            >
              <ClipboardList size={16} /> Open Work Order
            </button>
            <button
              onClick={() => {
                setStep(0); setSearchValue(''); setLookupResult(null)
                setOwnerMode(null); setWalkInOwner({ name: '', phone: '', email: '' })
                setDetails({ problem_description: '', priority: 'normal', shop_id: '', initial_mileage: '' })
                setResult(null); setError('')
              }}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm"
            >
              <Plus size={16} /> Create Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}