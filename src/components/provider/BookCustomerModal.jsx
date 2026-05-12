// → Drop this file at: src/components/provider/BookCustomerModal.jsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Search, Loader2, AlertCircle, CheckCircle, Calendar as CalendarIcon,
  Car, User, Phone, Mail, ClipboardList, Building2, Info, ChevronRight,
  ArrowLeft, MapPin
} from 'lucide-react'

const STEPS = [
  { id: 'lookup',  label: 'Vehicle'  },
  { id: 'details', label: 'Details'  },
  { id: 'confirm', label: 'Confirm'  },
]

/**
 * BookCustomerModal
 * ─────────────────
 * Provider clicks a date on the calendar → this modal opens.
 *
 * Step 1: Plate/VIN lookup (RPC: lookup_vehicle_and_owner)
 *         - vehicle + registered user owner  → proceed
 *         - vehicle + company owner          → show info, suggest fleet flow
 *         - vehicle, no owner / not in DB    → show info, suggest walk-in WO
 *
 * Step 2: Pick time, optional shop, optional services, optional notes
 *
 * Step 3: Review & submit → POST /api/provider/bookings
 *
 * Props
 *   open           — boolean
 *   onClose        — () => void
 *   selectedDate   — 'YYYY-MM-DD'
 *   providerId     — uuid of the current provider
 *   onCreated      — (result) => void   — fired with { bookingId, bookingNumber }
 *   onOpenBooking  — (bookingId) => void  — router push helper
 */
export default function BookCustomerModal({
  open,
  onClose,
  selectedDate,
  providerId,
  onCreated,
  onOpenBooking,
}) {
  const supabase = createClient()
  const searchInputRef = useRef(null)

  const [step,        setStep]        = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [successData, setSuccessData] = useState(null)

  // Step 1 — vehicle lookup
  const [searchValue, setSearchValue] = useState('')
  const [searching,   setSearching]   = useState(false)
  const [lookup,      setLookup]      = useState(null) // RPC response

  // Step 2 — booking details
  const [bookingTime,      setBookingTime]      = useState('09:00')
  const [bookingEndTime,   setBookingEndTime]   = useState('10:00')
  const [shopId,           setShopId]           = useState('')
  const [shops,            setShops]            = useState([])
  const [services,         setServices]         = useState([])
  const [selectedServices, setSelectedServices] = useState([])
  const [problemDesc,      setProblemDesc]      = useState('')
  const [specialInstr,     setSpecialInstr]     = useState('')

  // ── Reset state whenever the modal is opened ─────────────────────────────
  useEffect(() => {
    if (!open) return
    setStep(0)
    setSaving(false)
    setError('')
    setSuccessData(null)
    setSearchValue('')
    setLookup(null)
    setBookingTime('09:00')
    setBookingEndTime('10:00')
    setShopId('')
    setSelectedServices([])
    setProblemDesc('')
    setSpecialInstr('')
    // Focus the search input on next paint
    setTimeout(() => searchInputRef.current?.focus(), 100)
  }, [open])

  // ── Load provider shops + services once when modal first mounts ──────────
  useEffect(() => {
    if (!providerId) return
    let cancelled = false
    ;(async () => {
      const [{ data: shopRows }, { data: svcRows }] = await Promise.all([
        supabase
          .from('shops').select('id, name, town')
          .eq('service_provider_id', providerId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('service_provider_services')
          .select('service_id, services(id, name)')
          .eq('service_provider_id', providerId),
      ])
      if (cancelled) return
      setShops(shopRows || [])
      setServices((svcRows || []).map(r => r.services).filter(Boolean))
    })()
    return () => { cancelled = true }
  }, [providerId])

  // Keep end-time at least 1h ahead of start
  useEffect(() => {
    if (!bookingTime) return
    const [h, m] = bookingTime.split(':').map(Number)
    const endH = Math.min(h + 1, 23)
    setBookingEndTime(`${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }, [bookingTime])

  if (!open) return null

  // ── Step 1: lookup handler ────────────────────────────────────────────────
  const handleLookup = async () => {
    const q = searchValue.trim()
    if (q.length < 3) {
      setError('Enter at least 3 characters of the plate or VIN')
      return
    }
    setSearching(true)
    setError('')
    setLookup(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('lookup_vehicle_and_owner', {
        p_search_value:    q.toUpperCase(),
        p_requesting_user: user.id,
      })
      if (rpcErr) throw rpcErr
      setLookup(data)
    } catch (e) {
      setError(e.message || 'Lookup failed')
    } finally {
      setSearching(false)
    }
  }

  const canProceedFromLookup =
    lookup?.found === true && lookup?.owner_type === 'user'

  // ── Step 3 submit ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!lookup?.vehicle?.id || !lookup?.owner?.id) {
      setError('Missing vehicle or customer information')
      return
    }
    setSaving(true)
    setError('')
    try {
      const resp = await fetch('/api/provider/bookings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          vehicleId:           lookup.vehicle.id,
          customerUserId:      lookup.owner.id,
          shopId:              shopId || null,
          bookingDate:         selectedDate,
          bookingTime,
          bookingTimeEnd:      bookingEndTime,
          problemDescription:  problemDesc.trim() || null,
          specialInstructions: specialInstr.trim() || null,
          requestedServices:   selectedServices,
        }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Failed to create booking')
      }
      setSuccessData(data)
      onCreated?.(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  const customerName = lookup?.owner
    ? `${lookup.owner.first_name || ''} ${lookup.owner.last_name || ''}`.trim() || 'Customer'
    : ''

  const fmtDate = (d) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-KE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/50 p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CalendarIcon size={20} className="text-green-600" />
              Book a Customer
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              For <span className="font-medium text-gray-700">{fmtDate(selectedDate)}</span>
            </p>
          </div>
          <button onClick={onClose}
            className="ml-3 p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Step indicator */}
          {!successData && (
            <div className="flex items-center gap-2 mb-1">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-all ${
                    i < step       ? 'bg-green-600 text-white'
                    : i === step   ? 'bg-green-600 text-white ring-2 ring-green-200'
                    :                'bg-gray-100 text-gray-400'
                  }`}>
                    {i < step ? <CheckCircle size={12} /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${
                    i === step ? 'text-gray-900' : i < step ? 'text-green-700' : 'text-gray-400'
                  }`}>{s.label}</span>
                  {i < STEPS.length - 1 && (
                    <div className={`h-px w-5 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* ════════════════ STEP 0 — VEHICLE LOOKUP ════════════════ */}
          {step === 0 && !successData && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plate Number or VIN / Chassis
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchValue}
                      onChange={e => setSearchValue(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && handleLookup()}
                      placeholder="e.g. KCA123A or VIN"
                      className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg
                                 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm
                                 uppercase tracking-wide"
                    />
                  </div>
                  <button
                    onClick={handleLookup}
                    disabled={searching || searchValue.trim().length < 3}
                    className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700
                               disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                  >
                    {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    Search
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Min 3 characters. Searches all vehicles registered in Motiifix.
                </p>
              </div>

              {/* Lookup result panel */}
              {lookup && (
                <div className="rounded-lg border p-4 space-y-3"
                  style={{
                    background: canProceedFromLookup ? '#f0fdf4' : '#fef3c7',
                    borderColor: canProceedFromLookup ? '#bbf7d0' : '#fde68a',
                  }}
                >
                  {!lookup.found && (
                    <div className="flex items-start gap-3">
                      <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                      <div className="text-sm">
                        <p className="font-medium text-amber-900">Vehicle not found</p>
                        <p className="text-amber-800 mt-0.5">
                          This vehicle isn't registered in Motiifix. To service it now, create a{' '}
                          <strong>Walk-In Work Order</strong> instead, which can also invite the owner to register.
                        </p>
                      </div>
                    </div>
                  )}

                  {lookup.found && lookup.owner_type === 'none' && (
                    <div className="flex items-start gap-3">
                      <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                      <div className="text-sm">
                        <p className="font-medium text-amber-900">Vehicle exists but has no registered owner</p>
                        <p className="text-amber-800 mt-0.5">
                          A booking requires a registered customer account. Use{' '}
                          <strong>New Walk-In Work Order</strong> instead.
                        </p>
                      </div>
                    </div>
                  )}

                  {lookup.found && lookup.owner_type === 'company' && (
                    <div className="flex items-start gap-3">
                      <Building2 className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                      <div className="text-sm">
                        <p className="font-medium text-amber-900">Company-owned vehicle</p>
                        <p className="text-amber-800 mt-0.5">
                          This vehicle belongs to <strong>{lookup.owner?.name || 'a fleet'}</strong>. Bookings for
                          fleet vehicles must be made by the company. Please contact the fleet manager.
                        </p>
                      </div>
                    </div>
                  )}

                  {canProceedFromLookup && (
                    <>
                      <div className="flex items-start gap-3">
                        <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
                        <div className="text-sm">
                          <p className="font-medium text-green-900">Customer found</p>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 mt-1">
                        <div className="bg-white rounded p-3 border border-green-100">
                          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                            <Car size={12} /> Vehicle
                          </p>
                          <p className="text-sm font-semibold text-gray-900">
                            {lookup.vehicle.plate_number}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {[lookup.vehicle.make, lookup.vehicle.model, lookup.vehicle.year_of_manufacture]
                              .filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="bg-white rounded p-3 border border-green-100">
                          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                            <User size={12} /> Customer
                          </p>
                          <p className="text-sm font-semibold text-gray-900">{customerName}</p>
                          {lookup.owner.phone && (
                            <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                              <Phone size={10} /> {lookup.owner.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════════ STEP 1 — DETAILS ════════════════ */}
          {step === 1 && !successData && lookup && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 text-sm">
                <Car className="text-gray-400" size={16} />
                <span className="font-medium text-gray-900">{lookup.vehicle.plate_number}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">{customerName}</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Start time
                  </label>
                  <input type="time" value={bookingTime}
                    onChange={e => setBookingTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    End time
                  </label>
                  <input type="time" value={bookingEndTime}
                    onChange={e => setBookingEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              {shops.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <MapPin size={12} /> Shop (optional)
                  </label>
                  <select value={shopId} onChange={e => setShopId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                    <option value="">— No specific shop —</option>
                    {shops.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.town ? ` · ${s.town}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {services.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                    <ClipboardList size={12} /> Services (optional)
                  </label>
                  <div className="border border-gray-200 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                    {services.map(s => {
                      const checked = selectedServices.includes(s.id)
                      return (
                        <label key={s.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                          <input type="checkbox" checked={checked}
                            onChange={() => setSelectedServices(prev =>
                              checked ? prev.filter(id => id !== s.id) : [...prev, s.id]
                            )}
                            className="w-3.5 h-3.5 rounded text-green-600 focus:ring-green-500" />
                          <span className="text-sm text-gray-700">{s.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Problem description (optional)
                </label>
                <textarea value={problemDesc} onChange={e => setProblemDesc(e.target.value)}
                  rows={2}
                  placeholder="What's the issue?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Special instructions (optional)
                </label>
                <textarea value={specialInstr} onChange={e => setSpecialInstr(e.target.value)}
                  rows={2}
                  placeholder="Anything else?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
          )}

          {/* ════════════════ STEP 2 — CONFIRM ════════════════ */}
          {step === 2 && !successData && lookup && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={16} />
                <p className="text-sm text-blue-900">
                  The booking will be created in <strong>confirmed</strong> status (since you, the provider,
                  are creating it). The customer will receive an email and SMS notification.
                </p>
              </div>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                <Row label="Customer" value={customerName} />
                <Row label="Contact"  value={[lookup.owner.phone].filter(Boolean).join(' · ') || '—'} />
                <Row label="Vehicle"  value={`${lookup.vehicle.plate_number}${
                  lookup.vehicle.make ? ` · ${lookup.vehicle.make} ${lookup.vehicle.model || ''}` : ''
                }`} />
                <Row label="Date"     value={fmtDate(selectedDate)} />
                <Row label="Time"     value={`${bookingTime} – ${bookingEndTime}`} />
                {shopId && (
                  <Row label="Shop"   value={shops.find(s => s.id === shopId)?.name || '—'} />
                )}
                {selectedServices.length > 0 && (
                  <Row
                    label="Services"
                    value={selectedServices
                      .map(id => services.find(s => s.id === id)?.name)
                      .filter(Boolean).join(', ')}
                  />
                )}
                {problemDesc && <Row label="Problem" value={problemDesc} />}
                {specialInstr && <Row label="Notes"   value={specialInstr} />}
              </div>
            </div>
          )}

          {/* ════════════════ SUCCESS ════════════════ */}
          {successData && (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="text-green-600" size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Booking Created</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Booking <span className="font-semibold text-gray-800">{successData.bookingNumber}</span>{' '}
                  is confirmed for {customerName} on {fmtDate(selectedDate)} at {bookingTime}.
                </p>
              </div>
              <div className="text-xs text-gray-500 flex items-center justify-center gap-4">
                <span className="flex items-center gap-1">
                  <Mail size={12} className={successData.emailDispatched ? 'text-green-600' : 'text-gray-400'} />
                  {successData.emailDispatched ? 'Email sent' : 'No email'}
                </span>
                <span className="flex items-center gap-1">
                  <Phone size={12} className={successData.smsDispatched ? 'text-green-600' : 'text-gray-400'} />
                  {successData.smsDispatched ? 'SMS sent' : 'No SMS'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer / actions */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          {successData ? (
            <>
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900">
                Close
              </button>
              <button
                onClick={() => onOpenBooking?.(successData.bookingId)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2"
              >
                Open Booking <ChevronRight size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => step === 0 ? onClose() : setStep(step - 1)}
                disabled={saving}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 flex items-center gap-1"
              >
                {step === 0 ? <>Cancel</> : <><ArrowLeft size={14} /> Back</>}
              </button>

              {step === 0 && (
                <button
                  onClick={() => { setError(''); setStep(1) }}
                  disabled={!canProceedFromLookup}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700
                             disabled:opacity-50 text-sm font-medium flex items-center gap-1"
                >
                  Continue <ChevronRight size={14} />
                </button>
              )}

              {step === 1 && (
                <button
                  onClick={() => { setError(''); setStep(2) }}
                  disabled={!bookingTime || !bookingEndTime || bookingEndTime <= bookingTime}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700
                             disabled:opacity-50 text-sm font-medium flex items-center gap-1"
                >
                  Review <ChevronRight size={14} />
                </button>
              )}

              {step === 2 && (
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700
                             disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                >
                  {saving
                    ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
                    : <><CheckCircle size={14} /> Create Booking</>
                  }
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── small helper row component for the confirm step ───────────────────────
function Row({ label, value }) {
  return (
    <div className="px-4 py-2.5 flex items-start gap-3 text-sm">
      <span className="text-gray-500 w-24 flex-shrink-0">{label}</span>
      <span className="text-gray-900 font-medium break-words">{value}</span>
    </div>
  )
}