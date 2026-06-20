// src/components/support/SupportTicketModal.jsx
'use client'

/**
 * SupportTicketModal
 *
 * Universal support ticket form for all user types.
 * Priority is resolved entirely server-side — no priority input exposed.
 *
 * Props:
 *   isOpen    - boolean
 *   onClose   - function
 *   onSubmitted - function(result) — called after success
 *   supabase  - supabase client
 */

import { useState, useEffect } from 'react'
import {
  X, Loader2, CheckCircle, AlertCircle, LifeBuoy, Send,
} from 'lucide-react'

const inp = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

const CATEGORIES = [
  { value: 'billing',         label: 'Billing & Payments',   desc: 'Invoices, charges, refunds' },
  { value: 'technical',       label: 'Technical Issue',      desc: 'Bugs, errors, app problems' },
  { value: 'account',         label: 'Account & Access',     desc: 'Login, permissions, profile' },
  { value: 'feature_request', label: 'Feature Request',      desc: 'Suggestions, improvements' },
  { value: 'other',           label: 'Other',                desc: 'Anything else' },
]

const PRIORITY_COLORS = {
  p1_critical: 'bg-red-100 text-red-800 border-red-200',
  p2_high:     'bg-orange-100 text-orange-800 border-orange-200',
  p3_medium:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  p4_standard: 'bg-blue-100 text-blue-800 border-blue-200',
  p5_basic:    'bg-gray-100 text-gray-700 border-gray-200',
}

export default function SupportTicketModal({ isOpen, onClose, onSubmitted, supabase, contextType }) {
  const [category, setCategory] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setCategory(''); setSubject(''); setDescription('')
      setError(''); setResult(null)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!category) { setError('Please select a category'); return }
    if (!subject.trim()) { setError('Please enter a subject'); return }
    if (!description.trim()) { setError('Please describe the issue'); return }

    setSubmitting(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_support_ticket', {
        p_category: category,
        p_subject: subject.trim(),
        p_description: description.trim(),
        p_context_type: contextType || null,
      })
      if (rpcErr) throw rpcErr
      const res = typeof data === 'string' ? JSON.parse(data) : data
      if (!res.success) throw new Error(res.error)

      setResult(res)
      if (onSubmitted) onSubmitted(res)

      // Fire notification (fire-and-forget)
      fetch('/api/support/ticket-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: res.ticket_id,
          ticket_number: res.ticket_number,
          priority_code: res.priority_code,
          priority_label: res.priority_label,
          category,
          subject: subject.trim(),
          description: description.trim(),
          subscriber_type: res.subscriber_type,
          entity_name: res.entity_name,
        }),
      }).catch(e => console.warn('[support-notify] fire-and-forget failed:', e.message))
    } catch (e) {
      setError(e.message || 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={result ? onClose : undefined} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-blue-50">
          <div className="flex items-center gap-2">
            <LifeBuoy size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Submit Support Ticket</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-4">
          {result ? (
            /* ── Success ── */
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">Ticket Submitted</p>
                <p className="text-sm text-gray-500 mt-1">Our team has been notified and will respond based on your priority level.</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ticket</span>
                  <span className="font-mono font-bold text-gray-900">{result.ticket_number}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Priority</span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${PRIORITY_COLORS[result.priority_code] || PRIORITY_COLORS.p5_basic}`}>
                    {result.priority_label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Based on</span>
                  <span className="text-gray-700 text-xs capitalize">{(result.priority_source || '').replace(/_/g, ' ')}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400">You can track this ticket in the Support page.</p>
              <button onClick={onClose}
                className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* ── Category ── */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-2">Category *</label>
                <div className="grid grid-cols-1 gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c.value} type="button" onClick={() => { setCategory(c.value); setError('') }}
                      className={`text-left px-4 py-3 rounded-lg border transition-all ${
                        category === c.value
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      <p className={`text-sm font-medium ${category === c.value ? 'text-blue-900' : 'text-gray-900'}`}>{c.label}</p>
                      <p className="text-[11px] text-gray-500">{c.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Subject ── */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Subject *</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Brief summary of the issue"
                  className={inp} maxLength={200} />
              </div>

              {/* ── Description ── */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Description *</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the issue in detail — what happened, what you expected, any error messages..."
                  rows={5} className={inp + ' resize-none'} />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit}
              disabled={submitting || !category || !subject.trim() || !description.trim()}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <><Send size={16} /> Submit Ticket</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}