// → Drop this file at: src/app/provider/feedback/page.js
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MessageCircle, Send, Bug, Lightbulb, Sparkles, AlertCircle,
  Heart, MoreHorizontal, Star, Loader2, CheckCircle2, Trash2,
  Clock, Eye, XCircle, RefreshCw
} from 'lucide-react'

const CATEGORIES = [
  { value: 'bug',             label: 'Bug',             icon: Bug             },
  { value: 'feature_request', label: 'Feature Request', icon: Lightbulb       },
  { value: 'improvement',     label: 'Improvement',     icon: Sparkles        },
  { value: 'complaint',       label: 'Complaint',       icon: AlertCircle     },
  { value: 'praise',          label: 'Praise',          icon: Heart           },
  { value: 'other',           label: 'Other',           icon: MoreHorizontal  },
]

const STATUS_LABELS = {
  open:      { label: 'Open',      icon: Clock,        cls: 'bg-gray-100 text-gray-700'   },
  in_review: { label: 'In Review', icon: Eye,          cls: 'bg-green-100 text-green-700' },
  resolved:  { label: 'Resolved',  icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700' },
  dismissed: { label: 'Dismissed', icon: XCircle,      cls: 'bg-red-100 text-red-700'     },
}

export default function ProviderFeedbackPage() {
  const router   = useRouter()
  const supabase = createClient()

  // Form
  const [category, setCategory] = useState('improvement')
  const [subject,  setSubject]  = useState('')
  const [message,  setMessage]  = useState('')
  const [rating,   setRating]   = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // List
  const [history, setHistory] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [pageUrl, setPageUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPageUrl(document.referrer || window.location.href)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setLoadingList(true)
    try {
      const { data, error: rpcErr } = await supabase.rpc('list_user_feedback', {
        p_status:       null,
        p_role_context: null,
        p_category:     null,
        p_limit:        50,
        p_offset:       0,
      })
      if (rpcErr) throw rpcErr
      if (!data?.success) throw new Error(data?.error || 'Failed to load history')
      setHistory(data.rows || [])
    } catch (err) {
      console.error('feedback history load error', err)
    } finally {
      setLoadingList(false)
    }
  }, [supabase])

  useEffect(() => { loadHistory() }, [loadHistory])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!subject.trim()) { setError('Subject is required'); return }
    if (!message.trim()) { setError('Message is required'); return }

    setSubmitting(true)
    try {
      const { data, error: rpcErr } = await supabase.rpc('submit_user_feedback', {
        p_role_context: 'provider',
        p_category:     category,
        p_subject:      subject.trim(),
        p_message:      message.trim(),
        p_rating:       rating > 0 ? rating : null,
        p_page_url:     pageUrl || null,
      })
      if (rpcErr) throw rpcErr
      if (!data?.success) throw new Error(data?.error || 'Failed to submit feedback')

      setSuccess('Thanks — your feedback has been submitted.')
      setSubject(''); setMessage(''); setRating(0); setCategory('improvement')
      await loadHistory()
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this feedback? This cannot be undone.')) return
    try {
      const { data, error: rpcErr } = await supabase.rpc('delete_user_feedback', {
        p_feedback_id: id,
      })
      if (rpcErr) throw rpcErr
      if (!data?.success) throw new Error(data?.error || 'Failed to delete')
      await loadHistory()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
          <MessageCircle className="text-green-600" size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Send Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tell us what's working, what's broken, or what would make running your shop easier.
          </p>
        </div>
      </div>

      {/* Submit card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6 mb-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
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
                      flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium
                      transition-all
                      ${active
                        ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-200'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Icon size={16} className={active ? 'text-green-600' : 'text-gray-400'} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How would you rate your experience? <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className="p-1 transition-transform hover:scale-110"
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
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

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1.5">
              Subject
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={120}
              placeholder="Short summary"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              required
            />
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1.5">
              Details
            </label>
            <textarea
              id="message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="What happened, what did you expect, or what would you like to see?"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              required
            />
            <div className="mt-1 text-xs text-gray-400 text-right">
              {message.length}/2000
            </div>
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
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700
                         disabled:bg-green-300 disabled:cursor-not-allowed
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

      {/* History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Your previous feedback</h2>
          <button
            onClick={loadHistory}
            disabled={loadingList}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                       text-green-700 bg-green-50 hover:bg-green-100
                       disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
                       rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {loadingList ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="animate-spin text-green-600" size={24} />
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
            <MessageCircle className="mx-auto text-gray-300 mb-2" size={32} />
            <p className="text-sm text-gray-500">You haven't sent any feedback yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(fb => <FeedbackRow key={fb.id} fb={fb} onDelete={handleDelete} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function FeedbackRow({ fb, onDelete }) {
  const cat = CATEGORIES.find(c => c.value === fb.category) || CATEGORIES[CATEGORIES.length - 1]
  const CatIcon = cat.icon
  const st = STATUS_LABELS[fb.status] || STATUS_LABELS.open
  const StIcon = st.icon
  const canDelete = fb.status === 'open'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
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
          {fb.rating && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
              {[...Array(fb.rating)].map((_, i) => (
                <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />
              ))}
            </span>
          )}
        </div>
        {canDelete && (
          <button
            onClick={() => onDelete(fb.id)}
            className="text-gray-400 hover:text-red-600 p-1 -m-1 transition-colors"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <h3 className="text-sm font-semibold text-gray-900 mb-1">{fb.subject}</h3>
      <p className="text-sm text-gray-600 whitespace-pre-wrap">{fb.message}</p>

      {fb.admin_response && (
        <div className="mt-3 pl-3 border-l-2 border-green-300 bg-green-50/40 py-2 px-3 rounded-r-lg">
          <p className="text-xs font-medium text-green-700 mb-0.5">
            Response from Carfix-Connect team
            {fb.reviewer_first_name && ` · ${fb.reviewer_first_name} ${fb.reviewer_last_name || ''}`.trim()}
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.admin_response}</p>
        </div>
      )}

      <div className="mt-3 text-xs text-gray-400">
        Submitted {new Date(fb.created_at).toLocaleString()}
      </div>
    </div>
  )
}