// src/components/SubscriptionReceiptCard.jsx
'use client'

/**
 * SubscriptionReceiptCard
 *
 * Displays a subscription receipt with optional payment confirmation.
 * Mirrors the existing ReceiptCard pattern from work orders.
 *
 * Props:
 *   receipt       — receipt object from subscription_receipt_details view
 *   canConfirm    — boolean: show confirm button
 *   onConfirmed   — callback after successful confirmation
 *   currency      — optional { code, symbol } override
 */

import { useState } from 'react'
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

const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—'

const fmt = (n, sym = '') => `${sym}${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SubscriptionReceiptCard({ receipt, canConfirm = false, onConfirmed, currency }) {
  const supabase = createClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  if (!receipt) return null

  const MethodIcon = METHOD_ICONS[receipt.payment_method] || CreditCard
  const isConfirmed = receipt.confirmed
  const sym = currency?.symbol || receipt.currency_symbol || ''

  const handleConfirm = async () => {
    if (!confirm('Confirm this subscription payment has been received?')) return
    setConfirming(true); setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('confirm_subscription_receipt', {
        p_receipt_id: receipt.id,
      })
      if (rpcErr) throw rpcErr
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (!result.success) throw new Error(result.error)
      onConfirmed?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className={`rounded-2xl overflow-hidden border ${isConfirmed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className={`px-5 py-3 flex items-center justify-between gap-3 ${isConfirmed ? 'bg-emerald-600' : 'bg-amber-500'}`}>
        <div className="flex items-center gap-2">
          {isConfirmed ? <BadgeCheck className="text-white" size={16} /> : <Clock className="text-white" size={16} />}
          <span className="text-white font-bold text-sm">
            {isConfirmed ? 'Payment Confirmed' : 'Payment Received — Awaiting Confirmation'}
          </span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isConfirmed ? 'bg-emerald-800 text-emerald-100' : 'bg-amber-600 text-amber-100'}`}>
          {receipt.receipt_number}
        </span>
      </div>

      <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>Amount Paid</p>
          <p className={`font-bold text-base ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(receipt.amount_paid, sym)}</p>
        </div>
        <div>
          <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>Method</p>
          <p className="font-semibold text-gray-900 flex items-center gap-1.5 capitalize">
            <MethodIcon size={13} className="text-gray-400" />
            {receipt.payment_method?.replace('_', ' ') || '—'}
          </p>
        </div>
        <div>
          <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>Paid On</p>
          <p className="font-semibold text-gray-900">{fmtD(receipt.issued_at)}</p>
        </div>
        {isConfirmed && receipt.confirmed_at && (
          <div>
            <p className="text-xs font-semibold mb-0.5 text-emerald-700">Confirmed On</p>
            <p className="font-semibold text-gray-900">{fmtD(receipt.confirmed_at)}</p>
          </div>
        )}
        {receipt.paid_by_name && (
          <div>
            <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>Paid By</p>
            <p className="font-semibold text-gray-900">{receipt.paid_by_name}</p>
          </div>
        )}
        {receipt.transaction_ref && (
          <div>
            <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>Transaction Ref</p>
            <p className="text-gray-700 text-xs font-mono">{receipt.transaction_ref}</p>
          </div>
        )}
        {receipt.change_given > 0 && (
          <div>
            <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>Change Given</p>
            <p className="font-semibold text-gray-900">{fmt(receipt.change_given, sym)}</p>
          </div>
        )}
        {receipt.notes && (
          <div className="col-span-2">
            <p className={`text-xs font-semibold mb-0.5 ${isConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>Notes</p>
            <p className="text-gray-700 text-xs">{receipt.notes}</p>
          </div>
        )}
      </div>

      {!isConfirmed && canConfirm && (
        <div className="px-5 pb-4 pt-1 border-t border-amber-200">
          {error && <div className="flex items-center gap-1.5 text-xs text-red-600 mb-2"><AlertCircle size={12} /> {error}</div>}
          <button onClick={handleConfirm} disabled={confirming}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors">
            {confirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {confirming ? 'Confirming…' : 'Confirm Payment Received'}
          </button>
        </div>
      )}

      {isConfirmed && (
        <div className="px-5 pb-3 pt-1 border-t border-emerald-200">
          <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle size={12} /> Payment verified and confirmed.</p>
        </div>
      )}
    </div>
  )
}