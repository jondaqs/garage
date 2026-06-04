'use client'

/**
 * ReceiptCard
 *
 * Displays a receipt with optional payment confirmation.
 * Used in: InvoiceTab (provider/my-teams), user invoice page, company invoice page.
 *
 * Props:
 *   receipt        — receipt object from DB (id, receipt_number, payment_method,
 *                    amount_paid, paid_at, notes, confirmed, confirmed_at)
 *   canConfirm     — boolean: show confirm button (provider owner/admin/accountant/mechanic-invoice)
 *   onConfirmed    — callback after successful confirmation (reload parent)
 *   workOrderId    — used to route the confirm API; also used to fetch the
 *                    work order's billing currency when `currency` isn't passed.
 *   currency       — optional { id, code, symbol, display_name } from
 *                    currencies. Pass this when the caller already has it to
 *                    avoid an extra round trip; otherwise leave undefined and
 *                    the card will resolve it from workOrderId.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BadgeCheck, CheckCircle, Loader2, AlertCircle,
  CreditCard, Banknote, Building2, FileText, Clock
} from 'lucide-react'

const METHOD_ICONS = {
  cash:          Banknote,
  mpesa:         CreditCard,
  card:          CreditCard,
  bank_transfer: Building2,
  cheque:        FileText,
}

function fmtD(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Currency-aware formatter. Falls back to a bare number when no currency
// is supplied (callers that haven't been updated yet still render — just
// without a currency prefix).
function fmt(n, currency) {
  const num = Number(n || 0).toLocaleString('en-KE')
  if (!currency) return num
  return `${currency.symbol || currency.code} ${num}`
}

export default function ReceiptCard({ receipt, canConfirm = false, onConfirmed, workOrderId, currency = null }) {
  const supabase = createClient()
  const [confirming,    setConfirming]    = useState(false)
  const [error,         setError]         = useState('')
  // If the caller didn't supply a currency, resolve it from work_orders by
  // workOrderId. This keeps the three existing callers working without
  // changes; new callers should pass `currency` to skip the extra round trip.
  const [resolvedCur,   setResolvedCur]   = useState(null)

  useEffect(() => {
    // Caller-provided currency wins; only fetch when missing.
    if (currency || !workOrderId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('work_orders_secure')
        .select('currency:currencies(id, code, symbol, display_name)')
        .eq('id', workOrderId)
        .maybeSingle()
      if (!cancelled) setResolvedCur(data?.currency || null)
    })()
    return () => { cancelled = true }
  }, [workOrderId, currency])

  const effectiveCurrency = currency || resolvedCur

  if (!receipt) return null

  const MethodIcon = METHOD_ICONS[receipt.payment_method] || CreditCard
  const isConfirmed = receipt.confirmed

  const handleConfirm = async () => {
    if (!confirm('Confirm this payment has been received?')) return
    setConfirming(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('confirm_receipt', {
        p_receipt_id:      receipt.id,
        p_caller_auth_uid: user.id,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      onConfirmed?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className={`rounded-2xl overflow-hidden border ${
      isConfirmed
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-amber-200 bg-amber-50'
    }`}>
      {/* Header bar */}
      <div className={`px-5 py-3 flex items-center justify-between gap-3 ${
        isConfirmed ? 'bg-emerald-600' : 'bg-amber-500'
      }`}>
        <div className="flex items-center gap-2">
          {isConfirmed
            ? <BadgeCheck className="text-white" size={16} />
            : <Clock className="text-white" size={16} />
          }
          <span className="text-white font-bold text-sm">
            {isConfirmed ? 'Payment Confirmed' : 'Payment Received — Awaiting Confirmation'}
          </span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          isConfirmed
            ? 'bg-emerald-800 text-emerald-100'
            : 'bg-amber-600 text-amber-100'
        }`}>
          {receipt.receipt_number}
        </span>
      </div>

      {/* Details grid */}
      <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
            Amount Paid
          </p>
          <p className={`font-bold text-base ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
            {fmt(receipt.amount_paid, effectiveCurrency)}
          </p>
        </div>
        <div>
          <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
            Method
          </p>
          <p className="font-semibold text-gray-900 flex items-center gap-1.5 capitalize">
            <MethodIcon size={13} className="text-gray-400" />
            {receipt.payment_method?.replace('_', ' ') || '—'}
          </p>
        </div>
        <div>
          <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
            Paid On
          </p>
          <p className="font-semibold text-gray-900">{fmtD(receipt.paid_at)}</p>
        </div>
        {isConfirmed && receipt.confirmed_at && (
          <div>
            <p className="text-xs font-semibold mb-0.5 text-emerald-700">Confirmed On</p>
            <p className="font-semibold text-gray-900">{fmtD(receipt.confirmed_at)}</p>
          </div>
        )}
        {receipt.notes && (
          <div className="col-span-2">
            <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
              Reference / Notes
            </p>
            <p className="text-gray-700 text-xs">{receipt.notes}</p>
          </div>
        )}
      </div>

      {/* Confirm button — shown to authorised provider staff only */}
      {!isConfirmed && canConfirm && (
        <div className="px-5 pb-4 pt-1 border-t border-amber-200">
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 mb-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {confirming
              ? <Loader2 size={14} className="animate-spin" />
              : <CheckCircle size={14} />
            }
            {confirming ? 'Confirming…' : 'Confirm Payment Received'}
          </button>
        </div>
      )}

      {/* Already confirmed — no action needed */}
      {isConfirmed && (
        <div className="px-5 pb-3 pt-1 border-t border-emerald-200">
          <p className="text-xs text-emerald-700 flex items-center gap-1.5">
            <CheckCircle size={12} /> Payment verified and confirmed.
          </p>
        </div>
      )}
    </div>
  )
}