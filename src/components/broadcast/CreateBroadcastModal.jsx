// src/components/broadcast/CreateBroadcastModal.jsx
'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle, AlertCircle, Send, Megaphone } from 'lucide-react'

const inp = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent'

const CATEGORIES = [
  'General Repair', 'Engine', 'Body Work', 'Electrical', 'Towing',
  'Inspection', 'Parts Supply', 'Detailing', 'Equipment Rental', 'Other',
]

export default function CreateBroadcastModal({ isOpen, onClose, onSubmitted, supabase, contextType }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [urgency, setUrgency] = useState('medium')
  const [preferredStart, setPreferredStart] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setTitle(''); setDescription(''); setCategory(''); setLocation('')
      setBudget(''); setUrgency('medium'); setPreferredStart('')
      setError(''); setResult(null)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    if (!description.trim()) { setError('Description is required'); return }

    setSubmitting(true); setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_service_broadcast', {
        p_title: title.trim(),
        p_description: description.trim(),
        p_service_category: category || null,
        p_location: location || null,
        p_budget_estimate: budget || null,
        p_urgency: urgency,
        p_preferred_start: preferredStart || null,
        p_context_type: contextType || null,
      })
      if (rpcErr) throw rpcErr
      const res = typeof data === 'string' ? JSON.parse(data) : data
      if (!res.success) throw new Error(res.error)

      setResult(res)
      if (onSubmitted) onSubmitted(res)

      fetch('/api/service-broadcast/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_broadcast', broadcast_id: res.broadcast_id,
          broadcast_number: res.broadcast_number, broadcast_title: title.trim(),
        }),
      }).catch(() => {})
    } catch (e) {
      setError(e.message || 'Failed to post broadcast')
    } finally { setSubmitting(false) }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={result ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-emerald-600" />
            <h2 className="text-base font-bold text-gray-900">Post Service Request</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {result ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <p className="text-lg font-bold text-gray-900">Request Posted!</p>
              <p className="text-sm text-gray-500">Service providers have been notified and can start submitting proposals.</p>
              <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Reference</span>
                  <span className="font-mono font-bold text-gray-900">{result.broadcast_number}</span>
                </div>
              </div>
              <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Done</button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Title *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Fleet brake inspection for 12 vehicles" className={inp} maxLength={200} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Description *</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Describe what you need — vehicle types, service scope, any specific requirements..."
                  rows={4} className={inp + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className={inp}>
                    <option value="">Select...</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Urgency</label>
                  <select value={urgency} onChange={e => setUrgency(e.target.value)} className={inp}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Location</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="Where is the service needed?" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Budget Estimate</label>
                  <input type="text" value={budget} onChange={e => setBudget(e.target.value)}
                    placeholder="e.g. KES 5,000 - 10,000" className={inp} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Preferred Start</label>
                  <input type="date" value={preferredStart} onChange={e => setPreferredStart(e.target.value)} className={inp} />
                </div>
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
            <button onClick={handleSubmit} disabled={submitting || !title.trim() || !description.trim()}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Posting...</> : <><Send size={16} /> Post Request</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}