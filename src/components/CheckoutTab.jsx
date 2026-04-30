'use client'

/**
 * CheckoutTab
 * Records car road-test results and vehicle checkout.
 * Accessible to: provider owner, SPU admin/accountant, mechanic with can_approve_work.
 * Shows in both provider WO page and my-teams WO page.
 *
 * Props:
 *   workOrder   — full work order object (id, status, initial_mileage, vehicle_checked_out_at, ...)
 *   canCheckout — boolean: provider owner / admin / mechanic with can_approve_work
 *   onStatusChange — callback(newStatusCode) after successful checkout
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Car, CheckCircle, AlertCircle, Loader2, ClipboardCheck,
  Gauge, FileText, Clock, ChevronRight, BadgeCheck, X,
  RotateCcw, Wrench
} from 'lucide-react'

// ── Road-test checklist ───────────────────────────────────────────────────────
const CHECKOUT_ROAD_TEST_ITEMS = [
  { id: 'engine_smooth',        label: 'Engine runs smoothly'                     },
  { id: 'no_unusual_noise',     label: 'No unusual noises during drive'           },
  { id: 'brakes_responsive',    label: 'Brakes responsive and not pulling'        },
  { id: 'steering_ok',          label: 'Steering straight and responsive'         },
  { id: 'no_warning_lights',    label: 'No warning lights on dashboard'           },
  { id: 'transmission_smooth',  label: 'Transmission shifts smoothly'             },
  { id: 'ac_heater_ok',         label: 'A/C and heating working (if applicable)'  },
  { id: 'all_electrics_ok',     label: 'All electrical systems functioning'       },
]

// ── Checkout checklist ────────────────────────────────────────────────────────
const CHECKOUT_HANDOVER_ITEMS = [
  { id: 'vehicle_clean',        label: 'Vehicle returned clean'                   },
  { id: 'personal_items_ok',    label: 'Customer personal items in place'         },
  { id: 'fuel_level_noted',     label: 'Fuel level noted and communicated'        },
  { id: 'docs_handed_over',     label: 'Service documents handed to customer'     },
  { id: 'customer_notified',    label: 'Customer notified vehicle is ready'       },
  { id: 'payment_confirmed',    label: 'Payment confirmed / invoice settled'      },
]

function fmtD(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CheckoutTab({ workOrder, canCheckout = false, onStatusChange }) {
  const supabase = createClient()

  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState('')
  const [roadTest,      setRoadTest]      = useState(
    Object.fromEntries(CHECKOUT_ROAD_TEST_ITEMS.map(i => [i.id, false]))
  )
  const [checkout,      setCheckout]      = useState(
    Object.fromEntries(CHECKOUT_HANDOVER_ITEMS.map(i => [i.id, false]))
  )
  const [finalMileage,  setFinalMileage]  = useState(workOrder.final_mileage?.toString() || '')
  const [testNotes,     setTestNotes]     = useState('')
  const [checkoutNotes, setCheckoutNotes] = useState('')
  const [activeSection, setActiveSection] = useState('road_test')  // 'road_test' | 'checkout'

  const statusCode     = workOrder.status?.code
  const isCheckedOut   = !!(workOrder.vehicle_checked_out_at)
  const isPaid         = statusCode === 'closed' || statusCode === 'paid'
  const isCompleted    = ['completed', 'closed'].includes(statusCode)

  const roadTestAll    = CHECKOUT_ROAD_TEST_ITEMS.every(i => roadTest[i.id])
  const checkoutAll    = CHECKOUT_HANDOVER_ITEMS.every(i => checkout[i.id])
  const roadTestCount  = CHECKOUT_ROAD_TEST_ITEMS.filter(i => roadTest[i.id]).length
  const checkoutCount  = CHECKOUT_HANDOVER_ITEMS.filter(i => checkout[i.id]).length

  const handleRoadTestToggle = (id) =>
    setRoadTest(r => ({ ...r, [id]: !r[id] }))

  const handleCheckoutToggle = (id) =>
    setCheckout(c => ({ ...c, [id]: !c[id] }))

  const handleCheckout = async () => {
    if (!roadTestAll) {
      setError('Please complete all road-test items before proceeding to checkout.')
      return
    }
    if (!checkoutAll) {
      setError('Please complete all checkout items before confirming.')
      return
    }
    setSaving(true); setError('')
    try {
      const now   = new Date().toISOString()
      const mileage = finalMileage ? parseInt(finalMileage) : null

      // Build internal notes
      const notes = [
        testNotes    ? `Road-test notes: ${testNotes}`    : null,
        checkoutNotes? `Checkout notes: ${checkoutNotes}` : null,
      ].filter(Boolean).join('\n') || null

      // Update work order: set checked_out_at, final mileage, close status
      const { data: closedStatus } = await supabase
        .from('work_order_statuses').select('id').eq('code', 'closed').maybeSingle()

      const updatePayload = {
        vehicle_checked_out_at: now,
        updated_at:             now,
      }
      if (mileage)          updatePayload.final_mileage = mileage
      if (closedStatus?.id) updatePayload.status_id     = closedStatus.id
      if (notes)            updatePayload.internal_notes = [
        workOrder.internal_notes, notes
      ].filter(Boolean).join('\n---\n')

      const { error: updateErr } = await supabase
        .from('work_orders')
        .update(updatePayload)
        .eq('id', workOrder.id)

      if (updateErr) throw updateErr

      setSuccess('Vehicle checked out successfully. Work order closed.')
      onStatusChange?.('closed')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Already checked out ───────────────────────────────────────────────────
  if (isCheckedOut) return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden">
        <div className="bg-emerald-600 px-5 py-3 flex items-center gap-2">
          <BadgeCheck className="text-white" size={18} />
          <span className="text-white font-bold text-sm">Vehicle Checked Out</span>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-emerald-700 font-semibold mb-0.5">Checkout Time</p>
            <p className="font-semibold text-gray-900">{checkoutFmtD(workOrder.vehicle_checked_out_at)}</p>
          </div>
          {workOrder.final_mileage && (
            <div>
              <p className="text-xs text-emerald-700 font-semibold mb-0.5">Final Mileage</p>
              <p className="font-semibold text-gray-900">
                {Number(workOrder.final_mileage).toLocaleString('en-KE')} km
              </p>
            </div>
          )}
          {workOrder.initial_mileage && workOrder.final_mileage && (
            <div>
              <p className="text-xs text-emerald-700 font-semibold mb-0.5">Distance During Service</p>
              <p className="font-semibold text-gray-900">
                {(workOrder.final_mileage - workOrder.initial_mileage).toLocaleString('en-KE')} km
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-emerald-700 font-semibold mb-0.5">Status</p>
            <p className="font-semibold text-gray-900 capitalize">{workOrder.status?.display_name}</p>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Not yet completed ─────────────────────────────────────────────────────
  if (!isCompleted) return (
    <div className="text-center py-12 text-gray-400">
      <Wrench size={40} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium text-gray-600">Not ready for checkout</p>
      <p className="text-xs mt-1">
        Checkout is available after the work order reaches <strong>Completed</strong> status.
      </p>
      <p className="text-xs mt-1 text-gray-400">
        Current status: <span className="font-medium">{workOrder.status?.display_name}</span>
      </p>
    </div>
  )

  // ── No permission ─────────────────────────────────────────────────────────
  if (!canCheckout) return (
    <div className="text-center py-12 text-gray-400">
      <Car size={40} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium text-gray-600">Checkout requires approval permission</p>
      <p className="text-xs mt-1 text-gray-400">
        Only the provider owner, admins, or mechanics with approval access can perform checkout.
      </p>
    </div>
  )

  // ── Active checkout flow ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Progress stepper */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setActiveSection('road_test')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSection === 'road_test'
              ? 'bg-gray-900 text-white'
              : roadTestAll ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
          }`}>
          {roadTestAll
            ? <CheckCircle size={13} />
            : <span className="w-4 h-4 rounded-full border-2 border-current text-center leading-3 text-[10px]">1</span>
          }
          Road Test ({roadTestCount}/{CHECKOUT_ROAD_TEST_ITEMS.length})
        </button>
        <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        <button
          onClick={() => { if (roadTestAll) setActiveSection('checkout') }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSection === 'checkout'
              ? 'bg-gray-900 text-white'
              : checkoutAll ? 'bg-emerald-100 text-emerald-700'
              : roadTestAll ? 'bg-gray-100 text-gray-600' : 'bg-gray-50 text-gray-400 cursor-not-allowed'
          }`}>
          {checkoutAll
            ? <CheckCircle size={13} />
            : <span className="w-4 h-4 rounded-full border-2 border-current text-center leading-3 text-[10px]">2</span>
          }
          Checkout ({checkoutCount}/{CHECKOUT_HANDOVER_ITEMS.length})
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={14} />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError('')} className="ml-auto"><X size={14} className="text-red-400" /></button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
          <CheckCircle className="text-green-600 flex-shrink-0" size={18} />
          <p className="text-green-800 text-sm font-medium">{success}</p>
        </div>
      )}

      {/* ── Section 1: Road Test ── */}
      {activeSection === 'road_test' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
            <Car size={16} className="text-blue-600" />
            <p className="font-semibold text-gray-900 text-sm">Road Test Checklist</p>
            <span className="ml-auto text-xs text-gray-500">{roadTestCount}/{CHECKOUT_ROAD_TEST_ITEMS.length}</span>
          </div>

          <div className="px-5 py-4 space-y-2">
            {CHECKOUT_ROAD_TEST_ITEMS.map(item => (
              <label key={item.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  roadTest[item.id]
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}>
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                  roadTest[item.id] ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 bg-white'
                }`}>
                  {roadTest[item.id] && <CheckCircle size={12} className="text-white" />}
                </div>
                <input type="checkbox" className="sr-only"
                  checked={roadTest[item.id]}
                  onChange={() => handleRoadTestToggle(item.id)} />
                <span className={`text-sm ${roadTest[item.id] ? 'text-emerald-800 font-medium' : 'text-gray-700'}`}>
                  {item.label}
                </span>
              </label>
            ))}

            {/* Progress bar */}
            <div className="pt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{Math.round((roadTestCount / CHECKOUT_ROAD_TEST_ITEMS.length) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${(roadTestCount / CHECKOUT_ROAD_TEST_ITEMS.length) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Test notes */}
          <div className="px-5 pb-4">
            <label className="text-xs font-medium text-gray-600 block mb-1">Test Notes (optional)</label>
            <textarea value={testNotes} onChange={e => setTestNotes(e.target.value)}
              placeholder="Any observations during the road test..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-gray-400" />
          </div>

          <div className="px-5 pb-4">
            <button
              onClick={() => {
                if (!roadTestAll) { setError('Complete all road-test items to proceed.'); return }
                setError(''); setActiveSection('checkout')
              }}
              disabled={!roadTestAll}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={16} />
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}

      {/* ── Section 2: Checkout ── */}
      {activeSection === 'checkout' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
            <ClipboardCheck size={16} className="text-emerald-600" />
            <p className="font-semibold text-gray-900 text-sm">Vehicle Checkout</p>
            <span className="ml-auto text-xs text-gray-500">{checkoutCount}/{CHECKOUT_HANDOVER_ITEMS.length}</span>
          </div>

          <div className="px-5 py-4 space-y-2">
            {CHECKOUT_HANDOVER_ITEMS.map(item => (
              <label key={item.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  checkout[item.id]
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}>
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                  checkout[item.id] ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 bg-white'
                }`}>
                  {checkout[item.id] && <CheckCircle size={12} className="text-white" />}
                </div>
                <input type="checkbox" className="sr-only"
                  checked={checkout[item.id]}
                  onChange={() => handleCheckoutToggle(item.id)} />
                <span className={`text-sm ${checkout[item.id] ? 'text-emerald-800 font-medium' : 'text-gray-700'}`}>
                  {item.label}
                </span>
              </label>
            ))}

            {/* Progress bar */}
            <div className="pt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Progress</span>
                <span>{Math.round((checkoutCount / CHECKOUT_HANDOVER_ITEMS.length) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${(checkoutCount / CHECKOUT_HANDOVER_ITEMS.length) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Final mileage + checkout notes */}
          <div className="px-5 pb-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Final Mileage (km) — optional
              </label>
              <div className="relative">
                <Gauge size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="number" value={finalMileage}
                  onChange={e => setFinalMileage(e.target.value)}
                  placeholder={workOrder.initial_mileage ? `Started at ${Number(workOrder.initial_mileage).toLocaleString('en-KE')} km` : 'Enter final odometer reading'}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Checkout Notes (optional)</label>
              <textarea value={checkoutNotes} onChange={e => setCheckoutNotes(e.target.value)}
                placeholder="Any handover notes for the customer..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-gray-400" />
            </div>
          </div>

          <div className="px-5 pb-5 flex gap-2">
            <button onClick={() => { setError(''); setActiveSection('road_test') }}
              className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">
              ← Back
            </button>
            <button
              onClick={handleCheckout}
              disabled={saving || !checkoutAll}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving
                ? <Loader2 size={16} className="animate-spin" />
                : <BadgeCheck size={16} />
              }
              {saving ? 'Processing…' : 'Confirm Checkout & Close Work Order'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}