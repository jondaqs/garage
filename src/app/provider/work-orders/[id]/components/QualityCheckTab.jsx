'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle, XCircle, AlertCircle, Loader2,
  ClipboardCheck, Car, RefreshCw, FileText, Lock, Check, X
} from 'lucide-react'

// Standard QC checklist items — mechanic ticks these before submitting
const QC_CHECKLIST = [
  { id: 'all_services_done',   label: 'All requested services completed'          },
  { id: 'all_parts_supplied',  label: 'All requested parts supplied'              },
  { id: 'parts_installed',     label: 'All reserved parts installed correctly'    },
  { id: 'no_leaks',            label: 'No fluid leaks detected'                   },
  { id: 'electrical_ok',       label: 'All electrical systems functioning'        },
  { id: 'test_drive',          label: 'Vehicle test drive completed'               },
  { id: 'warning_lights_off',  label: 'No warning lights on dashboard'            },
  { id: 'vehicle_clean',       label: 'Vehicle returned clean inside and outside' },
  { id: 'docs_ready',          label: 'Service documentation ready'               },
]

export default function QualityCheckTab({ workOrder, onStatusChange, canSendInvoice = false }) {
  const supabase = createClient()

  const [session, setSession]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')

  // QC state
  const [checklist, setChecklist] = useState(
    Object.fromEntries(QC_CHECKLIST.map(i => [i.id, false]))
  )
  const [qcNotes, setQcNotes]     = useState('')
  const [showFailForm, setShowFailForm] = useState(false)
  const [failNotes, setFailNotes] = useState('')

  // Completion form
  const [showCompleteForm, setShowCompleteForm]   = useState(false)
  const [finalMileage, setFinalMileage]           = useState(workOrder.initial_mileage?.toString() || '')
  const [techNotes, setTechNotes]                 = useState('')
  const [invoiceNotified, setInvoiceNotified]     = useState(false)
  const [notifyingInvoice, setNotifyingInvoice]   = useState(false)

  // Brief floating notice for permission-gated actions (e.g. Go-to-Invoice
  // attempted by a team member without can_send_invoice). String is the
  // message; auto-clears after 4s. Mirrors the pattern used in
  // CheckoutAcceptanceCard's inline-toast state, just rendered as a fixed
  // overlay so it can't be missed.
  const [toast, setToast] = useState('')

  const showToast = (msg, ms = 4000) => {
    setToast(msg)
    if (ms > 0) setTimeout(() => setToast(''), ms)
  }

  const statusCode = workOrder.status?.code

  const loadSession = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('service_sessions')
        .select('*')
        .eq('work_order_id', workOrder.id)
        .maybeSingle()
      setSession(data)
    } catch {}
    finally { setLoading(false) }
  }, [workOrder.id])

  useEffect(() => { loadSession() }, [loadSession])

  const checkCount  = QC_CHECKLIST.filter(i => checklist[i.id]).length
  const anyChecked  = checkCount > 0
  const allChecked  = QC_CHECKLIST.every(i => checklist[i.id])
  const progress    = Math.round((checkCount / QC_CHECKLIST.length) * 100)

  // ── QC Pass ──────────────────────────────────────────────────────────────
  const handleQcPass = async () => {
    if (!anyChecked) { setError('Please complete at least one checklist item before passing QC'); return }
    setSubmitting(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${workOrder.id}/qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passed: true, notes: qcNotes || null, checklist }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'QC submission failed')
      setSuccess('QC passed! You can now complete the work order.')
      setShowCompleteForm(true)
      onStatusChange?.('quality_check')
      await loadSession()
    } catch (err) { setError(err.message) }
    finally { setSubmitting(false) }
  }

  // ── QC Fail ───────────────────────────────────────────────────────────────
  const handleQcFail = async () => {
    if (!failNotes.trim()) { setError('Please describe what needs to be fixed'); return }
    setSubmitting(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${workOrder.id}/qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passed: false, notes: failNotes.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'QC submission failed')
      setSuccess('QC failed — work order moved to Rework. Address the issues and resubmit.')
      setShowFailForm(false)
      onStatusChange?.('rework')
      await loadSession()
    } catch (err) { setError(err.message) }
    finally { setSubmitting(false) }
  }

  // ── Complete Work Order ───────────────────────────────────────────────────
  const handleComplete = async () => {
    setCompleting(true); setError('')
    try {
      const resp = await fetch(`/api/work-orders/${workOrder.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_mileage:    finalMileage ? parseInt(finalMileage) : null,
          technician_notes: techNotes || null,
        }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Completion failed')

      const channels = [
        data.email_sent && 'email',
        data.sms_sent   && 'SMS',
        'in-app notification',
      ].filter(Boolean).join(', ')

      setSuccess(`Work order completed! Owner notified via ${channels}.`)
      setShowCompleteForm(false)
      onStatusChange?.('completed')

      // Notify internal team (owner, admin, accountant, can_send_invoice) to generate invoice
      setNotifyingInvoice(true)
      fetch(`/api/work-orders/${workOrder.id}/notify-invoice`, { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.success) setInvoiceNotified(true) })
        .catch(() => {})
        .finally(() => setNotifyingInvoice(false))
    } catch (err) { setError(err.message) }
    finally { setCompleting(false) }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  const isTerminal  = ['completed','cancelled','closed','awaiting_customer_checkout'].includes(statusCode)
  const isQcStatus  = statusCode === 'quality_check'
  const isRework    = statusCode === 'rework'
  const isPostQc    = ['completed','awaiting_customer_checkout','closed'].includes(statusCode)
  const qcPassed    = session?.qc_passed === true
  const qcFailed    = session?.qc_passed === false

  return (
    <div className="space-y-5">

      {/* Alerts */}
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

      {/* Previous QC result */}
      {(qcPassed || qcFailed) && session && (
        <div className={`rounded-lg border p-4 ${qcPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            {qcPassed
              ? <CheckCircle className="text-green-600" size={16} />
              : <XCircle    className="text-red-600"   size={16} />
            }
            <span className={`text-sm font-semibold ${qcPassed ? 'text-green-800' : 'text-red-800'}`}>
              QC {qcPassed ? 'Passed' : 'Failed'}
            </span>
            <span className="text-xs text-gray-500 ml-auto">
              {session.qc_performed_at && new Date(session.qc_performed_at).toLocaleString('en-KE', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
          {session.qc_notes && (
            <p className="text-sm text-gray-700 mt-1">{session.qc_notes}</p>
          )}
        </div>
      )}

      {/* ── Active QC checklist (shown when in quality_check) ── */}
      {isQcStatus && !isTerminal && (
        <>
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>QC Checklist</span>
              <span>{checkCount} / {QC_CHECKLIST.length} completed</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Checklist items */}
          <div className="space-y-2">
            {QC_CHECKLIST.map(item => (
              <label key={item.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  checklist[item.id]
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}>
                <input
                  type="checkbox"
                  checked={checklist[item.id]}
                  onChange={e => setChecklist(c => ({ ...c, [item.id]: e.target.checked }))}
                  className="w-4 h-4 text-green-600 rounded"
                />
                <span className={`text-sm ${checklist[item.id] ? 'text-green-800 font-medium' : 'text-gray-700'}`}>
                  {item.label}
                </span>
                {checklist[item.id] && (
                  <CheckCircle className="text-green-500 ml-auto flex-shrink-0" size={15} />
                )}
              </label>
            ))}
          </div>

          {/* QC notes */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">QC Notes (optional)</label>
            <textarea
              value={qcNotes}
              onChange={e => setQcNotes(e.target.value)}
              placeholder="Any notes about the quality check..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Pass / Fail buttons */}
          {!showFailForm && !showCompleteForm && (
            <div className="flex gap-3">
              <button
                onClick={handleQcPass}
                disabled={submitting || !anyChecked}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-semibold"
              >
                {submitting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCircle size={14} />
                }
                QC Pass
              </button>
              <button
                onClick={() => setShowFailForm(true)}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-semibold"
              >
                <XCircle size={14} /> QC Fail
              </button>
            </div>
          )}

          {/* Fail form */}
          {showFailForm && (
            <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
              <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                <XCircle size={15} /> Describe what needs to be fixed
              </p>
              <textarea
                value={failNotes}
                onChange={e => setFailNotes(e.target.value)}
                placeholder="e.g. Brake noise still present after pad replacement. Oil leak at filter not fully sealed..."
                rows={4}
                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-400 bg-white"
              />
              <div className="flex gap-2">
                <button onClick={handleQcFail} disabled={submitting || !failNotes.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                  Submit Fail &amp; Send to Rework
                </button>
                <button onClick={() => setShowFailForm(false)} className="px-4 py-2 text-gray-500 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Rework status ── */}
      {isRework && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <RefreshCw className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-amber-900 text-sm">Work Order in Rework</p>
            <p className="text-amber-700 text-xs mt-1">
              Address the QC failure items in the Services tab, then advance to Quality Check again to resubmit.
            </p>
          </div>
        </div>
      )}

      {/* ── Completion form (shown after QC pass) ── */}
      {showCompleteForm && !isTerminal && (
        <div className="border border-green-200 rounded-lg p-5 bg-green-50 space-y-4">
          <p className="font-semibold text-green-900 text-sm flex items-center gap-2">
            <ClipboardCheck size={16} /> Complete Work Order
          </p>
          <p className="text-green-700 text-xs">
            This will create a service record, update vehicle history, notify the owner, and close the work order.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-600 font-medium block mb-1">
                Final Mileage (km)
              </label>
              <div className="flex items-center gap-2">
                <Car size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  type="number"
                  value={finalMileage}
                  onChange={e => setFinalMileage(e.target.value)}
                  placeholder={workOrder.initial_mileage?.toString() || 'e.g. 85000'}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 font-medium block mb-1">
              Technician Notes (visible in service record)
            </label>
            <textarea
              value={techNotes}
              onChange={e => setTechNotes(e.target.value)}
              placeholder="Summary of work performed, recommendations, etc..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="flex gap-3">
            <button onClick={handleComplete} disabled={completing}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-semibold">
              {completing
                ? <><Loader2 size={14} className="animate-spin" /> Completing...</>
                : <><CheckCircle size={14} /> Complete &amp; Notify Owner</>
              }
            </button>
            <button onClick={() => setShowCompleteForm(false)} disabled={completing}
              className="px-4 py-2.5 text-gray-500 text-sm">
              Later
            </button>
          </div>
        </div>
      )}

      {/* ── Already completed ── */}
      {isTerminal && (
        <div className="space-y-4">
          <div className="text-center py-6 text-gray-400">
            <CheckCircle className="mx-auto mb-2 text-green-400" size={32} />
            <p className="text-sm">Work order {workOrder.status?.display_name?.toLowerCase()}.</p>
            {session?.completed_at && (
              <p className="text-xs mt-1">
                Completed {new Date(session.completed_at).toLocaleDateString('en-KE', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </p>
            )}
          </div>

          {/* Invoice CTA — shown after completion.
              Visible to all provider team members so everyone sees that the
              work order has reached this state, but the action itself
              (jumping to the invoice tab to draft/send) is gated on
              can_send_invoice. Without that permission:
                – the button still renders, dimmed & not-allowed (so the
                  user understands it exists but is unavailable to them),
                – clicking it triggers a floating toast,
                – a persistent helper below the card explains why. */}
          {(invoiceNotified || statusCode === 'completed') && (
            <>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileText className="text-green-600 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-green-900 text-sm">Ready to Invoice</p>
                  <p className="text-green-700 text-xs mt-0.5">
                    {/* Subtitle is role-aware. Users who can send invoices are
                        addressed directly ("Generate and send…"); members who
                        can't are told who *will* be acting on it, so the card
                        doesn't read as an instruction they can't follow. */}
                    {canSendInvoice
                      ? (invoiceNotified
                          ? 'Team notified. Generate and send the invoice to the customer.'
                          : 'Work order complete. Generate and send the invoice to the customer.')
                      : (invoiceNotified
                          ? 'Work order complete. An admin or accountant has been notified to send the invoice.'
                          : 'Work order complete. An admin or accountant will send the invoice to the customer.')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!canSendInvoice) {
                    showToast("You don't have permission to send invoices. Ask an admin to enable Can send invoices on your account.")
                    return
                  }
                  onStatusChange?.('go_to_invoice')
                }}
                disabled={notifyingInvoice}
                aria-disabled={!canSendInvoice || notifyingInvoice}
                title={!canSendInvoice
                  ? "You don't have permission to send invoices"
                  : undefined}
                className={
                  'flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold ' +
                  (canSendInvoice
                    ? 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'
                    // Visually disabled but still clickable (so we can fire the toast).
                    : 'bg-green-600/50 text-white/90 cursor-not-allowed')
                }>
                {notifyingInvoice
                  ? <Loader2 size={14} className="animate-spin" />
                  : !canSendInvoice
                    ? <Lock size={14} />
                    : <FileText size={14} />}
                Go to Invoice
              </button>
            </div>

            {/* Persistent permission helper — only shown to members who
                can't act on the button above. Sets expectations so they
                don't keep clicking. */}
            {!canSendInvoice && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5">
                <Lock size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Invoice sending is restricted</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your account doesn't have the <span className="font-semibold">Can send invoices</span> permission.
                    A workshop admin, accountant, or the owner needs to draft and send the invoice — or grant you the permission from <span className="font-semibold">Team</span>.
                  </p>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* ── Not yet in QC (placeholder) ── */}
      {!isQcStatus && !isRework && !isTerminal && !isPostQc && (
        <div className="text-center py-10 text-gray-400">
          <ClipboardCheck className="mx-auto mb-2 opacity-40" size={32} />
          <p className="text-sm">QC checklist becomes available when the work order reaches Quality Check status.</p>
          <p className="text-xs mt-1 text-gray-400">Current status: {workOrder.status?.display_name}</p>
        </div>
      )}

      {/* ── QC already completed (post-QC statuses) ── */}
      {isPostQc && !isQcStatus && (
        <div className="space-y-4">
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <ClipboardCheck className="text-green-600" size={28} />
            </div>
            <p className="text-sm font-semibold text-gray-900">Quality check completed</p>
            <p className="text-xs text-gray-500 mt-1">QC was passed and the work order has progressed to the next stage.</p>
          </div>

          {/* QC checklist results */}
          {session?.qc_checklist && Object.keys(session.qc_checklist).length > 0 && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">QC Checklist</p>
              <div className="space-y-1.5">
                {QC_CHECKLIST.map(item => {
                  const checked = session.qc_checklist[item.id]
                  return (
                    <div key={item.id} className="flex items-center gap-2.5 py-1">
                      <div className={`w-4.5 h-4.5 rounded flex items-center justify-center flex-shrink-0 ${
                        checked
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-300'
                      }`}>
                        {checked
                          ? <Check size={12} strokeWidth={3} />
                          : <X size={10} strokeWidth={2} />}
                      </div>
                      <span className={`text-sm ${checked ? 'text-gray-800' : 'text-gray-400'}`}>
                        {item.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              {session.qc_notes && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-1">QC Notes</p>
                  <p className="text-sm text-gray-700">{session.qc_notes}</p>
                </div>
              )}
              {session.qc_performed_at && (
                <p className="text-[10px] text-gray-400 mt-2">
                  Completed {new Date(session.qc_performed_at).toLocaleString('en-KE', {
                    dateStyle: 'medium', timeStyle: 'short'
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating toast — appears briefly when a permission-gated action
          is blocked. Fixed at the bottom so it's visible even when the
          page is scrolled to the QC checklist further up. */}
      {toast && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none"
        >
          <div className="pointer-events-auto flex items-start gap-2.5 max-w-md w-full px-4 py-3 bg-gray-900 text-white rounded-xl shadow-2xl">
            <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{toast}</p>
            <button
              onClick={() => setToast('')}
              className="text-gray-400 hover:text-white text-xs font-semibold flex-shrink-0"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}