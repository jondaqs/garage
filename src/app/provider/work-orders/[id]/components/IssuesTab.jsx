'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, AlertTriangle, AlertCircle, CheckCircle,
  ChevronDown, X, Loader2, Shield, MessageSquare, User
} from 'lucide-react'

const SEVERITY_STYLES = {
  low:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Low'      },
  medium:   { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Medium'   },
  high:     { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High'     },
  critical: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Critical' },
}

const STATUS_STYLES = {
  open:             'bg-blue-100 text-blue-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved:         'bg-green-100 text-green-700',
  resolved:         'bg-gray-100 text-gray-500',
  closed:           'bg-gray-100 text-gray-400',
}

export default function IssuesTab({ workOrder, onIssueAdded, readOnly = false, isAdminOrOwner = false }) {
  const supabase = createClient()

  const [issues, setIssues]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', severity: 'medium', requires_approval: false
  })

  const isTerminal = ['completed','cancelled','closed','awaiting_customer_checkout'].includes(workOrder.status?.code)
  const isLocked   = isTerminal && !isAdminOrOwner

  const loadIssues = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('vehicle_issues')
        .select(`
          id, title, description, severity, status,
          requires_approval, reported_at, resolved_at,
          reporter:user_profiles_secure!reported_by_user_id(first_name, last_name)
        `)
        .eq('work_order_id', workOrder.id)
        .order('reported_at', { ascending: false })
      if (err) throw err
      setIssues(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [workOrder.id])

  useEffect(() => { loadIssues() }, [loadIssues])

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('report_vehicle_issue', {
        p_work_order_id:     workOrder.id,
        p_title:             form.title,
        p_description:       form.description || null,
        p_provider_user_id:  user.id,
        p_severity:          form.severity,
        p_requires_approval: form.requires_approval,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setSuccess('Issue recorded')
      setShowForm(false)
      setForm({ title: '', description: '', severity: 'medium', requires_approval: false })
      onIssueAdded?.()
      await loadIssues()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

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

      {/* Customer reported problem — always shown as reference */}
      {workOrder.problem_description && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
          <div className="flex items-start gap-2">
            <User size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                Customer Reported Problem
              </p>
              <p className="text-sm text-amber-900">{workOrder.problem_description}</p>
            </div>
          </div>
        </div>
      )}

      {issues.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Shield size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No issues documented yet.</p>
          {!isLocked && !readOnly && (
            <button onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-green-600 hover:text-green-700 font-medium">
              + Document an issue
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const sev = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.medium
            return (
              <div key={issue.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${sev.bg.replace('bg-','bg-').replace('-100','-400')}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900 text-sm">{issue.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sev.bg} ${sev.text}`}>
                        {sev.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[issue.status] || ''}`}>
                        {(issue.status || 'open').replace('_', ' ')}
                      </span>
                      {issue.requires_approval && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          Needs approval
                        </span>
                      )}
                    </div>
                    {issue.description && (
                      <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      Reported by {issue.reporter?.first_name} {issue.reporter?.last_name} ·{' '}
                      {new Date(issue.reported_at || issue.created_at).toLocaleDateString('en-KE', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                      {issue.resolved_at && (
                        <> · Resolved {new Date(issue.resolved_at).toLocaleDateString('en-KE', {
                          day: 'numeric', month: 'short'
                        })}</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add issue form */}
      {!isLocked && !readOnly && (
        <div>
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-orange-400 hover:text-orange-600 transition-colors">
              <Plus size={16} /> Document Issue Found
            </button>
          ) : (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">New issue</p>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Title *</label>
                <input type="text" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Worn brake pads detected"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400" />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Description</label>
                <textarea value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Additional details about the issue..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Severity</label>
                  <select value={form.severity}
                    onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="req_approval"
                    checked={form.requires_approval}
                    onChange={e => setForm(f => ({ ...f, requires_approval: e.target.checked }))}
                    className="w-4 h-4 text-orange-600 rounded" />
                  <label htmlFor="req_approval" className="text-sm text-gray-700">
                    Requires customer approval
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSubmit} disabled={saving || !form.title.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                  Record Issue
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">
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