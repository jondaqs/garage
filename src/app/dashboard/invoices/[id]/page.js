'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, FileText, CheckCircle, AlertCircle,
  Loader2, DollarSign, Car, MapPin, Download,
  ExternalLink, CreditCard
} from 'lucide-react'

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash'          },
  { value: 'mpesa',         label: 'M-Pesa'        },
  { value: 'card',          label: 'Card'          },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

export default function CustomerInvoicePage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [invoice, setInvoice]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [paying, setPaying]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  const [showPayForm, setShowPayForm] = useState(false)
  const [payMethod, setPayMethod]     = useState('mpesa')
  const [mpesaRef, setMpesaRef]       = useState('')

  const fmt = (n) => n != null ? `KES ${Number(n).toLocaleString()}` : '—'

  const loadInvoice = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('get_invoice_details', {
        p_invoice_id:      params.id,
        p_requesting_user: user.id,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setInvoice(result)
    } catch (err) {
      setError(err.message || 'Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { loadInvoice() }, [loadInvoice])

  const handlePay = async () => {
    setPaying(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('process_payment', {
        p_invoice_id:     params.id,
        p_payment_method: payMethod,
        p_amount_paid:    invoice.invoice.total_amount,
        p_payer_user_id:  user.id,
        p_notes:          mpesaRef ? `Ref: ${mpesaRef}` : null,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setSuccess(`Payment confirmed! Receipt ${result.receipt_number}`)
      setShowPayForm(false)
      await loadInvoice()
    } catch (err) {
      setError(err.message)
    } finally {
      setPaying(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  if (!invoice) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.back()}
        className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Back
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <AlertCircle className="mx-auto text-red-500 mb-3" size={40} />
        <p className="text-red-700 text-sm">{error || 'Invoice not found'}</p>
      </div>
    </div>
  )

  const inv     = invoice.invoice
  const isPaid  = inv.status === 'paid'
  const items   = invoice.line_items || []
  const receipt = invoice.receipt
  const vehicle = invoice.vehicle
  const wo      = invoice.work_order
  const provider = invoice.provider

  const services = items.filter(i => i.item_type === 'service')
  const parts    = items.filter(i => i.item_type === 'part')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => router.back()}
        className="flex items-center text-gray-500 hover:text-gray-800 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Back
      </button>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2">
          <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      {/* Invoice header card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText size={18} className="text-gray-400" />
              <h1 className="text-lg font-bold text-gray-900">{inv.invoice_number}</h1>
            </div>
            <p className="text-xs text-gray-400">
              Issued {new Date(inv.issued_at).toLocaleDateString('en-KE', {
                day: 'numeric', month: 'long', year: 'numeric'
              })}
              {inv.due_date && !isPaid && (
                <> · Due {new Date(inv.due_date).toLocaleDateString('en-KE', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}</>
              )}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {isPaid ? '✓ PAID' : 'UNPAID'}
          </span>
        </div>

        {/* Vehicle & provider */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          {vehicle && (
            <div className="flex items-start gap-2">
              <Car size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">{vehicle.plate_number}</p>
                <p className="text-xs text-gray-500">{[vehicle.make, vehicle.model].filter(Boolean).join(' ')}</p>
              </div>
            </div>
          )}
          {provider && (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-gray-900">{provider.name}</p>
                {provider.phone && <p className="text-xs text-gray-500">{provider.phone}</p>}
              </div>
            </div>
          )}
        </div>

        {wo?.id && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => router.push(`/dashboard/work-orders/${wo.id}`)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Work Order {wo.number} <ExternalLink size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Line items */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Services */}
          {services.length > 0 && (
            <div>
              <div className="px-4 py-2.5 bg-blue-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Services</p>
              </div>
              {services.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                    {item.description && item.description !== item.item_name && (
                      <p className="text-xs text-gray-400">{item.description}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 flex-shrink-0 ml-4">
                    {fmt(item.total_price)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Parts */}
          {parts.length > 0 && (
            <div>
              <div className="px-4 py-2.5 bg-orange-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Parts & Materials</p>
              </div>
              {parts.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                    <p className="text-xs text-gray-400">
                      {item.quantity} × {fmt(item.unit_price)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 flex-shrink-0 ml-4">
                    {fmt(item.total_price)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="px-4 py-4 bg-gray-50 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span><span>{fmt(inv.subtotal)}</span>
            </div>
            {inv.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span><span>−{fmt(inv.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-600">
              <span>VAT ({Math.round((inv.tax_rate || 0.16) * 100)}%)</span>
              <span>{fmt(inv.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span>
              <span className={isPaid ? 'text-green-700' : 'text-gray-900'}>{fmt(inv.total_amount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Receipt (paid) */}
      {isPaid && receipt && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="font-semibold text-green-900 text-sm flex items-center gap-2 mb-3">
            <CheckCircle size={16} /> Payment Confirmed
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-gray-500">Receipt No.</p>
              <p className="font-medium">{receipt.receipt_number}</p></div>
            <div><p className="text-xs text-gray-500">Method</p>
              <p className="font-medium capitalize">{receipt.payment_method?.replace('_', ' ')}</p></div>
            <div><p className="text-xs text-gray-500">Amount</p>
              <p className="font-medium">{fmt(receipt.amount_paid)}</p></div>
            <div><p className="text-xs text-gray-500">Date</p>
              <p className="font-medium">{new Date(receipt.paid_at).toLocaleDateString('en-KE', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}</p></div>
          </div>
        </div>
      )}

      {/* Pay now (if unpaid) */}
      {!isPaid && !success && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          {!showPayForm ? (
            <button
              onClick={() => setShowPayForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-sm"
            >
              <CreditCard size={18} /> Pay {fmt(inv.total_amount)}
            </button>
          ) : (
            <div className="space-y-4">
              <p className="font-semibold text-gray-900 text-sm">Complete Payment</p>
              <div className="grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.value}
                    onClick={() => setPayMethod(m.value)}
                    className={`py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      payMethod === m.value
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {(payMethod === 'mpesa' || payMethod === 'bank_transfer') && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    {payMethod === 'mpesa' ? 'M-Pesa Reference' : 'Transaction Reference'}
                  </label>
                  <input type="text" value={mpesaRef} onChange={e => setMpesaRef(e.target.value)}
                    placeholder={payMethod === 'mpesa' ? 'e.g. QAB12345XY' : 'Transaction ID'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3 flex justify-between text-sm font-semibold">
                <span>Amount to pay</span>
                <span className="text-green-700">{fmt(inv.total_amount)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={handlePay} disabled={paying}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold text-sm">
                  {paying ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  {paying ? 'Processing...' : 'Confirm Payment'}
                </button>
                <button onClick={() => setShowPayForm(false)}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">
                  Cancel
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Note: Online payment integration (e.g. Pesapal, Stripe) can be added as needed.
                This records manual payment confirmation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}