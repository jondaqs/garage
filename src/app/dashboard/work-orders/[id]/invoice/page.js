'use client'

import { useState, useEffect, useCallback } from 'react'
import ReceiptCard from '@/components/ReceiptCard'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, FileText, CheckCircle, AlertCircle,
  Loader2, Car, MapPin, Clock, CreditCard,
  Banknote, Building2, Receipt, ExternalLink,
  Wrench, Package, BadgeCheck, CircleDollarSign,
  ChevronRight, Download
} from 'lucide-react'
import { useInvoicePdfDownload } from '@/lib/invoice/useInvoicePdfDownload'

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',          icon: Banknote   },
  { value: 'mpesa',         label: 'M-Pesa',        icon: CreditCard },
  { value: 'card',          label: 'Card',          icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2  },
]

export default function UserWorkOrderInvoicePage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [invoice,     setInvoice]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [paying,      setPaying]      = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [showPayForm, setShowPayForm] = useState(false)
  const [payMethod,   setPayMethod]   = useState('mpesa')
  const [mpesaRef,    setMpesaRef]    = useState('')
  const [payNotes,    setPayNotes]    = useState('')

  // PDF download — fetches the canonical invoice HTML and renders to PDF
  // client-side. See @/lib/invoice/useInvoicePdfDownload for the full flow.
  const { downloading, error: dlError, download: downloadPdf } = useInvoicePdfDownload()

  // Currency-aware formatter. The work order's currency arrives as
  // `invoice.currency` from the updated get_invoice_details RPC. Falls back
  // to bare number if no currency is set on the work order.
  const fmt  = (n) => {
    const num = Number(n || 0).toLocaleString('en-KE')
    const cur = invoice?.currency
    if (!cur) return num
    return `${cur.symbol || cur.code} ${num}`
  }
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'long', year: 'numeric'
  }) : '—'

  const loadInvoice = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Fetch invoice by work_order_id using direct query (accessible via RLS)
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, discount, total_amount, notes, due_date, issued_at, paid_at, work_order_id, service_provider_id, vehicle_id')
        .eq('work_order_id', params.id)
        .maybeSingle()

      if (invErr) throw invErr
      if (!inv) { setInvoice(null); setLoading(false); return }

      // Use the RPC to get full details (handles auth check)
      const { data: result, error: rpcErr } = await supabase.rpc('get_invoice_details', {
        p_invoice_id:      inv.id,
        p_requesting_user: user.id,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)

      // Fetch receipt with confirmed fields (get_invoice_details receipt lacks them)
      let enrichedResult = result
      if (result.invoice?.id) {
        const { data: receipt } = await supabase
          .from('receipts')
          .select('id, receipt_number, payment_method, amount_paid, paid_at, notes, confirmed, confirmed_at')
          .eq('invoice_id', result.invoice.id)
          .order('paid_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        enrichedResult = { ...result, receipt: receipt || result.receipt }
      }

      setInvoice(enrichedResult)
    } catch (err) {
      setError(err.message || 'Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { loadInvoice() }, [loadInvoice])

  const handlePay = async () => {
    if (!invoice) return
    setPaying(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const notes = [
        mpesaRef ? `Ref: ${mpesaRef}` : null,
        payNotes || null,
      ].filter(Boolean).join(' · ') || null

      const { data: result, error: rpcErr } = await supabase.rpc('process_payment', {
        p_invoice_id:     invoice.invoice.id,
        p_payment_method: payMethod,
        p_amount_paid:    invoice.invoice.total_amount,
        p_payer_user_id:  user.id,
        p_notes:          notes,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setSuccess(`Payment confirmed! Receipt ${result.receipt_number}`)
      setShowPayForm(false)
      // Fire payment notifications (email + SMS to provider staff) — non-blocking
      fetch(`/api/work-orders/${params.id}/payment-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_number: result.receipt_number,
          amount_paid:    result.amount_paid,
          payment_method: payMethod,
          invoice_number: invoice.invoice.invoice_number,
        }),
      }).catch(e => console.warn('[payment-notify]', e.message))

      await loadInvoice()
    } catch (err) {
      setError(err.message)
    } finally {
      setPaying(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  // ── No invoice ────────────────────────────────────────────────────────────
  if (!invoice) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.push(`/dashboard/work-orders/${params.id}`)}
        className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Work Order
      </button>
      <div className="bg-white rounded-xl shadow-sm p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <FileText className="text-gray-400" size={28} />
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">No Invoice Yet</h2>
        <p className="text-sm text-gray-500 mb-4">
          {error || 'An invoice has not been generated for this work order yet.'}
        </p>
        <button onClick={() => router.push(`/dashboard/work-orders/${params.id}`)}
          className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
          Back to Work Order
        </button>
      </div>
    </div>
  )

  const inv      = invoice.invoice
  const items    = invoice.line_items || []
  const receipt  = invoice.receipt
  const vehicle  = invoice.vehicle
  const wo       = invoice.work_order
  const provider = invoice.provider

  const isPaid    = inv.status === 'paid'
  const isOverdue = inv.status === 'overdue'
  const services  = items.filter(i => i.item_type === 'service')
  const parts     = items.filter(i => i.item_type === 'part')
  const tax       = Math.round((inv.tax_rate || 0.16) * 100)

  const statusBadge = isPaid
    ? { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' }
    : isOverdue
      ? { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' }
      : { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Unpaid' }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

      {/* Top action row — back nav on the left, Download PDF on the right. */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push(`/dashboard/work-orders/${params.id}`)}
          className="flex items-center text-gray-500 hover:text-gray-800 text-sm">
          <ArrowLeft size={16} className="mr-1" /> Work Order
        </button>
        {inv && (
          <button
            onClick={() => downloadPdf({ workOrderId: params.id, invoiceNumber: inv.invoice_number })}
            disabled={downloading}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {downloading ? 'Generating PDF…' : 'Download PDF'}
          </button>
        )}
      </div>

      {/* Alerts */}
      {(error || dlError) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={14} />
          <p className="text-red-700">{error || dlError}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2">
          <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-green-800 text-sm font-medium">{success}</p>
        </div>
      )}

      {/* ── Invoice header ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Dark top bar */}
        <div className="bg-gray-900 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold tracking-widest text-amber-400 uppercase mb-1">Tax Invoice</p>
              <h1 className="text-xl font-bold text-white">{inv.invoice_number}</h1>
              {wo && (
                <p className="text-xs text-gray-400 mt-0.5">Work Order · {wo.number}</p>
              )}
            </div>
            <span className={`mt-1 px-3 py-1 rounded-full text-xs font-bold ${statusBadge.bg} ${statusBadge.text}`}>
              {isPaid ? '✓ ' : ''}{statusBadge.label}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Issued</p>
              <p className="text-gray-200 font-medium">{fmtD(inv.issued_at)}</p>
            </div>
            {inv.due_date && !isPaid && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Due</p>
                <p className={`font-medium ${isOverdue ? 'text-red-400' : 'text-amber-300'}`}>
                  {fmtD(inv.due_date)}
                </p>
              </div>
            )}
            {isPaid && inv.paid_at && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Paid</p>
                <p className="text-green-400 font-medium">{fmtD(inv.paid_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Gold accent */}
        <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-transparent" />

        {/* Vehicle & provider */}
        <div className="px-6 py-4 grid grid-cols-2 gap-4 bg-gray-50 border-b border-gray-100">
          {vehicle && (
            <div className="flex items-start gap-2">
              <Car size={14} className="text-gray-400 mt-1 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Vehicle</p>
                <p className="text-sm font-semibold text-gray-900">{vehicle.plate_number}</p>
                <p className="text-xs text-gray-500">{[vehicle.make, vehicle.model].filter(Boolean).join(' ')}</p>
              </div>
            </div>
          )}
          {provider && (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 mt-1 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">From</p>
                <p className="text-sm font-semibold text-gray-900">{provider.name}</p>
                {provider.phone && <p className="text-xs text-gray-500">{provider.phone}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Work order link */}
        {wo?.id && (
          <div className="px-6 py-3 border-b border-gray-100">
            <button
              onClick={() => router.push(`/dashboard/work-orders/${wo.id}`)}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <ExternalLink size={12} />
              View Work Order {wo.number}
            </button>
          </div>
        )}
      </div>

      {/* ── Line items ────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">

          {/* Services */}
          {services.length > 0 && (
            <div>
              <div className="px-4 py-2.5 bg-blue-50 border-b border-gray-100 flex items-center gap-2">
                <Wrench size={12} className="text-blue-600" />
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Services</p>
              </div>
              {services.map((item, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-3 ${i < services.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.item_name}</p>
                    {item.description && item.description !== item.item_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{item.quantity} × {fmt(item.unit_price)}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(item.total_price)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Parts */}
          {parts.length > 0 && (
            <div>
              <div className="px-4 py-2.5 bg-orange-50 border-b border-gray-100 flex items-center gap-2">
                <Package size={12} className="text-orange-600" />
                <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">Parts & Materials</p>
              </div>
              {parts.map((item, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-3 ${i < parts.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.item_name}</p>
                    {item.description && item.description !== item.item_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{item.quantity} × {fmt(item.unit_price)}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(item.total_price)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="px-4 py-4 bg-gray-50 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{fmt(inv.subtotal)}</span>
            </div>
            {(inv.discount > 0) && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>−{fmt(inv.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-500">
              <span>VAT ({tax}%)</span>
              <span>{fmt(inv.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total Due</span>
              <span className={isPaid ? 'text-green-700' : 'text-gray-900'}>{fmt(inv.total_amount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      {inv.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-amber-900">{inv.notes}</p>
        </div>
      )}

      {/* ── Receipt ─────────────────────────────────────────────────────── */}
      {receipt && (
        <ReceiptCard
          receipt={receipt}
          canConfirm={false}
          workOrderId={params.id}
          onConfirmed={loadInvoice}
        />
      )}

      {/* ── Pay now ───────────────────────────────────────────────────────── */}
      {!isPaid && !success && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          {!showPayForm ? (
            <button
              onClick={() => setShowPayForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-semibold text-sm transition-colors">
              <CircleDollarSign size={18} />
              Pay {fmt(inv.total_amount)}
            </button>
          ) : (
            <div className="space-y-4">
              <p className="font-semibold text-gray-900 text-sm">Complete Payment</p>

              {/* Method picker */}
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => {
                  const Icon = m.icon
                  return (
                    <button key={m.value}
                      onClick={() => setPayMethod(m.value)}
                      className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        payMethod === m.value
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                      }`}>
                      <Icon size={14} />
                      {m.label}
                    </button>
                  )
                })}
              </div>

              {/* Reference field for M-Pesa / bank */}
              {(payMethod === 'mpesa' || payMethod === 'bank_transfer') && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1 font-medium">
                    {payMethod === 'mpesa' ? 'M-Pesa Confirmation Code' : 'Transaction Reference'}
                  </label>
                  <input type="text" value={mpesaRef}
                    onChange={e => setMpesaRef(e.target.value)}
                    placeholder={payMethod === 'mpesa' ? 'e.g. QAB12345XY' : 'Transaction ID'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400" />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">Notes (optional)</label>
                <input type="text" value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400" />
              </div>

              {/* Amount summary */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">Total to pay</span>
                <span className="text-base font-bold text-gray-900">{fmt(inv.total_amount)}</span>
              </div>

              <div className="flex gap-2">
                <button onClick={handlePay} disabled={paying}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 font-semibold text-sm transition-colors">
                  {paying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {paying ? 'Processing…' : 'Confirm Payment'}
                </button>
                <button onClick={() => { setShowPayForm(false); setMpesaRef(''); setPayNotes('') }}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">
                  Cancel
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                This records manual payment. Online payment (Pesapal, Stripe) can be integrated separately.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}