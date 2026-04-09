'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Car, MapPin, User, Calendar, Clock,
  ClipboardList, AlertCircle, CheckCircle, ChevronRight,
  Wrench, Package, FileText, MessageSquare, Hash,
  ExternalLink, Edit3
} from 'lucide-react'

const STATUS_COLORS = {
  intake:            { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-400'    },
  assigned:          { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  diagnosing:        { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500'  },
  awaiting_approval: { bg: 'bg-yellow-100',  text: 'text-yellow-700',  dot: 'bg-yellow-500'  },
  approved:          { bg: 'bg-cyan-100',    text: 'text-cyan-700',    dot: 'bg-cyan-500'    },
  in_progress:       { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  quality_check:     { bg: 'bg-indigo-100',  text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
  rework:            { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  completed:         { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500'   },
  cancelled:         { bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400'     },
  closed:            { bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-300'    },
}

const TIMELINE_STATUSES = [
  'intake', 'assigned', 'diagnosing', 'awaiting_approval',
  'approved', 'in_progress', 'quality_check', 'completed', 'closed'
]

// Status progression: what the mechanic/provider can move to from each status
const NEXT_STATUS_MAP = {
  intake:            [{ code: 'assigned',   label: 'Assign Mechanic',     color: 'blue'   }],
  assigned:          [{ code: 'diagnosing', label: 'Begin Diagnostics',   color: 'purple' }],
  diagnosing:        [{ code: 'awaiting_approval', label: 'Send Estimate for Approval', color: 'yellow' }],
  approved:          [{ code: 'in_progress',       label: 'Start Service',              color: 'orange' }],
  in_progress:       [{ code: 'quality_check',     label: 'Submit for QC',              color: 'indigo' }],
  quality_check:     [
    { code: 'completed', label: 'QC Passed — Complete', color: 'green' },
    { code: 'rework',    label: 'QC Failed — Rework',   color: 'red'   },
  ],
  rework:            [{ code: 'quality_check', label: 'Resubmit for QC', color: 'indigo' }],
  completed:         [{ code: 'closed', label: 'Close Work Order', color: 'gray' }],
}

const BTN_COLOR_MAP = {
  blue:   'bg-blue-600 hover:bg-blue-700',
  purple: 'bg-purple-600 hover:bg-purple-700',
  yellow: 'bg-yellow-500 hover:bg-yellow-600',
  orange: 'bg-orange-500 hover:bg-orange-600',
  indigo: 'bg-indigo-600 hover:bg-indigo-700',
  green:  'bg-green-600 hover:bg-green-700',
  red:    'bg-red-600 hover:bg-red-700',
  gray:   'bg-gray-600 hover:bg-gray-700',
}

export default function WorkOrderDetailPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [wo, setWo]                   = useState(null)
  const [mechanics, setMechanics]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [updating, setUpdating]       = useState(false)
  const [error, setError]             = useState('')
  const [successMsg, setSuccessMsg]   = useState('')
  const [checkinMileage, setCheckinMileage] = useState('')
  const [showCheckin, setShowCheckin] = useState(false)
  const [selectedMechanic, setSelectedMechanic] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [savingNote, setSavingNote]   = useState(false)

  const loadWorkOrder = useCallback(async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()

      // Use RPC to get full details (handles access check server-side)
      const { data: result, error: rpcErr } = await supabase.rpc(
        'get_work_order_with_details',
        { p_work_order_id: params.id, p_requesting_user_id: user.id }
      )

      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)

      setWo(result.data)
    } catch (err) {
      // Fallback: direct query (in case function not deployed yet)
      try {
        const { data, error: fetchErr } = await supabase
          .from('work_orders')
          .select(`
            *,
            status:work_order_statuses(code, display_name, sort_order),
            vehicle:vehicles(plate_number, make, model, year_of_manufacture, color, vin),
            service_provider:service_providers(name),
            shop:shops(name, town, county, street, phone),
            mechanic:mechanics(
              id,
              specialization,
              user:user_profiles(first_name, last_name, phone)
            ),
            booking:bookings(booking_number, customer_user_id,
              customer:user_profiles!customer_user_id(first_name, last_name, phone, email)
            )
          `)
          .eq('id', params.id)
          .single()

        if (fetchErr) throw fetchErr
        setWo(data)
      } catch (fallbackErr) {
        setError(fallbackErr.message || 'Failed to load work order')
      }
    } finally {
      setLoading(false)
    }
  }, [params.id])

  const loadMechanics = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { data: provider } = await supabase
        .from('service_providers').select('id').eq('owner_user_id', profile.id).single()
      if (!provider) return

      const { data } = await supabase
        .from('mechanics')
        .select('id, specialization, user:user_profiles(first_name, last_name)')
        .eq('service_provider_id', provider.id)
        .eq('is_active', true)

      setMechanics(data || [])
    } catch {}
  }, [])

  useEffect(() => {
    if (params.id) {
      loadWorkOrder()
      loadMechanics()
    }
  }, [params.id, loadWorkOrder, loadMechanics])

  // ── Check-in vehicle (record mileage + timestamp) ────────────────────────
  const handleCheckIn = async () => {
    if (!checkinMileage || isNaN(Number(checkinMileage))) {
      setError('Please enter a valid mileage reading')
      return
    }
    setUpdating(true)
    setError('')
    try {
      const { error: upErr } = await supabase
        .from('work_orders')
        .update({
          initial_mileage:        parseInt(checkinMileage),
          vehicle_checked_in_at:  new Date().toISOString(),
          updated_at:             new Date().toISOString()
        })
        .eq('id', params.id)

      if (upErr) throw upErr
      setShowCheckin(false)
      setSuccessMsg('Vehicle checked in successfully')
      await loadWorkOrder()
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  // ── Advance work order status ────────────────────────────────────────────
  const advanceStatus = async (newStatusCode) => {
    if (!confirm(`Move work order to "${newStatusCode.replace(/_/g, ' ')}"?`)) return
    setUpdating(true)
    setError('')
    try {
      const { data: newStatus } = await supabase
        .from('work_order_statuses').select('id').eq('code', newStatusCode).single()
      if (!newStatus) throw new Error('Status not found: ' + newStatusCode)

      const patch = { status_id: newStatus.id, updated_at: new Date().toISOString() }
      if (newStatusCode === 'closed') patch.closed_at = new Date().toISOString()

      const { error: upErr } = await supabase
        .from('work_orders').update(patch).eq('id', params.id)
      if (upErr) throw upErr

      setSuccessMsg(`Status updated to ${newStatusCode.replace(/_/g, ' ')}`)
      await loadWorkOrder()
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  // ── Assign mechanic ──────────────────────────────────────────────────────
  const assignMechanic = async () => {
    if (!selectedMechanic) { setError('Please select a mechanic'); return }
    setUpdating(true)
    setError('')
    try {
      const { error: upErr } = await supabase
        .from('work_orders')
        .update({
          assigned_mechanic_id: selectedMechanic,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.id)
      if (upErr) throw upErr
      setSuccessMsg('Mechanic assigned')
      await loadWorkOrder()
    } catch (err) {
      setError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  // ── Save internal note ───────────────────────────────────────────────────
  const saveInternalNote = async () => {
    if (!internalNote.trim()) return
    setSavingNote(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      await supabase.from('comments').insert({
        work_order_id:  params.id,
        author_user_id: profile.id,
        comment_type:   'internal_note',
        content:        internalNote
      })
      setInternalNote('')
      setSuccessMsg('Note saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingNote(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
    </div>
  )

  if (!wo) return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft size={20} className="mr-2" /> Back
      </button>
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
        <AlertCircle className="mx-auto text-red-600 mb-4" size={48} />
        <h2 className="text-xl font-semibold text-red-900 mb-2">Work Order Not Found</h2>
        <p className="text-red-700 mb-4">{error || 'Could not load work order'}</p>
        <button onClick={() => router.push('/provider/work-orders')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          All Work Orders
        </button>
      </div>
    </div>
  )

  const statusCode    = wo.status?.code || wo.status_id
  const statusStyle   = STATUS_COLORS[statusCode] || STATUS_COLORS.intake
  const nextActions   = NEXT_STATUS_MAP[statusCode] || []
  const currentStep   = TIMELINE_STATUSES.indexOf(statusCode)

  // Resolve nested data — handles both RPC (jsonb) and direct query shapes
  const vehicle        = wo.vehicle       || {}
  const booking        = wo.booking       || {}
  const customer       = booking.customer || {}
  const shop           = wo.shop          || {}
  const mechanic       = wo.mechanic      || {}
  const mechanicUser   = mechanic.user || wo.mechanic_profile || {}

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/provider/work-orders')}
          className="flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft size={20} className="mr-1" /> Work Orders
        </button>
        {booking.booking_number && (
          <>
            <ChevronRight size={16} className="text-gray-400" />
            <button
              onClick={() => router.push(`/provider/bookings/${wo.booking_id}`)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
            >
              Booking #{booking.booking_number} <ExternalLink size={12} />
            </button>
          </>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-green-700 text-sm">{successMsg}</p>
        </div>
      )}

      {/* Title + status */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {wo.work_order_number || 'WO-' + wo.id.slice(0, 8).toUpperCase()}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                {wo.status?.display_name || statusCode}
              </span>
              {wo.priority === 'urgent' && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">URGENT</span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              Opened {new Date(wo.opened_at || wo.created_at).toLocaleDateString('en-KE', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
              })}
              {wo.scheduled_start && (
                <> · Scheduled {new Date(wo.scheduled_start).toLocaleDateString('en-KE', {
                  weekday: 'short', day: 'numeric', month: 'short'
                })}</>
              )}
            </p>
          </div>
        </div>

        {/* Status timeline */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {TIMELINE_STATUSES.map((s, idx) => {
              const isPast    = idx < currentStep
              const isCurrent = idx === currentStep
              const style     = STATUS_COLORS[s] || STATUS_COLORS.intake
              return (
                <div key={s} className="flex items-center gap-1 flex-shrink-0">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    isCurrent
                      ? `${style.bg} ${style.text} ring-2 ring-offset-1 ring-current`
                      : isPast
                        ? 'bg-green-50 text-green-600'
                        : 'bg-gray-50 text-gray-400'
                  }`}>
                    {isPast && <CheckCircle size={10} />}
                    <span>{s.replace(/_/g, ' ')}</span>
                  </div>
                  {idx < TIMELINE_STATUSES.length - 1 && (
                    <div className={`h-px w-3 flex-shrink-0 ${isPast ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Next actions */}
      {(nextActions.length > 0 || !wo.vehicle_checked_in_at) && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">

            {/* Vehicle check-in — always shown until checked in */}
            {!wo.vehicle_checked_in_at && (
              <>
                {!showCheckin ? (
                  <button
                    onClick={() => setShowCheckin(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    <Car size={16} /> Check In Vehicle
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={checkinMileage}
                      onChange={(e) => setCheckinMileage(e.target.value)}
                      placeholder="Current mileage (km)"
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm w-48"
                    />
                    <button
                      onClick={handleCheckIn}
                      disabled={updating}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {updating ? 'Saving...' : 'Confirm Check-in'}
                    </button>
                    <button
                      onClick={() => setShowCheckin(false)}
                      className="px-3 py-2 text-gray-600 hover:text-gray-900 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Assign mechanic (if none assigned and in intake/assigned) */}
            {!wo.assigned_mechanic_id && ['intake', 'assigned'].includes(statusCode) && mechanics.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedMechanic}
                  onChange={(e) => setSelectedMechanic(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                >
                  <option value="">Select mechanic...</option>
                  {mechanics.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.user?.first_name} {m.user?.last_name}
                      {m.specialization ? ` (${m.specialization})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={assignMechanic}
                  disabled={updating || !selectedMechanic}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                >
                  Assign
                </button>
              </div>
            )}

            {/* Status advancement buttons */}
            {nextActions.map(action => (
              <button
                key={action.code}
                onClick={() => advanceStatus(action.code)}
                disabled={updating}
                className={`flex items-center gap-2 px-4 py-2.5 text-white rounded-lg disabled:opacity-50 text-sm font-medium ${BTN_COLOR_MAP[action.color] || 'bg-gray-600 hover:bg-gray-700'}`}
              >
                {updating
                  ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  : null
                }
                {action.label}
              </button>
            ))}

            {/* Coming soon links for later phases */}
            {['diagnosing', 'approved', 'in_progress'].includes(statusCode) && (
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Wrench size={12} /> Services (Phase 2)
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Package size={12} /> Parts (Phase 2)
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <FileText size={12} /> Invoice (Phase 5)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Vehicle */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Car size={18} className="text-gray-500" /> Vehicle
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Plate</p>
              <p className="font-semibold text-gray-900">{vehicle.plate_number || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Details</p>
              <p className="text-gray-700">
                {[vehicle.make, vehicle.model, vehicle.year_of_manufacture].filter(Boolean).join(' ')}
              </p>
              {vehicle.color && <p className="text-sm text-gray-500">{vehicle.color}</p>}
            </div>
            {vehicle.vin && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">VIN</p>
                <p className="text-sm text-gray-700 font-mono">{vehicle.vin}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Check-in mileage</p>
                <p className="font-medium text-gray-900">
                  {wo.initial_mileage ? `${wo.initial_mileage.toLocaleString()} km` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Checked in</p>
                <p className="font-medium text-gray-900">
                  {wo.vehicle_checked_in_at
                    ? new Date(wo.vehicle_checked_in_at).toLocaleTimeString('en-KE', {
                        hour: '2-digit', minute: '2-digit'
                      })
                    : <span className="text-amber-600 text-sm">Not yet</span>
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User size={18} className="text-gray-500" /> Customer
          </h2>
          {customer.first_name ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Name</p>
                <p className="font-semibold text-gray-900">
                  {customer.first_name} {customer.last_name}
                </p>
              </div>
              {customer.phone && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                  <p className="text-gray-700">{customer.phone}</p>
                </div>
              )}
              {customer.email && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                  <p className="text-gray-700 text-sm">{customer.email}</p>
                </div>
              )}
              {booking.booking_number && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Linked booking</p>
                  <button
                    onClick={() => router.push(`/provider/bookings/${wo.booking_id}`)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    <Hash size={12} /> {booking.booking_number}
                    <ExternalLink size={11} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No customer data available</p>
          )}
        </div>

        {/* Shop + Mechanic */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin size={18} className="text-gray-500" /> Location &amp; Mechanic
          </h2>
          <div className="space-y-3">
            {shop.name && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Shop</p>
                <p className="font-medium text-gray-900">{shop.name}</p>
                <p className="text-sm text-gray-600">
                  {[shop.town, shop.county].filter(Boolean).join(', ')}
                </p>
                {shop.phone && <p className="text-sm text-gray-500">{shop.phone}</p>}
              </div>
            )}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Assigned mechanic</p>
              {mechanicUser.first_name ? (
                <div>
                  <p className="font-medium text-gray-900">
                    {mechanicUser.first_name} {mechanicUser.last_name}
                  </p>
                  {mechanic.specialization && (
                    <p className="text-sm text-gray-500">{mechanic.specialization}</p>
                  )}
                </div>
              ) : (
                <p className="text-amber-600 text-sm">Not yet assigned</p>
              )}
            </div>
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" /> Schedule
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Scheduled start</p>
              <p className="font-medium text-gray-900">
                {wo.scheduled_start
                  ? new Date(wo.scheduled_start).toLocaleString('en-KE', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : '—'
                }
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Scheduled end</p>
              <p className="font-medium text-gray-900">
                {wo.scheduled_end
                  ? new Date(wo.scheduled_end).toLocaleString('en-KE', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit'
                    })
                  : '—'
                }
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Check-in</p>
                <p className="text-sm font-medium text-gray-900">
                  {wo.vehicle_checked_in_at
                    ? new Date(wo.vehicle_checked_in_at).toLocaleTimeString('en-KE', {
                        hour: '2-digit', minute: '2-digit'
                      })
                    : <span className="text-amber-600">Pending</span>
                  }
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Check-out</p>
                <p className="text-sm font-medium text-gray-900">
                  {wo.vehicle_checked_out_at
                    ? new Date(wo.vehicle_checked_out_at).toLocaleTimeString('en-KE', {
                        hour: '2-digit', minute: '2-digit'
                      })
                    : '—'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Problem description */}
      {wo.problem_description && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ClipboardList size={18} className="text-gray-500" /> Problem Description
          </h2>
          <p className="text-gray-700 text-sm bg-gray-50 p-4 rounded-lg leading-relaxed">
            {wo.problem_description}
          </p>
        </div>
      )}

      {/* Internal notes */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Edit3 size={18} className="text-gray-500" /> Internal Notes
        </h2>
        {wo.internal_notes && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{wo.internal_notes}</p>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Add an internal note (not visible to customer)..."
            rows={3}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm resize-none"
          />
          <button
            onClick={saveInternalNote}
            disabled={savingNote || !internalNote.trim()}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium self-end"
          >
            {savingNote ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Phase placeholders — visible so provider knows what's coming */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Wrench,       label: 'Services',        phase: 2, href: null },
          { icon: Package,      label: 'Parts',           phase: 2, href: null },
          { icon: MessageSquare,label: 'Comments',        phase: 2, href: null },
          { icon: FileText,     label: 'Invoice',         phase: 5, href: null },
        ].map(({ icon: Icon, label, phase }) => (
          <div
            key={label}
            className="bg-white rounded-lg shadow-sm p-4 flex flex-col items-center gap-2 text-center opacity-50"
          >
            <Icon size={22} className="text-gray-400" />
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="text-xs text-gray-400">Phase {phase}</p>
          </div>
        ))}
      </div>
    </div>
  )
}