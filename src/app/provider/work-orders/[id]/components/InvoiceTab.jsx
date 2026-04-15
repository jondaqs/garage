'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, Plus, CheckCircle, AlertCircle,
  Loader2, DollarSign, Send, Lock
} from 'lucide-react'

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash'          },
  { value: 'mpesa',         label: 'M-Pesa'        },
  { value: 'card',          label: 'Card'          },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque',        label: 'Cheque'        },
]

/**
 * InvoiceTab
 * Props:
 *   workOrder   – full WO object with status.code
 *   permissions – { canGenerate: bool, canSendInvoice: bool, canRecordPayment: bool }
 *                 Omit to grant full access (owner/provider dashboard)
 */
export default function InvoiceTab({ workOrder, permissions = null }) {
  const supabase = createClient()

  const [invoice,    setInvoice]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sending,    setSending]    = useState(false)
  const [paying,     setPaying]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')

  const [showPayForm, setShowPayForm] = useState(false)
  const [payMethod,   setPayMethod]   = useState('cash')
  const [amountPaid,  setAmountPaid]  = useState('')
  const [payNotes,    setPayNotes]    = useState('')

  const fmt        = (n) => n != null ? `KES ${Number(n).toLocaleString()}` : '—'
  const statusCode = workOrder.status?.code
  const woComplete = ['completed', 'closed', 'quality_check'].includes(statusCode)

  const canGenerate      = permissions ? (permissions.canGenerate      && woComplete) : woComplete
  const canSendInvoice   = permissions ? permissions.canSendInvoice   : true
  const canRecordPayment = permissions ? permissions.canRecordPayment : true

  const loadInvoice = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, notes, due_date, issued_at, paid_at, sent_at')
        .eq('work_order_id', workOrder.id)
        .maybeSingle()

      if (inv) {
        const { data: details } = await supabase.rpc('get_invoice_details', {
          p_invoice_id: inv.id, p_requesting_user: user.id,
        })
        setInvoice(details?.success ? details : { invoice: inv, line_items: null, receipt: null })
      } else {
        setInvoice(null)
      }
    } catch {}
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
      if (!result.success) throw new Error(result.error)
      setSuccess(`Invoice ${result.invoice_number} generated. You can now send it to the customer.`)
      setAmountPaid(result.total?.toString() || '')
      await loadInvoice()
    } catch (err) { setError(err.message) }
    finally { setGenerating(false) }
  }

  const handleSendInvoice = async () => {
    if (!invoice?.invoice?.id) return
    if (!window.confirm('Send this invoice to the customer for payment?')) return
    setSending(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${workOrder.id}/send-invoice`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send invoice')
      const msgs = [data.email_sent && 'Email delivered', data.sms_sent && 'SMS delivered'].filter(Boolean)
      setSuccess(`Invoice sent to customer.${msgs.length ? ' ' + msgs.join(', ') + '.' : ''}`)
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={28} /></div>

  const inv       = invoice?.invoice
  const lineItems = invoice?.line_items || []
  const receipt   = invoice?.receipt
  const isPaid    = inv?.status === 'paid'
  const isSent    = !!(inv?.sent_at)
  const isOverdue = inv?.status === 'overdue'

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-red-700">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-sm">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-green-700">{success}</span>
        </div>
      )}

      {!inv && (
        <div className="text-center py-10">
          <FileText className="mx-auto text-gray-300 mb-3" size={36} />
          <p className="text-sm text-gray-600 mb-1">No invoice generated yet.</p>
          {canGenerate ? (
            <>
              <p className="text-xs text-gray-400 mb-4">Invoice will be calculated from actual service costs and parts used.</p>
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium mx-auto">
                {generating ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><Plus size={15} /> Generate Invoice</>}
              </button>
            </>
          ) : !woComplete ? (
            <p className="text-xs text-gray-400">
              Invoice can be generated once the work order is completed. Current status: <strong>{workOrder.status?.display_name}</strong>
            </p>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-2">
              <Lock size={13} />
              Invoice generation requires owner, admin, or accountant access.
            </div>
          )}
        </div>
      )}

      {inv && (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-gray-900">{inv.invoice_number}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Issued {new Date(inv.issued_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                {inv.due_date && <> · Due {new Date(inv.due_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
                {isSent && inv.sent_at && <> · Sent {new Date(inv.sent_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isSent && !isPaid && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">Sent</span>}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isPaid ? 'bg-green-100 text-green-700' : isOverdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {inv.status?.toUpperCase()}
              </span>
            </div>
          </div>

          {!isPaid && canSendInvoice && (
            <div className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${isSent ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <div>
                <p className="text-sm font-medium text-gray-800">{isSent ? 'Invoice sent to customer' : 'Invoice not yet sent to customer'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{isSent ? 'Customer has been notified. Awaiting payment.' : 'Send invoice so the customer can arrange payment.'}</p>
              </div>
              <button onClick={handleSendInvoice} disabled={sending}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap disabled:opacity-50 flex-shrink-0 ${isSent ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {isSent ? 'Resend' : 'Send Invoice'}
              </button>
            </div>
          )}

          {!isPaid && !canSendInvoice && !isSent && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center gap-2 text-xs text-gray-500">
              <Lock size={13} /> Sending invoice to the customer requires owner, admin, or accountant access.
            </div>
          )}

          {lineItems.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Item</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Unit</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineItems.map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{item.item_name}</p>
                        {item.description && item.description !== item.item_name && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${item.item_type === 'service' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{item.item_type}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(item.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{fmt(inv.subtotal)}</span></div>
            {inv.discount > 0 && <div className="flex justify-between text-sm text-green-700"><span>Discount</span><span>−{fmt(inv.discount)}</span></div>}
            <div className="flex justify-between text-sm text-gray-600"><span>VAT ({Math.round((inv.tax_rate || 0.16) * 100)}%)</span><span>{fmt(inv.tax_amount)}</span></div>
            <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span><span className="text-green-700">{fmt(inv.total_amount)}</span>
            </div>
          </div>

          {receipt && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-semibold text-green-900 text-sm flex items-center gap-2"><CheckCircle size={15} /> Payment Received</p>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <div><p className="text-xs text-gray-500">Receipt</p><p className="font-medium text-gray-900">{receipt.receipt_number}</p></div>
                <div><p className="text-xs text-gray-500">Method</p><p className="font-medium text-gray-900 capitalize">{receipt.payment_method}</p></div>
                <div><p className="text-xs text-gray-500">Amount Paid</p><p className="font-medium text-gray-900">{fmt(receipt.amount_paid)}</p></div>
                <div><p className="text-xs text-gray-500">Date</p><p className="font-medium text-gray-900">{new Date(receipt.paid_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
              </div>
            </div>
          )}

          {!isPaid && canRecordPayment && (
            <div>
              {!showPayForm ? (
                <button onClick={() => { setShowPayForm(true); setAmountPaid(inv.total_amount?.toString() || '') }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors">
                  <DollarSign size={16} /> Record Payment
                </button>
              ) : (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Record payment</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Payment Method</label>
                      <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                        {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Amount Received (KES)</label>
                      <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                      <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="e.g. M-Pesa ref: QXZ12345" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                    </div>
                  </div>
                  {parseFloat(amountPaid) > inv.total_amount && (
                    <div className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">Change to give: {fmt(parseFloat(amountPaid) - inv.total_amount)}</div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handlePayment} disabled={paying} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                      {paying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Confirm Payment
                    </button>
                    <button onClick={() => setShowPayForm(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
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
      )}
    </div>
  )
}
