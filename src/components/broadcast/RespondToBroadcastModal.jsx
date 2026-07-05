// src/components/broadcast/RespondToBroadcastModal.jsx
'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle, AlertCircle, Send, FileText } from 'lucide-react'

const inp = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export default function RespondToBroadcastModal({ isOpen, onClose, onSubmitted, onError, supabase, broadcast, providerId }) {
  const [proposal, setProposal] = useState('')
  const [quotedPrice, setQuotedPrice] = useState('')
  const [duration, setDuration] = useState('')
  const [availability, setAvailability] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setProposal(''); setQuotedPrice(''); setDuration('')
      setAvailability(''); setError(''); setResult(null)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!proposal.trim()) { setError('Proposal text is required'); return }

    setSubmitting(true); setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('respond_to_broadcast', {
        p_broadcast_id: broadcast.id,
        p_proposal_text: proposal.trim(),
        p_quoted_price: quotedPrice ? Number(quotedPrice) : null,
        p_estimated_duration: duration || null,
        p_availability: availability || null,
        p_provider_id: providerId || null,
      })
      if (rpcErr) throw rpcErr
      const res = typeof data === 'string' ? JSON.parse(data) : data
      if (!res.success) {
        // Duplicate response — surface via toast and close modal
        if (res.error && res.error.toLowerCase().includes('already responded')) {
          if (onError) onError(res.error)
          onClose()
          return
        }
        throw new Error(res.error)
      }

      setResult(res)
      if (onSubmitted) onSubmitted(res)

      fetch('/api/service-broadcast/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_response', broadcast_id: broadcast.id,
          broadcast_number: broadcast.broadcast_number,
          broadcast_title: broadcast.title,
          provider_name: res.provider_name, response_id: res.response_id,
        }),
      }).catch(() => {})
    } catch (e) {
      setError(e.message || 'Failed to submit response')
    } finally { setSubmitting(false) }
  }

  if (!isOpen || !broadcast) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={result ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Submit Proposal</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {result ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <p className="text-lg font-bold text-gray-900">Proposal Submitted!</p>
              <p className="text-sm text-gray-500">The requester has been notified. You'll hear back if your proposal is selected.</p>
              <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Broadcast</span>
                  <span className="font-mono text-xs text-gray-700">{result.broadcast_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Your provider</span>
                  <span className="font-medium text-gray-900">{result.provider_name}</span>
                </div>
              </div>
              <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Done</button>
            </div>
          ) : (
            <>
              {/* Broadcast summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase">Responding to</p>
                <p className="text-sm font-semibold text-gray-900">{broadcast.title}</p>
                <p className="text-xs text-gray-500 line-clamp-2">{broadcast.description}</p>
                {broadcast.budget_estimate && <p className="text-xs text-gray-500">Budget: {broadcast.budget_estimate}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Your Proposal *</label>
                <textarea value={proposal} onChange={e => setProposal(e.target.value)}
                  placeholder="Describe how you'd handle this request — your approach, experience, what's included..."
                  rows={5} className={inp + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Quoted Price (KES)</label>
                  <input type="number" min={0} value={quotedPrice} onChange={e => setQuotedPrice(e.target.value)}
                    onWheel={e => e.currentTarget.blur()} placeholder="Optional" className={inp} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Estimated Duration</label>
                  <input type="text" value={duration} onChange={e => setDuration(e.target.value)}
                    placeholder="e.g. 2-3 days" className={inp} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Availability</label>
                <input type="text" value={availability} onChange={e => setAvailability(e.target.value)}
                  placeholder="e.g. Can start Monday" className={inp} />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" /><p className="text-sm">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || !proposal.trim()}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <><Send size={16} /> Submit Proposal</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}