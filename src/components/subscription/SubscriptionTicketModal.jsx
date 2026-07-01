// src/components/subscription/SubscriptionTicketModal.jsx
'use client'

/**
 * SubscriptionTicketModal
 *
 * Lets a company or service provider submit a custom package request ticket.
 * Calls submit_subscription_ticket RPC, then fires /api/subscription/ticket-notify.
 *
 * Props:
 *   isOpen          - boolean
 *   onClose         - function
 *   onSubmitted     - function(result) — called after successful submission
 *   supabase        - supabase client instance
 *   subscriberType  - 'company' | 'service_provider'
 *   subscriberId    - uuid
 *   subscriberName  - display name
 */

import { useState, useEffect } from 'react'
import {
  X, Loader2, CheckCircle, AlertCircle, MessageSquarePlus,
  Send, Truck, Users, UserCheck, Store,
} from 'lucide-react'

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent'

export default function SubscriptionTicketModal({
  isOpen, onClose, onSubmitted,
  supabase, subscriberType, subscriberId, subscriberName,
}) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [vehicles, setVehicles] = useState('')
  const [staff, setStaff] = useState('')
  const [clients, setClients] = useState('')
  const [shops, setShops] = useState('')
  const [period, setPeriod] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setSubject(''); setDescription(''); setVehicles(''); setStaff('')
      setClients(''); setShops(''); setPeriod(''); setError(''); setResult(null)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!subject.trim()) { setError('Please enter a subject'); return }
    if (!description.trim()) { setError('Please describe your requirements'); return }

    setSubmitting(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_subscription_ticket', {
        p_subscriber_type: subscriberType,
        p_entity_id: subscriberId,
        p_subject: subject.trim(),
        p_description: description.trim(),
        p_requested_vehicles: vehicles ? Number(vehicles) : null,
        p_requested_staff: staff ? Number(staff) : null,
        p_requested_monthly_clients: clients ? Number(clients) : null,
        p_requested_shops: shops ? Number(shops) : null,
        p_requested_billing_period: period || null,
      })
      if (rpcErr) throw rpcErr
      const res = typeof data === 'string' ? JSON.parse(data) : data
      if (!res.success) throw new Error(res.error)

      setResult(res)
      if (onSubmitted) onSubmitted(res)

      // Fire email/SMS notification (fire-and-forget)
      fetch('/api/subscription/ticket-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: res.ticket_id,
          ticket_number: res.ticket_number,
          entity_name: res.entity_name || subscriberName,
          subscriber_type: subscriberType,
          subject: subject.trim(),
          description: description.trim(),
        }),
      }).catch(e => console.warn('[ticket-notify] fire-and-forget failed:'))
    } catch (e) {
      setError(e.message || 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const isProvider = subscriberType === 'service_provider'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={result ? onClose : undefined} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-2">
            <MessageSquarePlus size={18} className="text-purple-600" />
            <h2 className="text-base font-bold text-gray-900">Request Custom Package</h2>
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
                <p className="text-sm text-gray-500 mt-1">Our team has been notified and will review your request shortly.</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ticket number</span>
                  <span className="font-mono font-bold text-purple-700">{result.ticket_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span className="text-yellow-600 font-medium">Open</span>
                </div>
              </div>
              <p className="text-xs text-gray-400">You can track this ticket in the Tickets tab.</p>
              <button onClick={onClose}
                className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* ── Subject ── */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Subject *</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Need a plan for 50+ vehicles with priority support"
                  className={inp} />
              </div>

              {/* ── Description ── */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Describe your requirements *</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Tell us what you need — fleet size, expected growth, specific features, budget constraints, billing preferences..."
                  rows={4} className={inp + ' resize-none'} />
              </div>

              {/* ── Optional metrics ── */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Estimated Needs <span className="text-gray-400 font-normal">(optional)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  {(subscriberType === 'company' || isProvider) && (
                    <div>
                      <label className="text-[11px] text-gray-500 flex items-center gap-1 mb-1"><Truck size={11} /> Vehicles</label>
                      <input type="number" min={0} value={vehicles} onChange={e => setVehicles(e.target.value)}
                        onWheel={e => e.currentTarget.blur()} placeholder="—" className={inp + ' text-xs'} />
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] text-gray-500 flex items-center gap-1 mb-1"><Users size={11} /> Staff</label>
                    <input type="number" min={0} value={staff} onChange={e => setStaff(e.target.value)}
                      onWheel={e => e.currentTarget.blur()} placeholder="—" className={inp + ' text-xs'} />
                  </div>
                  {isProvider && (
                    <>
                      <div>
                        <label className="text-[11px] text-gray-500 flex items-center gap-1 mb-1"><UserCheck size={11} /> Monthly clients</label>
                        <input type="number" min={0} value={clients} onChange={e => setClients(e.target.value)}
                          onWheel={e => e.currentTarget.blur()} placeholder="—" className={inp + ' text-xs'} />
                      </div>
                      <div>
                        <label className="text-[11px] text-gray-500 flex items-center gap-1 mb-1"><Store size={11} /> Shops</label>
                        <input type="number" min={0} value={shops} onChange={e => setShops(e.target.value)}
                          onWheel={e => e.currentTarget.blur()} placeholder="—" className={inp + ' text-xs'} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Preferred billing ── */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Preferred billing period <span className="text-gray-400 font-normal">(optional)</span></label>
                <select value={period} onChange={e => setPeriod(e.target.value)} className={inp}>
                  <option value="">No preference</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="semi_annual">Semi-Annual</option>
                  <option value="annual">Annual</option>
                  <option value="tri_annual">Tri-Annual</option>
                </select>
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
            <button onClick={handleSubmit} disabled={submitting || !subject.trim() || !description.trim()}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting...</> : <><Send size={16} /> Submit Request</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}