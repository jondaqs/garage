'use client'

import { useState, useEffect, useCallback } from 'react'
import ReceiptCard from '@/components/ReceiptCard'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, FileText, CheckCircle, AlertCircle,
  Loader2, Car, MapPin, CreditCard,
  Banknote, Building2, BadgeCheck, CircleDollarSign,
  Wrench, Package, ExternalLink, Lock
} from 'lucide-react'

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',          icon: Banknote   },
  { value: 'mpesa',         label: 'M-Pesa',        icon: CreditCard },
  { value: 'card',          label: 'Card',          icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2  },
  { value: 'cheque',        label: 'Cheque',        icon: FileText   },
]

export default function CompanyWorkOrderInvoicePage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [invoice,     setInvoice]     = useState(null)   // full response object
  const [loading,     setLoading]     = useState(true)
  const [paying,      setPaying]      = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [canPay,      setCanPay]      = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)
  const [payMethod,   setPayMethod]   = useState('mpesa')
  const [mpesaRef,    setMpesaRef]    = useState('')
  const [payNotes,    setPayNotes]    = useState('')

  const fmt  = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'long', year: 'numeric'
  }) : '—'

  const loadInvoice = useCallback(async () => {
    try {
      // Check pay permission (company owner or admin)
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      if (profile) {
        const { data: owned } = await supabase
          .from('company_profiles').select('id').eq('owner_user_id', profile.id).maybeSingle()
        const { data: mem } = await supabase
          .from('company_users').select('is_admin')
          .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
        setCanPay(!!(owned || mem?.is_admin))
      }

      // Use the API route (service-role backed) to bypass RLS
      const resp = await fetch(`/api/work-orders/${params.id}/invoice`)
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.error || 'Failed to load invoice')
      }
      const data = await resp.json()
      if (!data.success) throw new Error(data.error || 'Failed to load invoice')

      // Enrich receipt with confirmed fields
      if (data.invoice?.id) {
        const { data: receipt } = await supabase
          .from('receipts')
          .select('id, receipt_number, payment_method, amount_paid, paid_at, notes, confirmed, confirmed_at')
          .eq('invoice_id', data.invoice.id)
          .order('paid_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        data.receipt = receipt || data.receipt
      }

      setInvoice(data.invoice ? data : null)
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
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  // ── No invoice ────────────────────────────────────────────────────────────
  if (!invoice) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.push(`/company/work-orders/${params.id}`)}
        className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Work Order
      </button>
      <div className="bg-white rounded-xl shadow-sm p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <FileText className="text-gray-400" size={28} />
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">No Invoice Yet</h2>
        <p className="text-sm text-gray-500 mb-4">
          {error || 'The service provider has not issued an invoice for this work order yet.'}
        </p>
        <button onClick={() => router.push(`/company/work-orders/${params.id}`)}
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

      {/* Back nav */}
      <button onClick={() => router.push(`/company/work-orders/${params.id}`)}
        className="flex items-center text-gray-500 hover:text-gray-800 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Fleet Work Orders
      </button>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={14} />
          <p className="text-red-700">{error}</p>
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
        {/* Dark header */}
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

        {/* Amber accent */}
        <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-transparent" />

        {/* From / Vehicle */}
        <div className="px-6 py-4 grid grid-cols-2 gap-4 bg-gray-50 border-b border-gray-100">
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
        </div>

        {/* Work order link */}
        {wo?.id && (
          <div className="px-6 py-3 border-b border-gray-100">
            <button
              onClick={() => router.push(`/company/work-orders/${wo.id}`)}
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

      {/* ── Pay now (company: owner/admin only) ───────────────────────────── */}
      {!isPaid && !success && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          {!canPay ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <Lock size={14} className="flex-shrink-0" />
              Only company owners and admins can record payment for fleet invoices.
            </div>
          ) : !showPayForm ? (
            <button
              onClick={() => setShowPayForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-semibold text-sm transition-colors">
              <CircleDollarSign size={18} />
              Record Payment — {fmt(inv.total_amount)}
            </button>
          ) : (
            <div className="space-y-4">
              <p className="font-semibold text-gray-900 text-sm">Record Payment</p>

              {/* Method picker */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

              {/* Reference */}
              {(payMethod === 'mpesa' || payMethod === 'bank_transfer' || payMethod === 'cheque') && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1 font-medium">
                    {payMethod === 'mpesa' ? 'M-Pesa Confirmation Code'
                      : payMethod === 'cheque' ? 'Cheque Number'
                      : 'Transaction Reference'}
                  </label>
                  <input type="text" value={mpesaRef}
                    onChange={e => setMpesaRef(e.target.value)}
                    placeholder={
                      payMethod === 'mpesa' ? 'e.g. QAB12345XY'
                      : payMethod === 'cheque' ? 'Cheque No.'
                      : 'Transaction ID'
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400" />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">Notes (optional)</label>
                <input type="text" value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="e.g. Approved by finance department"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400" />
              </div>

              {/* Amount summary */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">Amount</span>
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}