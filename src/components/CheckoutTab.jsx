'use client'

/**
 * CheckoutTab
 * Two-step checkout: Road Test → Vehicle Handover.
 * Persists results to work_order_checkouts table.
 * After confirmation the checklists remain visible as read-only.
 *
 * Props:
 *   workOrder      — full work order object
 *   canCheckout    — boolean (SP owner / admin / mechanic with can_approve_work)
 *   onStatusChange — callback(statusCode) after successful confirm
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Car, CheckCircle, AlertCircle, Loader2, ClipboardCheck,
  Gauge, ChevronRight, BadgeCheck, X, Wrench
} from 'lucide-react'

const CHECKOUT_ROAD_TEST_ITEMS = [
  { id: 'rt_engine_smooth',       label: 'Engine runs smoothly'                    },
  { id: 'rt_no_unusual_noise',    label: 'No unusual noises during drive'          },
  { id: 'rt_brakes_responsive',   label: 'Brakes responsive and not pulling'       },
  { id: 'rt_steering_ok',         label: 'Steering straight and responsive'        },
  { id: 'rt_no_warning_lights',   label: 'No warning lights on dashboard'          },
  { id: 'rt_transmission_smooth', label: 'Transmission shifts smoothly'            },
  { id: 'rt_ac_heater_ok',        label: 'A/C and heating working (if applicable)' },
  { id: 'rt_all_electrics_ok',    label: 'All electrical systems functioning'      },
]

const CHECKOUT_HANDOVER_ITEMS = [
  { id: 'co_vehicle_clean',      label: 'Vehicle returned clean'                   },
  { id: 'co_personal_items_ok',  label: 'Customer personal items in place'         },
  { id: 'co_fuel_level_noted',   label: 'Fuel level noted and communicated'        },
  { id: 'co_docs_handed_over',   label: 'Service documents handed to customer'     },
  { id: 'co_customer_notified',  label: 'Customer notified vehicle is ready'       },
  { id: 'co_payment_confirmed',  label: 'Payment confirmed / invoice settled'      },
]

function checkoutFmtD(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Shared checklist panel (interactive or read-only) ─────────────────────────
function ChecklistPanel({ title, icon: Icon, color, items, values, onChange, readonly }) {
  const done  = items.filter(i => values[i.id]).length
  const total = items.length
  const pct   = Math.round((done / total) * 100)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
        <Icon size={16} className={color} />
        <p className="font-semibold text-gray-900 text-sm">{title}</p>
        <span className="ml-auto text-xs text-gray-500">{done}/{total}</span>
      </div>
      <div className="px-5 py-4 space-y-2">
        {items.map(item => {
          const checked = !!values[item.id]
          return (
            <label key={item.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                checked ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
              } ${readonly ? 'cursor-default' : 'cursor-pointer hover:border-gray-300'}`}>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                checked ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 bg-white'
              }`}>
                {checked && <CheckCircle size={12} className="text-white" />}
              </div>
              {!readonly && (
                <input type="checkbox" className="sr-only"
                  checked={checked}
                  onChange={() => onChange?.(item.id)} />
              )}
              <span className={`text-sm ${checked ? 'text-emerald-800 font-medium' : 'text-gray-700'}`}>
                {item.label}
              </span>
            </label>
          )
        })}
        <div className="pt-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span><span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CheckoutTab({ workOrder, canCheckout = false, onStatusChange }) {
  const supabase = createClient()

  const defaultRoadTest  = Object.fromEntries(CHECKOUT_ROAD_TEST_ITEMS.map(i => [i.id, false]))
  const defaultHandover  = Object.fromEntries(CHECKOUT_HANDOVER_ITEMS.map(i  => [i.id, false]))

  const [roadTest,       setRoadTest]       = useState(defaultRoadTest)
  const [handover,       setHandover]       = useState(defaultHandover)
  const [finalMileage,   setFinalMileage]   = useState(workOrder.final_mileage?.toString() || '')
  const [testNotes,      setTestNotes]      = useState('')
  const [checkoutNotes,  setCheckoutNotes]  = useState('')
  const [activeSection,  setActiveSection]  = useState('road_test')
  const [checkoutRecord, setCheckoutRecord] = useState(null)  // row from work_order_checkouts
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState('')

  const statusCode  = workOrder.status?.code
  const isCheckedOut = statusCode === 'closed' || !!(workOrder.vehicle_checked_out_at && checkoutRecord?.customer_acceptance_status === 'accepted')
  const isSubmitted  = !!(checkoutRecord?.confirmed_at)  // provider submitted, awaiting customer
  const isDeclined   = checkoutRecord?.customer_acceptance_status === 'declined'
  const isLocked     = isSubmitted && !isDeclined  // lock checklists unless customer declined
  const isCompleted  = ['completed', 'closed', 'awaiting_customer_checkout'].includes(statusCode)

  // ── Load existing checkout record ─────────────────────────────────────────
  const loadCheckout = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('work_order_checkouts')
        .select('*')
        .eq('work_order_id', workOrder.id)
        .maybeSingle()

      if (data) {
        setCheckoutRecord(data)
        // Pre-fill checklist states from DB
        const rt = {}
        CHECKOUT_ROAD_TEST_ITEMS.forEach(i => { rt[i.id] = !!data[i.id] })
        setRoadTest(rt)

        const co = {}
        CHECKOUT_HANDOVER_ITEMS.forEach(i => { co[i.id] = !!data[i.id] })
        setHandover(co)

        if (data.final_mileage)   setFinalMileage(data.final_mileage.toString())
        if (data.road_test_notes) setTestNotes(data.road_test_notes)
        if (data.checkout_notes)  setCheckoutNotes(data.checkout_notes)
      }
    } catch (e) {
      console.error('CheckoutTab loadCheckout:', e.message)
    } finally {
      setLoading(false)
    }
  }, [workOrder.id])

  useEffect(() => { loadCheckout() }, [loadCheckout])

  const roadTestAll  = CHECKOUT_ROAD_TEST_ITEMS.every(i => roadTest[i.id])
  const handoverAll  = CHECKOUT_HANDOVER_ITEMS.every(i => handover[i.id])
  const roadTestDone = CHECKOUT_ROAD_TEST_ITEMS.filter(i => roadTest[i.id]).length
  const handoverDone = CHECKOUT_HANDOVER_ITEMS.filter(i => handover[i.id]).length

  // ── Save checklist progress via RPC (auto-save on each toggle) ─────────────
  const saveProgress = async (rt, co) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.rpc('save_checkout_progress', {
        p_work_order_id:           workOrder.id,
        p_caller_auth_uid:         user.id,
        p_rt_engine_smooth:        rt.rt_engine_smooth,
        p_rt_no_unusual_noise:     rt.rt_no_unusual_noise,
        p_rt_brakes_responsive:    rt.rt_brakes_responsive,
        p_rt_steering_ok:          rt.rt_steering_ok,
        p_rt_no_warning_lights:    rt.rt_no_warning_lights,
        p_rt_transmission_smooth:  rt.rt_transmission_smooth,
        p_rt_ac_heater_ok:         rt.rt_ac_heater_ok,
        p_rt_all_electrics_ok:     rt.rt_all_electrics_ok,
        p_road_test_notes:         testNotes     || null,
        p_co_vehicle_clean:        co.co_vehicle_clean,
        p_co_personal_items_ok:    co.co_personal_items_ok,
        p_co_fuel_level_noted:     co.co_fuel_level_noted,
        p_co_docs_handed_over:     co.co_docs_handed_over,
        p_co_customer_notified:    co.co_customer_notified,
        p_co_payment_confirmed:    co.co_payment_confirmed,
        p_checkout_notes:          checkoutNotes || null,
        p_final_mileage:           finalMileage  ? parseInt(finalMileage) : null,
      })
    } catch (e) {
      console.error('CheckoutTab saveProgress:', e.message)
    }
  }

  const handleRoadTestToggle = (id) => {
    const updated = { ...roadTest, [id]: !roadTest[id] }
    setRoadTest(updated)
    saveProgress(updated, handover)
  }

  const handleHandoverToggle = (id) => {
    const updated = { ...handover, [id]: !handover[id] }
    setHandover(updated)
    saveProgress(roadTest, updated)
  }

  // ── Confirm checkout via RPC (atomic: checkout record + close WO + history) ──
  const handleCheckout = async () => {
    if (!roadTestAll) { setError('Complete all road-test items to proceed.'); return }
    if (!handoverAll) { setError('Complete all checkout items before confirming.'); return }
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('confirm_checkout', {
        p_work_order_id:           workOrder.id,
        p_caller_auth_uid:         user.id,
        p_rt_engine_smooth:        roadTest.rt_engine_smooth,
        p_rt_no_unusual_noise:     roadTest.rt_no_unusual_noise,
        p_rt_brakes_responsive:    roadTest.rt_brakes_responsive,
        p_rt_steering_ok:          roadTest.rt_steering_ok,
        p_rt_no_warning_lights:    roadTest.rt_no_warning_lights,
        p_rt_transmission_smooth:  roadTest.rt_transmission_smooth,
        p_rt_ac_heater_ok:         roadTest.rt_ac_heater_ok,
        p_rt_all_electrics_ok:     roadTest.rt_all_electrics_ok,
        p_road_test_notes:         testNotes     || null,
        p_co_vehicle_clean:        handover.co_vehicle_clean,
        p_co_personal_items_ok:    handover.co_personal_items_ok,
        p_co_fuel_level_noted:     handover.co_fuel_level_noted,
        p_co_docs_handed_over:     handover.co_docs_handed_over,
        p_co_customer_notified:    handover.co_customer_notified,
        p_co_payment_confirmed:    handover.co_payment_confirmed,
        p_checkout_notes:          checkoutNotes || null,
        p_final_mileage:           finalMileage  ? parseInt(finalMileage) : null,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)

      // Fire email + SMS notification to car owner (non-blocking)
      fetch(`/api/work-orders/${workOrder.id}/checkout-notify`, { method: 'POST' })
        .catch(e => console.warn('[checkout-notify]', e.message))

      setSuccess('Checkout submitted. The customer will be notified to confirm.')
      await loadCheckout()
      onStatusChange?.('awaiting_customer_checkout')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Guard states ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center items-center h-32">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  if (!isCompleted) return (
    <div className="text-center py-12 text-gray-400">
      <Wrench size={40} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium text-gray-600">Not ready for checkout</p>
      <p className="text-xs mt-1">
        Available after the work order reaches <strong>Completed</strong> status.
      </p>
      <p className="text-xs mt-1 text-gray-400">
        Current: <span className="font-medium">{workOrder.status?.display_name}</span>
      </p>
    </div>
  )

  if (!canCheckout && !isCheckedOut) return (
    <div className="text-center py-12 text-gray-400">
      <Car size={40} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium text-gray-600">Approval permission required</p>
      <p className="text-xs mt-1 text-gray-400">
        Only provider owners, admins, or mechanics with approval access can perform checkout.
      </p>
    </div>
  )

  return (
    <div className="space-y-4">

      {/* ── Vehicle Checked Out card ── always shown once confirmed ── */}
      {isCheckedOut && (
        <div className="rounded-2xl overflow-hidden border border-emerald-200">
          <div className="bg-emerald-600 px-5 py-3 flex items-center gap-2">
            <BadgeCheck className="text-white" size={18} />
            <span className="text-white font-bold text-sm">Vehicle Checked Out</span>
          </div>
          <div className="px-5 py-4 bg-emerald-50 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-emerald-700 font-semibold mb-0.5">Checkout Time</p>
              <p className="font-semibold text-gray-900">
                {checkoutFmtD(workOrder.vehicle_checked_out_at)}
              </p>
            </div>
            {checkoutRecord?.final_mileage && (
              <div>
                <p className="text-xs text-emerald-700 font-semibold mb-0.5">Final Mileage</p>
                <p className="font-semibold text-gray-900">
                  {Number(checkoutRecord.final_mileage).toLocaleString('en-KE')} km
                </p>
              </div>
            )}
            {workOrder.initial_mileage && checkoutRecord?.final_mileage && (
              <div>
                <p className="text-xs text-emerald-700 font-semibold mb-0.5">Distance During Service</p>
                <p className="font-semibold text-gray-900">
                  {(checkoutRecord.final_mileage - workOrder.initial_mileage).toLocaleString('en-KE')} km
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-emerald-700 font-semibold mb-0.5">Status</p>
              <p className="font-semibold text-gray-900">{workOrder.status?.display_name}</p>
            </div>
            {checkoutRecord?.road_test_notes && (
              <div className="col-span-2">
                <p className="text-xs text-emerald-700 font-semibold mb-0.5">Road Test Notes</p>
                <p className="text-sm text-gray-700">{checkoutRecord.road_test_notes}</p>
              </div>
            )}
            {checkoutRecord?.checkout_notes && (
              <div className="col-span-2">
                <p className="text-xs text-emerald-700 font-semibold mb-0.5">Checkout Notes</p>
                <p className="text-sm text-gray-700">{checkoutRecord.checkout_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success alert */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
          <CheckCircle className="text-green-600 flex-shrink-0" size={18} />
          <p className="text-green-800 text-sm font-medium">{success}</p>
        </div>
      )}

      {/* ── Road Test checklist — always visible after completion ── */}
      <ChecklistPanel
        title="Road Test Checklist"
        icon={Car}
        color="text-blue-600"
        items={CHECKOUT_ROAD_TEST_ITEMS}
        values={roadTest}
        onChange={(!isLocked && !isCheckedOut) ? handleRoadTestToggle : undefined}
        readonly={isLocked || isCheckedOut}
      />

      {/* ── Handover checklist — always visible after completion ── */}
      <ChecklistPanel
        title="Vehicle Handover"
        icon={ClipboardCheck}
        color="text-emerald-600"
        items={CHECKOUT_HANDOVER_ITEMS}
        values={handover}
        onChange={(!isLocked && !isCheckedOut) ? handleHandoverToggle : undefined}
        readonly={isLocked || isCheckedOut}
      />

      {/* ── Locked notice when submitted and awaiting customer ── */}
      {isSubmitted && !isDeclined && !isCheckedOut && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Awaiting Customer Confirmation</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Checkout submitted on {checkoutFmtD(checkoutRecord?.confirmed_at)}.
              The checklists are locked until the customer accepts or declines.
            </p>
          </div>
        </div>
      )}

      {/* ── Declined notice ── */}
      {isDeclined && !isCheckedOut && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <p className="text-sm font-semibold text-red-900 flex items-center gap-2">
            <XCircle size={16} className="text-red-600" /> Customer Declined Checkout
          </p>
          {checkoutRecord?.customer_acceptance_notes && (
            <p className="text-xs text-red-700 mt-1">
              Reason: {checkoutRecord.customer_acceptance_notes}
            </p>
          )}
          <p className="text-xs text-red-600 mt-2">
            Please review the checklist items and resubmit.
          </p>
        </div>
      )}

      {/* ── Interactive flow (only when not locked and not yet accepted) ── */}
      {!isLocked && !isCheckedOut && canCheckout && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            <button onClick={() => setActiveSection('road_test')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeSection === 'road_test'
                  ? 'bg-gray-900 text-white'
                  : roadTestAll ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
              {roadTestAll
                ? <CheckCircle size={13} />
                : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">1</span>
              }
              Road Test ({roadTestDone}/{CHECKOUT_ROAD_TEST_ITEMS.length})
            </button>
            <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
            <button onClick={() => { if (roadTestAll) setActiveSection('checkout') }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeSection === 'checkout'
                  ? 'bg-gray-900 text-white'
                  : handoverAll ? 'bg-emerald-100 text-emerald-700'
                  : roadTestAll ? 'bg-gray-100 text-gray-600' : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}>
              {handoverAll
                ? <CheckCircle size={13} />
                : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[10px]">2</span>
              }
              Checkout ({handoverDone}/{CHECKOUT_HANDOVER_ITEMS.length})
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={14} />
              <p className="text-red-700 flex-1">{error}</p>
              <button onClick={() => setError('')}><X size={14} className="text-red-400" /></button>
            </div>
          )}

          {/* Road test notes + proceed */}
          {activeSection === 'road_test' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Test Notes (optional)
                </label>
                <textarea value={testNotes} onChange={e => setTestNotes(e.target.value)}
                  placeholder="Any observations during the road test..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-gray-400" />
              </div>
              <button
                onClick={() => {
                  if (!roadTestAll) { setError('Complete all road-test items to proceed.'); return }
                  setError(''); setActiveSection('checkout')
                }}
                disabled={!roadTestAll}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors">
                <ChevronRight size={16} /> Proceed to Checkout
              </button>
            </>
          )}

          {/* Checkout details + confirm */}
          {activeSection === 'checkout' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Final Mileage (km) — optional
                  </label>
                  <div className="relative">
                    <Gauge size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="number" value={finalMileage}
                      onChange={e => setFinalMileage(e.target.value)}
                      placeholder={workOrder.initial_mileage
                        ? `Started at ${Number(workOrder.initial_mileage).toLocaleString('en-KE')} km`
                        : 'Odometer reading'}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Checkout Notes (optional)
                  </label>
                  <input type="text" value={checkoutNotes} onChange={e => setCheckoutNotes(e.target.value)}
                    placeholder="Any handover notes..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400" />
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setError(''); setActiveSection('road_test') }}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">
                  ← Back
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={saving || !handoverAll}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                  {saving
                    ? <Loader2 size={16} className="animate-spin" />
                    : <BadgeCheck size={16} />
                  }
                  {saving ? 'Processing…' : 'Confirm Checkout & Close Work Order'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}