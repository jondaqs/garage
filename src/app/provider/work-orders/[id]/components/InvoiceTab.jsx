'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, CheckCircle, AlertCircle, Loader2,
  DollarSign, Send, Lock, Download, Printer,
  Clock, BadgeCheck, CreditCard, Banknote,
  Building2, Wrench, Package, ChevronDown, ChevronUp
} from 'lucide-react'

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',          icon: Banknote  },
  { value: 'mpesa',         label: 'M-Pesa',        icon: CreditCard },
  { value: 'card',          label: 'Card',          icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
  { value: 'cheque',        label: 'Cheque',        icon: FileText  },
]

export default function InvoiceTab({ workOrder, permissions = null }) {
  const supabase = createClient()

  const [invoice,    setInvoice]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sending,    setSending]    = useState(false)
  const [paying,     setPaying]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [showItems,  setShowItems]  = useState(true)
  const [showPayForm, setShowPayForm] = useState(false)
  const [payMethod,   setPayMethod]   = useState('cash')
  const [amountPaid,  setAmountPaid]  = useState('')
  const [payNotes,    setPayNotes]    = useState('')

  const fmt        = (n) => `KES ${Number(n || 0).toLocaleString('en-KE')}`
  const statusCode = workOrder.status?.code
  const woComplete = ['completed', 'closed', 'quality_check'].includes(statusCode)

  const canGenerate      = permissions ? (permissions.canGenerate      && woComplete) : woComplete
  const canSendInvoice   = permissions ? permissions.canSendInvoice   : true
  const canRecordPayment = permissions ? permissions.canRecordPayment : true

  const loadInvoice = useCallback(async () => {
    try {
      // Load invoice row directly — RLS now covers all roles (owner, mechanic, SPU admin/accountant)
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, notes, due_date, issued_at, paid_at, sent_at, issued_to_user_id')
        .eq('work_order_id', workOrder.id)
        .maybeSingle()

      if (inv) {
        // Load line items directly
        const { data: items } = await supabase
          .from('invoice_items')
          .select('id, item_type, item_name, description, quantity, unit_price, total_price')
          .eq('invoice_id', inv.id)
          .order('item_type')

        // Load receipt if paid
        const { data: receipt } = await supabase
          .from('receipts')
          .select('id, receipt_number, payment_method, amount_paid, change_given, paid_at, notes')
          .eq('invoice_id', inv.id)
          .maybeSingle()

        setInvoice({
          invoice:    inv,
          line_items: items || [],
          receipt:    receipt || null,
        })
      } else {
        setInvoice(null)
      }
    } catch (e) { console.error('loadInvoice error:', e.message) }
    finally { setLoading(false) }
  }, [workOrder.id])

  useEffect(() => { loadInvoice() }, [loadInvoice])

  const handleGenerate = async () => {
    setGenerating(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('generate_invoice', {
        p_work_order_id: workOrder.id, p_provider_user_id: user.id, p_tax_rate: 0.16, p_notes: null,
      })
      if (rpcErr) throw rpcErr
      // If invoice already exists the RPC returns success:false with the existing invoice_id
      // — treat this as success and just load the existing invoice
      if (!result.success && result.invoice_id) {
        setSuccess('Invoice already exists — loading it now.')
        await loadInvoice()
        return
      }
      if (!result.success) throw new Error(result.error)
      setSuccess(`Invoice ${result.invoice_number} generated.`)
      await loadInvoice()
    } catch (err) { setError(err.message) }
    finally { setGenerating(false) }
  }

  const handleSendInvoice = async () => {
    if (!invoice?.invoice?.id) return
    if (!window.confirm('Send this invoice to the customer?')) return
    setSending(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${workOrder.id}/send-invoice`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send invoice')
      const msgs = [data.email_sent && 'Email', data.sms_sent && 'SMS'].filter(Boolean)
      setSuccess(`Invoice sent to customer.${msgs.length ? ` Delivered via ${msgs.join(' & ')}.` : ''}`)
      await loadInvoice()
    } catch (err) { setError(err.message) }
    finally { setSending(false) }
  }

  const handlePayment = async () => {
    if (!amountPaid || parseFloat(amountPaid) <= 0) { setError('Enter a valid amount'); return }
    setPaying(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('process_payment', {
        p_invoice_id: invoice.invoice.id, p_payment_method: payMethod,
        p_amount_paid: parseFloat(amountPaid), p_payer_user_id: user.id, p_notes: payNotes || null,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      const change = result.change_given > 0 ? ` · Change: ${fmt(result.change_given)}` : ''
      setSuccess(`Payment recorded! Receipt ${result.receipt_number}${change}`)
      setShowPayForm(false)
      await loadInvoice()
    } catch (err) { setError(err.message) }
    finally { setPaying(false) }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin text-gray-300" size={32} />
    </div>
  )

  const inv       = invoice?.invoice
  const lineItems = invoice?.line_items || []
  const receipt   = invoice?.receipt
  const isPaid    = inv?.status === 'paid'
  const isSent    = !!(inv?.sent_at)
  const isOverdue = inv?.status === 'overdue'

  const serviceItems = lineItems.filter(i => i.item_type === 'service')
  const partItems    = lineItems.filter(i => i.item_type === 'part')

  // ── Not generated yet ────────────────────────────────────────────────────
  if (!inv) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <FileText className="text-gray-400" size={28} />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">No invoice yet</p>
          <p className="text-sm text-gray-500 mt-1">
            {!woComplete
              ? `Available once work order is completed. Status: ${workOrder.status?.display_name}`
              : 'Generate an invoice from the completed services and parts.'}
          </p>
        </div>
        {canGenerate ? (
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 text-sm font-semibold transition-colors shadow-sm">
            {generating ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><FileText size={15} /> Generate Invoice</>}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Lock size={13} /> Requires owner, admin, or accountant access
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <AlertCircle size={15} /> {error}
          </div>
        )}
      </div>
    )
  }

  // ── Invoice exists ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Feedback */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={15} />
          <span className="text-red-700">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-sm">
          <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" size={15} />
          <span className="text-emerald-700">{success}</span>
        </div>
      )}

      {/* ── Invoice Document ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">

        {/* Header */}
        <div className="bg-gray-900 px-6 py-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-widest text-amber-400 uppercase">Tax Invoice</span>
            </div>
            <p className="text-2xl font-bold text-white tracking-tight">{inv.invoice_number}</p>
            <p className="text-gray-400 text-xs mt-1">
              Work Order · {workOrder.work_order_number}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide ${
              isPaid    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' :
              isOverdue ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30' :
              isSent    ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30' :
                          'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
            }`}>
              {isPaid    && <BadgeCheck size={11} />}
              {isOverdue && <Clock size={11} />}
              {isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : isSent ? 'SENT' : 'DRAFT'}
            </span>
            <div className="mt-3 text-right space-y-0.5">
              <p className="text-gray-400 text-xs">Issued</p>
              <p className="text-white text-sm font-medium">
                {new Date(inv.issued_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              {inv.due_date && (<>
                <p className="text-gray-400 text-xs mt-1">Due</p>
                <p className={`text-sm font-medium ${isOverdue ? 'text-red-400' : 'text-white'}`}>
                  {new Date(inv.due_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </>)}
            </div>
          </div>
        </div>

        {/* Gold accent line */}
        <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-transparent" />

        {/* Line items */}
        <div className="px-6 py-4">
          <button
            onClick={() => setShowItems(v => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-700 transition-colors">
            <span>Line Items ({lineItems.length})</span>
            {showItems ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showItems && (
            <div className="space-y-4">
              {/* Services */}
              {serviceItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wrench size={12} className="text-blue-500" />
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Services</span>
                  </div>
                  <div className="space-y-1">
                    {serviceItems.map((item, i) => (
                      <div key={item.id || i} className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                          {item.description && item.description !== item.item_name && (
                            <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                          )}
                        </div>
                        <div className="text-right ml-4 flex-shrink-0">
                          <p className="text-sm font-semibold text-gray-900">{fmt(item.total_price)}</p>
                          {item.quantity > 1 && (
                            <p className="text-xs text-gray-400">{item.quantity} × {fmt(item.unit_price)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Parts */}
              {partItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Package size={12} className="text-orange-500" />
                    <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Parts & Materials</span>
                  </div>
                  <div className="space-y-1">
                    {partItems.map((item, i) => (
                      <div key={item.id || i} className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                          {item.description && item.description !== item.item_name && (
                            <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                          )}
                        </div>
                        <div className="text-right ml-4 flex-shrink-0">
                          <p className="text-sm font-semibold text-gray-900">{fmt(item.total_price)}</p>
                          <p className="text-xs text-gray-400">{item.quantity} × {fmt(item.unit_price)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50">
          <div className="space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900">{fmt(inv.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>VAT ({Math.round((inv.tax_rate || 0.16) * 100)}%)</span>
              <span>{fmt(inv.tax_amount)}</span>
            </div>
            <div className="h-px bg-gray-200 my-1" />
            <div className="flex justify-between">
              <span className="text-base font-bold text-gray-900">Total Due</span>
              <span className="text-xl font-black text-gray-900">{fmt(inv.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 italic">{inv.notes}</p>
          </div>
        )}
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}

      {/* Send invoice */}
      {!isPaid && canSendInvoice && (
        <div className={`rounded-xl border p-4 flex items-center justify-between gap-3 ${
          isSent ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {isSent ? 'Invoice sent to customer' : 'Ready to send to customer'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isSent
                ? `Sent ${new Date(inv.sent_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })} · Awaiting payment.`
                : 'Customer will receive email, SMS, and in-app notification.'}
            </p>
          </div>
          <button onClick={handleSendInvoice} disabled={sending}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap disabled:opacity-50 flex-shrink-0 transition-colors ${
              isSent
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {isSent ? 'Resend' : 'Send Invoice'}
          </button>
        </div>
      )}

      {!isPaid && !canSendInvoice && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex items-center gap-2 text-xs text-gray-400">
          <Lock size={13} /> Sending requires owner, admin, or accountant access.
        </div>
      )}

      {/* ── Payment receipt (if paid) ─────────────────────────────────── */}
      {receipt && (
        <div className="rounded-2xl overflow-hidden border border-emerald-200 bg-emerald-50">
          <div className="bg-emerald-600 px-5 py-3 flex items-center gap-2">
            <BadgeCheck className="text-white" size={16} />
            <span className="text-white font-semibold text-sm">Payment Received</span>
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-emerald-700 font-medium mb-0.5">Receipt No.</p>
              <p className="font-bold text-gray-900">{receipt.receipt_number}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 font-medium mb-0.5">Method</p>
              <p className="font-semibold text-gray-900 capitalize">{receipt.payment_method?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 font-medium mb-0.5">Amount Paid</p>
              <p className="font-bold text-emerald-700 text-base">{fmt(receipt.amount_paid)}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-700 font-medium mb-0.5">Date</p>
              <p className="font-semibold text-gray-900">
                {new Date(receipt.paid_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Record payment ────────────────────────────────────────────── */}
      {!isPaid && canRecordPayment && (
        <div>
          {!showPayForm ? (
            <button onClick={() => { setShowPayForm(true); setAmountPaid(inv.total_amount?.toString() || '') }}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-900 hover:text-gray-900 transition-colors font-medium">
              <DollarSign size={16} /> Record Payment
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-900 px-5 py-3">
                <p className="text-white font-semibold text-sm flex items-center gap-2">
                  <DollarSign size={14} className="text-amber-400" /> Record Payment
                </p>
              </div>
              <div className="p-5 space-y-4 bg-white">
                {/* Method selector */}
                <div className="grid grid-cols-5 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value}
                      onClick={() => setPayMethod(m.value)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                        payMethod === m.value
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}>
                      <m.icon size={16} />
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Amount (KES)</label>
                    <input type="number" value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Reference / Notes</label>
                    <input type="text" value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      placeholder="e.g. M-Pesa ref: QXZ12345"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                  </div>
                </div>

                {parseFloat(amountPaid) > inv.total_amount && (
                  <div className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
                    Change to give customer: {fmt(parseFloat(amountPaid) - inv.total_amount)}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={handlePayment} disabled={paying}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors">
                    {paying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                    Confirm Payment
                  </button>
                  <button onClick={() => setShowPayForm(false)}
                    className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!isPaid && !canRecordPayment && (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400 py-2">
          <Lock size={13} /> Recording payment requires owner, admin, or accountant access.
        </div>
      )}
    </div>
  )
}