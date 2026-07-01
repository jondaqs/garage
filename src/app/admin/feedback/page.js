// → Drop this file at: src/app/admin/feedback/page.js
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageCircle, Send, Bug, Lightbulb, Sparkles, AlertCircle,
  Heart, MoreHorizontal, Star, Loader2, CheckCircle2, Trash2,
  Clock, Eye, XCircle, Filter, RefreshCw, User, MapPin, Reply
} from 'lucide-react'

const CATEGORIES = [
  { value: 'bug',             label: 'Bug',             icon: Bug             },
  { value: 'feature_request', label: 'Feature Request', icon: Lightbulb       },
  { value: 'improvement',     label: 'Improvement',     icon: Sparkles        },
  { value: 'complaint',       label: 'Complaint',       icon: AlertCircle     },
  { value: 'praise',          label: 'Praise',          icon: Heart           },
  { value: 'other',           label: 'Other',           icon: MoreHorizontal  },
]

const ROLE_CONTEXTS = [
  { value: 'customer', label: 'Customer' },
  { value: 'provider', label: 'Provider' },
  { value: 'company',  label: 'Company'  },
  { value: 'admin',    label: 'Admin'    },
]

const STATUS_OPTIONS = [
  { value: 'open',      label: 'Open',      icon: Clock,        cls: 'bg-gray-100 text-gray-700'   },
  { value: 'in_review', label: 'In Review', icon: Eye,          cls: 'bg-blue-100 text-blue-700'   },
  { value: 'resolved',  label: 'Resolved',  icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
  { value: 'dismissed', label: 'Dismissed', icon: XCircle,      cls: 'bg-red-100 text-red-700'     },
]

export default function AdminFeedbackPage() {
  const supabase = createClient()
  const [tab, setTab] = useState('inbox')   // 'inbox' | 'send'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
        <p className="text-gray-500 mt-1">
          Review and respond to feedback from users across the platform.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {[
            { id: 'inbox', label: 'Inbox'         },
            { id: 'send',  label: 'Send Feedback' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`
                px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'inbox' ? <InboxTab supabase={supabase} /> : <SendTab supabase={supabase} />}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Inbox tab — full feedback list with filters and per-row respond modal
// ───────────────────────────────────────────────────────────────────────────
function InboxTab({ supabase }) {
  const [filterStatus,   setFilterStatus]   = useState('')   // '' = all
  const [filterRole,     setFilterRole]     = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const [rows,    setRows]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [respondingTo, setRespondingTo] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('list_user_feedback', {
        p_status:       filterStatus   || null,
        p_role_context: filterRole     || null,
        p_category:     filterCategory || null,
        p_limit:        100,
        p_offset:       0,
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to load')
      setRows(data.rows || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('admin feedback load error')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [supabase, filterStatus, filterRole, filterCategory])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    if (!confirm('Permanently delete this feedback?')) return
    try {
      const { data, error } = await supabase.rpc('delete_user_feedback', { p_feedback_id: id })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to delete')
      await load()
    } catch (err) {
      alert(err.message)
    }
  }

  // Counts per status — handy summary above the list
  const countsByStatus = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s.value] = rows.filter(r => r.status === s.value).length
    return acc
  }, {})

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))]}
          />
          <FilterSelect
            label="Role"
            value={filterRole}
            onChange={setFilterRole}
            options={[{ value: '', label: 'All roles' }, ...ROLE_CONTEXTS]}
          />
          <FilterSelect
            label="Category"
            value={filterCategory}
            onChange={setFilterCategory}
            options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map(c => ({ value: c.value, label: c.label }))]}
          />
          <button
            onClick={load}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            title="Reload"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          Showing <strong>{rows.length}</strong> of <strong>{total}</strong>
        </span>
        {STATUS_OPTIONS.map(s => (
          <span key={s.value} className={`px-2 py-1 rounded-full ${s.cls}`}>
            {s.label}: <strong>{countsByStatus[s.value] || 0}</strong>
          </span>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-blue-600" size={28} />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Filter className="mx-auto text-gray-300 mb-2" size={32} />
          <p className="text-sm text-gray-500">No feedback matches these filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(fb => (
            <AdminFeedbackRow
              key={fb.id}
              fb={fb}
              onRespond={() => setRespondingTo(fb)}
              onDelete={() => handleDelete(fb.id)}
            />
          ))}
        </div>
      )}

      {/* Respond modal */}
      {respondingTo && (
        <RespondModal
          fb={respondingTo}
          supabase={supabase}
          onClose={() => setRespondingTo(null)}
          onSaved={async () => { setRespondingTo(null); await load() }}
        />
      )}
    </div>
  )
}

// ── Single admin row — full submitter detail, respond + delete actions ─────
function AdminFeedbackRow({ fb, onRespond, onDelete }) {
  const cat = CATEGORIES.find(c => c.value === fb.category) || CATEGORIES[CATEGORIES.length - 1]
  const CatIcon = cat.icon
  const st = STATUS_OPTIONS.find(s => s.value === fb.status) || STATUS_OPTIONS[0]
  const StIcon = st.icon

  const submitterName = [fb.submitter_first_name, fb.submitter_last_name]
    .filter(Boolean).join(' ') || 'Unknown user'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
            <CatIcon size={12} />
            {cat.label}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${st.cls}`}>
            <StIcon size={12} />
            {st.label}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 capitalize">
            {fb.role_context}
          </span>
          {fb.rating && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
              {[...Array(fb.rating)].map((_, i) => (
                <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />
              ))}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onRespond}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            title="Respond / update status"
          >
            <Reply size={13} />
            Respond
          </button>
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-600 p-1 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Submitter + page meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <User size={12} />
          {submitterName}
        </span>
        {fb.page_url && (
          <span className="inline-flex items-center gap-1 truncate max-w-[260px]" title={fb.page_url}>
            <MapPin size={12} />
            <span className="truncate">{fb.page_url}</span>
          </span>
        )}
        <span>·</span>
        <span>{new Date(fb.created_at).toLocaleString()}</span>
      </div>

      {/* Body */}
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{fb.subject}</h3>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.message}</p>

      {/* Existing admin response */}
      {fb.admin_response && (
        <div className="mt-3 pl-3 border-l-2 border-blue-300 bg-blue-50/40 py-2 px-3 rounded-r-lg">
          <p className="text-xs font-medium text-blue-700 mb-0.5">
            Your team's response
            {fb.reviewer_first_name && ` · ${fb.reviewer_first_name} ${fb.reviewer_last_name || ''}`.trim()}
            {fb.reviewed_at && ` · ${new Date(fb.reviewed_at).toLocaleString()}`}
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.admin_response}</p>
        </div>
      )}
    </div>
  )
}

// ── Respond modal ──────────────────────────────────────────────────────────
function RespondModal({ fb, supabase, onClose, onSaved }) {
  const [status, setStatus] = useState(fb.status === 'open' ? 'in_review' : fb.status)
  const [response, setResponse] = useState(fb.admin_response || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('respond_to_user_feedback', {
        p_feedback_id:    fb.id,
        p_status:         status,
        p_admin_response: response.trim() || null,
      })
      if (rpcErr) throw rpcErr
      if (!data?.success) throw new Error(data?.error || 'Failed to save')
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Respond to feedback</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              From {[fb.submitter_first_name, fb.submitter_last_name].filter(Boolean).join(' ') || 'Unknown user'}
              {' · '}{new Date(fb.created_at).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 -m-1"
          >
            <XCircle size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Original message snapshot */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">{fb.subject}</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.message}</p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUS_OPTIONS.map(s => {
                const Icon = s.icon
                const active = status === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    className={`
                      flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-sm font-medium
                      transition-all
                      ${active
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Icon size={14} className={active ? 'text-blue-600' : 'text-gray-400'} />
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Response */}
          <div>
            <label htmlFor="response" className="block text-sm font-medium text-gray-700 mb-1.5">
              Response <span className="text-gray-400 font-normal">(visible to submitter)</span>
            </label>
            <textarea
              id="response"
              value={response}
              onChange={e => setResponse(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Optional reply to the submitter"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="mt-1 text-xs text-gray-400 text-right">{response.length}/2000</div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" />Saving…</>
              : <><CheckCircle2 size={14} />Save response</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Send tab — admin's own feedback form (role_context='admin')
// ───────────────────────────────────────────────────────────────────────────
function SendTab({ supabase }) {
  const [category, setCategory] = useState('improvement')
  const [subject,  setSubject]  = useState('')
  const [message,  setMessage]  = useState('')
  const [rating,   setRating]   = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!subject.trim()) { setError('Subject is required'); return }
    if (!message.trim()) { setError('Message is required'); return }

    setSubmitting(true)
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_user_feedback', {
        p_role_context: 'admin',
        p_category:     category,
        p_subject:      subject.trim(),
        p_message:      message.trim(),
        p_rating:       rating > 0 ? rating : null,
        p_page_url:     typeof window !== 'undefined' ? window.location.href : null,
      })
      if (rpcErr) throw rpcErr
      if (!data?.success) throw new Error(data?.error || 'Failed to submit feedback')

      setSuccess('Feedback recorded.')
      setSubject(''); setMessage(''); setRating(0); setCategory('improvement')
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map(c => {
                const Icon = c.icon
                const active = category === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`
                      flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all
                      ${active
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Icon size={16} className={active ? 'text-blue-600' : 'text-gray-400'} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rating <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    size={28}
                    className={n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                  />
                </button>
              ))}
              {rating > 0 && (
                <button
                  type="button"
                  onClick={() => setRating(0)}
                  className="ml-2 text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={120}
              placeholder="Short summary"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1.5">Details</label>
            <textarea
              id="message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="What happened, what did you expect, or what would you like to see?"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <div className="mt-1 text-xs text-gray-400 text-right">{message.length}/2000</div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700
                         disabled:bg-blue-300 disabled:cursor-not-allowed
                         text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" />Submitting…</>
                : <><Send size={16} />Submit feedback</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Small filter <select> with label ───────────────────────────────────────
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}