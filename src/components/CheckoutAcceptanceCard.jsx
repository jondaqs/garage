'use client'

/**
 * CheckoutAcceptanceCard
 * Shown to car owner (normal user or company member) on the invoice page.
 * Displays checkout details, road test + handover results, and accept/decline actions.
 *
 * Props:
 *   workOrderId  — uuid
 *   onDecided    — callback() after accept or decline (reload parent)
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Car, ClipboardCheck, CheckCircle, XCircle, AlertCircle,
  Loader2, BadgeCheck, Clock, ChevronDown, ChevronUp, Gauge
} from 'lucide-react'

const ROAD_TEST_LABELS = {
  rt_engine_smooth:       'Engine runs smoothly',
  rt_no_unusual_noise:    'No unusual noises during drive',
  rt_brakes_responsive:   'Brakes responsive and not pulling',
  rt_steering_ok:         'Steering straight and responsive',
  rt_no_warning_lights:   'No warning lights on dashboard',
  rt_transmission_smooth: 'Transmission shifts smoothly',
  rt_ac_heater_ok:        'A/C and heating working',
  rt_all_electrics_ok:    'All electrical systems functioning',
}

const HANDOVER_LABELS = {
  co_vehicle_clean:      'Vehicle returned clean',
  co_personal_items_ok:  'Customer personal items in place',
  co_fuel_level_noted:   'Fuel level noted and communicated',
  co_docs_handed_over:   'Service documents handed over',
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

function ChecklistSection({ title, icon: Icon, color, labels, data, autoValues = {} }) {
  const [open, setOpen] = useState(false)
  const keys   = Object.keys(labels)
  const merged = { ...data, ...autoValues }
  const passed = keys.filter(k => merged?.[k]).length
  const total  = keys.length

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-2">
          <Icon size={14} className={color} />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            passed === total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>{passed}/{total}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-2 bg-white">
          {keys.map(k => {
            const isAuto = k in autoValues
            const val    = merged?.[k]
            return (
              <div key={k} className={`flex items-start gap-2.5 p-2 rounded-lg text-sm ${
                val
                  ? isAuto ? 'text-blue-800 bg-blue-50' : 'text-emerald-800 bg-emerald-50'
                  : 'text-red-700 bg-red-50'
              }`}>
                {val
                  ? isAuto
                    ? <CheckCircle size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    : <CheckCircle size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  : <XCircle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                }
                <div>
                  <span>{labels[k]}</span>
                  {isAuto && (
                    <span className={`block text-xs mt-0.5 ${val ? 'text-blue-500' : 'text-gray-400'}`}>
                      {val ? 'Confirmed by service provider' : 'Not yet confirmed by service provider'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CheckoutAcceptanceCard({ workOrderId, onDecided }) {
  const supabase = createClient()

  const [checkout,    setCheckout]   = useState(null)
  const [isPaid,      setIsPaid]     = useState(false)  // invoice paid + receipt confirmed by SP
  const [loading,     setLoading]    = useState(true)
  const [acting,      setActing]     = useState(false)
  const [error,       setError]      = useState('')
  const [toast,       setToast]      = useState('')     // brief dismissible notice
  const [showDecline, setShowDecline]= useState(false)
  const [reason,      setReason]     = useState('')

  const load = useCallback(async () => {
    try {
      const [{ data: co }, { data: inv }] = await Promise.all([
        supabase.from('work_order_checkouts').select('*')
          .eq('work_order_id', workOrderId).maybeSingle(),
        supabase.from('invoices')
          .select('status, id')
          .eq('work_order_id', workOrderId).maybeSingle(),
      ])
      setCheckout(co || null)

      // Accept is allowed only when invoice is paid AND receipt is confirmed by SP
      if (inv?.status === 'paid' && inv?.id) {
        const { data: receipt } = await supabase
          .from('receipts')
          .select('confirmed')
          .eq('invoice_id', inv.id)
          .order('paid_at', { ascending: false })
          .limit(1).maybeSingle()
        setIsPaid(!!(receipt?.confirmed))
      } else {
        setIsPaid(false)
      }
    } catch (e) {
      console.error('CheckoutAcceptanceCard load:')
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => { load() }, [load])

  const handleAccept = async () => {
    if (!isPaid) {
      setToast('Payment must be made and confirmed by the service provider before you can accept the checkout.')
      setTimeout(() => setToast(''), 5000)
      return
    }
    setActing(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('accept_checkout', {
        p_work_order_id:   workOrderId,
        p_caller_auth_uid: user.id,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      onDecided?.()
    } catch (e) { setError(e.message) }
    finally { setActing(false) }
  }

  const handleDecline = async () => {
    if (!reason.trim()) { setError('Please provide a reason for declining'); return }
    setActing(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('decline_checkout', {
        p_work_order_id:   workOrderId,
        p_caller_auth_uid: user.id,
        p_reason:          reason.trim(),
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      // Non-blocking: notify provider staff via email + SMS
      fetch(`/api/work-orders/${workOrderId}/decline-checkout-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      }).catch(e => console.warn('[decline-checkout-notify]'))
      onDecided?.()
    } catch (e) { setError(e.message) }
    finally { setActing(false) }
  }

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 className="animate-spin text-gray-400" size={24} />
    </div>
  )

  if (!checkout) return null

  const isPending  = checkout.customer_acceptance_status === 'pending'
  const isAccepted = checkout.customer_acceptance_status === 'accepted'
  const isDeclined = checkout.customer_acceptance_status === 'declined'

  return (
    <div className={`rounded-2xl overflow-hidden border ${
      isAccepted ? 'border-emerald-200'
      : isDeclined ? 'border-red-200'
      : 'border-amber-200'
    }`}>
      {/* Header */}
      <div className={`px-5 py-3 flex items-center gap-2 ${
        isAccepted ? 'bg-emerald-600'
        : isDeclined ? 'bg-red-500'
        : 'bg-amber-500'
      }`}>
        {isAccepted
          ? <BadgeCheck className="text-white" size={18} />
          : isDeclined
          ? <XCircle className="text-white" size={18} />
          : <Clock className="text-white" size={18} />
        }
        <span className="text-white font-bold text-sm">
          {isAccepted ? 'Checkout Accepted — Work Order Closed'
           : isDeclined ? 'Checkout Declined'
           : 'Vehicle Checkout — Your Confirmation Needed'}
        </span>
      </div>

      <div className={`px-5 py-4 space-y-4 ${
        isAccepted ? 'bg-emerald-50' : isDeclined ? 'bg-red-50' : 'bg-amber-50'
      }`}>

        {/* Summary row */}
        <div className="grid grid-cols-2 gap-3 text-sm">
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
          <div className="bg-red-100 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-red-700 mb-1">Reason for Decline</p>
            <p className="text-sm text-red-800">{checkout.customer_acceptance_notes}</p>
          </div>
        )}

        {/* Checklist details */}
        <div className="space-y-2">
          <ChecklistSection
            title="Road Test"
            icon={Car}
            color="text-blue-600"
            labels={ROAD_TEST_LABELS}
            data={checkout}
          />
          <ChecklistSection
            title="Vehicle Handover"
            icon={ClipboardCheck}
            color="text-emerald-600"
            labels={HANDOVER_LABELS}
            data={checkout}
            autoValues={{ co_payment_confirmed: isPaid }}
          />
        </div>

        {/* Notes */}
        {(checkout.road_test_notes || checkout.checkout_notes) && (
          <div className="space-y-2">
            {checkout.road_test_notes && (
              <div className="bg-white rounded-xl px-4 py-3 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-1">Road Test Notes</p>
                <p className="text-sm text-gray-700">{checkout.road_test_notes}</p>
              </div>
            )}
            {checkout.checkout_notes && (
              <div className="bg-white rounded-xl px-4 py-3 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-1">Checkout Notes</p>
                <p className="text-sm text-gray-700">{checkout.checkout_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Action buttons — only when pending */}
        {isPending && (
          <div className="space-y-3">

            {/* Toast notification */}
            {toast && (
              <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-300 rounded-xl animate-pulse">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 font-medium">{toast}</p>
              </div>
            )}

            {/* Payment gate notice */}
            {!isPaid && (
              <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                <AlertCircle size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Payment required before acceptance</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    You can only accept the checkout once the invoice is paid and the payment has been confirmed by the service provider.
                    You may still decline if there are issues with the vehicle.
                  </p>
                </div>
              </div>
            )}

            {!showDecline ? (
              <div className="flex gap-2">
                <button
                  onClick={handleAccept}
                  disabled={acting || !isPaid}
                  title={!isPaid ? 'Payment must be confirmed by the service provider before accepting' : ''}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors ${
                    isPaid
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}>
                  {acting
                    ? <Loader2 size={14} className="animate-spin" />
                    : <CheckCircle size={14} />
                  }
                  {isPaid ? 'Accept Checkout' : 'Accept (Awaiting Payment)'}
                </button>
                <button
                  onClick={() => setShowDecline(true)}
                  disabled={acting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border-2 border-red-300 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-50 transition-colors">
                  <XCircle size={14} />
                  Decline
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Reason for declining *
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Describe what was not satisfactory..."
                    rows={3}
                    className="w-full px-3 py-2 border border-red-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-red-400 bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDecline}
                    disabled={acting || !reason.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors">
                    {acting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                    Confirm Decline
                  </button>
                  <button
                    onClick={() => { setShowDecline(false); setReason(''); setError('') }}
                    className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500 text-center">
              Accepting confirms your vehicle has been returned to your satisfaction and closes the work order.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}