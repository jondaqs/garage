'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageSquare, Loader2 } from 'lucide-react'

/**
 * Read-only Comments card for the customer-side work-order pages.
 *
 * Renders comments the provider has shared on this work order. RLS
 * (see migration `comments_select_widen.sql`) ensures only non-internal
 * comments come back for customer-side callers — we don't filter
 * `is_internal` client-side because the server already enforces it.
 *
 * If the query returns zero rows the card is hidden entirely. We don't
 * want to clutter a customer's view with an empty section.
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <MessageSquare className="text-gray-400 flex-shrink-0" size={16} />
          <p className="font-semibold text-gray-900 text-sm">Notes from your provider</p>
        </div>
        <div className="p-6 flex justify-center">
          <Loader2 className="animate-spin text-gray-300" size={20} />
        </div>
      </div>
    )
  }

  // Hide the card entirely when there's nothing to show. A customer with
  // a quiet provider shouldn't see an "empty" comments box.
  if (comments.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <MessageSquare className="text-blue-500 flex-shrink-0" size={16} />
        <p className="font-semibold text-gray-900 text-sm">
          Notes from your provider ({comments.length})
        </p>
      </div>
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
    </div>
  )
}