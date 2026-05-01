'use client'

/**
 * Shared checkout detail + acceptance page.
 * Used by three routes — receives `backPath` as prop.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CheckoutAcceptanceCard from '@/components/CheckoutAcceptanceCard'
import {
  ArrowLeft, Car, ClipboardCheck, CheckCircle, XCircle,
  Loader2, BadgeCheck, Clock, AlertCircle, Gauge, ChevronDown, ChevronUp
} from 'lucide-react'

const ROAD_TEST_LABELS = {
  rt_engine_smooth:       'Engine runs smoothly',
  rt_no_unusual_noise:    'No unusual noises during drive',
  rt_brakes_responsive:   'Brakes responsive and not pulling',
  rt_steering_ok:         'Steering straight and responsive',
  rt_no_warning_lights:   'No warning lights on dashboard',
  rt_transmission_smooth: 'Transmission shifts smoothly',
  rt_ac_heater_ok:        'A/C and heating working (if applicable)',
  rt_all_electrics_ok:    'All electrical systems functioning',
}

const HANDOVER_LABELS = {
  co_vehicle_clean:      'Vehicle returned clean',
  co_personal_items_ok:  'Customer personal items in place',
  co_fuel_level_noted:   'Fuel level noted and communicated',
  co_docs_handed_over:   'Service documents handed to customer',
  co_customer_notified:  'Customer notified vehicle is ready',
  co_payment_confirmed:  'Payment confirmed / invoice settled',
}

function fmtD(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ChecklistSection({ title, icon: Icon, color, labels, data }) {
  const [open, setOpen] = useState(true)
  const keys   = Object.keys(labels)
  const passed = keys.filter(k => data?.[k]).length
  const total  = keys.length

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Icon size={15} className={color} />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            passed === total ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>{passed}/{total} {passed === total ? '✓' : '✗'}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 py-4 space-y-2">
          {keys.map(k => (
            <div key={k} className={`flex items-center gap-2.5 p-3 rounded-xl text-sm ${
              data?.[k] ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'
            }`}>
              {data?.[k]
                ? <CheckCircle size={14} className="text-emerald-600 flex-shrink-0" />
                : <XCircle    size={14} className="text-red-500 flex-shrink-0" />
              }
              <span className={data?.[k] ? 'text-emerald-800 font-medium' : 'text-red-700'}>
                {labels[k]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function CheckoutPageInner({ backPath, canAcceptDecline = false }) {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const workOrderId = params.id
  const companyId   = params.companyId  // only set for company member route

  const [checkout,  setCheckout]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [woStatus,  setWoStatus]  = useState(null)

  // Resolve back path (replace dynamic segments)
  const backTo = backPath
    .replace('[companyId]', companyId || '')
    .replace('[id]', workOrderId)

  const load = useCallback(async () => {
    try {
      // Fetch checkout record
      const { data: co, error: coErr } = await supabase
        .from('work_order_checkouts')
        .select('*')
        .eq('work_order_id', workOrderId)
        .maybeSingle()
      if (coErr) throw coErr
      setCheckout(co || null)

      // Fetch WO status
      const { data: wo } = await supabase
        .from('work_orders')
        .select('status:work_order_statuses(code, display_name)')
        .eq('id', workOrderId)
        .maybeSingle()
      setWoStatus(wo?.status || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-gray-400" size={32} />
    </div>
  )

  if (error) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.push(backTo)}
        className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Back
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <AlertCircle className="text-red-500 mb-2" size={20} />
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    </div>
  )

  if (!checkout) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.push(backTo)}
        className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Back
      </button>
      <div className="bg-white rounded-xl shadow-sm p-10 text-center">
        <Clock size={36} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm font-semibold text-gray-700">No Checkout Yet</p>
        <p className="text-xs text-gray-400 mt-1">
          The service provider has not submitted a checkout for this work order yet.
        </p>
        <button onClick={() => router.push(backTo)}
          className="mt-5 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
          Back to Work Order
        </button>
      </div>
    </div>
  )

  const isPending  = checkout.customer_acceptance_status === 'pending'
  const isAccepted = checkout.customer_acceptance_status === 'accepted'
  const isDeclined = checkout.customer_acceptance_status === 'declined'

  const statusLabel = isAccepted ? 'Accepted — Work Order Closed'
    : isDeclined ? 'Declined'
    : 'Awaiting Your Confirmation'

  const headerColor = isAccepted ? 'bg-emerald-600'
    : isDeclined ? 'bg-red-500'
    : 'bg-amber-500'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Back nav */}
      <button onClick={() => router.push(backTo)}
        className="flex items-center text-gray-500 hover:text-gray-800 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Work Order
      </button>

      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Vehicle Checkout</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {woStatus?.display_name && `Work order status: ${woStatus.display_name}`}
        </p>
      </div>

      {/* Status header card */}
      <div className={`rounded-2xl overflow-hidden border ${
        isAccepted ? 'border-emerald-200'
        : isDeclined ? 'border-red-200'
        : 'border-amber-200'
      }`}>
        <div className={`${headerColor} px-5 py-3 flex items-center gap-2`}>
          {isAccepted
            ? <BadgeCheck className="text-white" size={18} />
            : isDeclined
            ? <XCircle className="text-white" size={18} />
            : <Clock className="text-white" size={18} />
          }
          <span className="text-white font-bold text-sm">{statusLabel}</span>
        </div>

        <div className={`px-5 py-4 grid grid-cols-2 gap-3 text-sm ${
          isAccepted ? 'bg-emerald-50' : isDeclined ? 'bg-red-50' : 'bg-amber-50'
        }`}>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-0.5">Submitted</p>
            <p className="font-semibold text-gray-900">{fmtD(checkout.confirmed_at)}</p>
          </div>
          {checkout.final_mileage && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-0.5 flex items-center gap-1">
                <Gauge size={11} /> Final Mileage
              </p>
              <p className="font-semibold text-gray-900">
                {Number(checkout.final_mileage).toLocaleString('en-KE')} km
              </p>
            </div>
          )}
          {isAccepted && checkout.customer_accepted_at && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-0.5">Accepted</p>
              <p className="font-semibold text-emerald-700">{fmtD(checkout.customer_accepted_at)}</p>
            </div>
          )}
          {isDeclined && checkout.customer_declined_at && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-0.5">Declined</p>
              <p className="font-semibold text-red-700">{fmtD(checkout.customer_declined_at)}</p>
            </div>
          )}
        </div>

        {/* Decline reason */}
        {isDeclined && checkout.customer_acceptance_notes && (
          <div className="bg-red-50 border-t border-red-100 px-5 py-3">
            <p className="text-xs font-semibold text-red-700 mb-1">Reason for Decline</p>
            <p className="text-sm text-red-800">{checkout.customer_acceptance_notes}</p>
          </div>
        )}
      </div>

      {/* Notes */}
      {(checkout.road_test_notes || checkout.checkout_notes) && (
        <div className="grid grid-cols-1 gap-3">
          {checkout.road_test_notes && (
            <div className="bg-white rounded-xl shadow-sm px-5 py-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1">Road Test Notes</p>
              <p className="text-sm text-gray-700">{checkout.road_test_notes}</p>
            </div>
          )}
          {checkout.checkout_notes && (
            <div className="bg-white rounded-xl shadow-sm px-5 py-4 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1">Checkout Notes</p>
              <p className="text-sm text-gray-700">{checkout.checkout_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Road Test Checklist */}
      <ChecklistSection
        title="Road Test"
        icon={Car}
        color="text-blue-600"
        labels={ROAD_TEST_LABELS}
        data={checkout}
      />

      {/* Handover Checklist */}
      <ChecklistSection
        title="Vehicle Handover"
        icon={ClipboardCheck}
        color="text-emerald-600"
        labels={HANDOVER_LABELS}
        data={checkout}
      />

      {/* Accept / Decline — only for car owner, only when pending */}
      {canAcceptDecline && isPending && (
        <CheckoutAcceptanceCard
          workOrderId={workOrderId}
          onDecided={load}
        />
      )}
    </div>
  )
}