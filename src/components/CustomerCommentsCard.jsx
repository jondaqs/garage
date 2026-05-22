'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Read-only Comments card for the customer-side work-order pages.
 *
 * Renders comments the provider has shared on this work order. RLS
 * (see migration `comments_select_widen.sql`) ensures only non-internal
 * comments come back for customer-side callers — we don't filter
 * `is_internal` client-side because the server already enforces it.
 *
 * Collapsed by default. Customers won't usually need to read these on
 * every page load, and keeping the page short matters more than always
 * showing every byte. The list is only fetched once.
 *
 * If the query returns zero rows the card is hidden entirely — we don't
 * want to render an empty collapsible header that opens to nothing.
 *
 * The card is intentionally simple: no replies, no posting, no
 * editing — just a chronological list. Customer-side authorship can
 * be a follow-up if needed; the back-end insert policy currently
 * requires author = current user, which would let it work as soon as
 * a UI is added.
 */
export default function CustomerCommentsCard({ workOrderId }) {
  const supabase = createClient()
  const [comments, setComments] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data, error } = await supabase
          .from('comments')
          .select(`
            id, content, created_at,
            author:user_profiles!author_user_id(first_name, last_name)
          `)
          .eq('work_order_id', workOrderId)
          .order('created_at', { ascending: true })
        if (cancelled) return
        if (error) {
          // Silently degrade — a customer not seeing this card is far
          // better than a red error banner over what should be a calm
          // status page. Logged for the dev console.
          console.warn('CustomerCommentsCard load error:', error.message)
          setComments([])
        } else {
          setComments(data || [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (workOrderId) load()
    return () => { cancelled = true }
  }, [workOrderId, supabase])

  // While the first fetch is in flight, render nothing rather than a
  // skeleton header. The card is collapsed by default; an extra header
  // that may disappear if there are zero rows would just be visual noise.
  if (loading) return null
  if (comments.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full px-5 py-3 border-b border-gray-100 flex items-center gap-2 hover:bg-gray-50 transition-colors"
      >
        <MessageSquare className="text-blue-500 flex-shrink-0" size={16} />
        <p className="font-semibold text-gray-900 text-sm flex-1 text-left">
          Notes from your provider ({comments.length})
        </p>
        {expanded
          ? <ChevronUp   size={16} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="p-3 space-y-3">
          {comments.map(c => (
            <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-700">
                  {c.author?.first_name} {c.author?.last_name}
                </span>
                <span className="text-[11px] text-gray-400">
                  {new Date(c.created_at).toLocaleString('en-KE', {
                    day:   'numeric',
                    month: 'short',
                    year:  'numeric',
                    hour:  '2-digit',
                    minute:'2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-line">{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}