'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Read-only Comments card for the customer-side work-order pages.
 *
 * Uses the get_customer_comments RPC (SECURITY DEFINER) which enforces
 * is_internal = false at the database level, regardless of the caller's
 * other roles. This prevents a user who is both a company member AND a
 * provider team member from seeing internal provider notes on customer
 * pages.
 *
 * Collapsed by default. Hidden entirely if zero comments.
 */
export default function CustomerCommentsCard({ workOrderId }) {
  const supabase = createClient()
  const [comments, setComments] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [{ data, error }, { data: unread }] = await Promise.all([
          supabase.rpc('get_customer_comments', { p_work_order_id: workOrderId }),
          supabase.rpc('get_unread_comment_count', { p_work_order_id: workOrderId }),
        ])
        if (cancelled) return
        if (error) {
          console.warn('CustomerCommentsCard RPC error:')
          setComments([])
        } else if (data?.success) {
          setComments(data.comments || [])
        } else {
          console.warn('CustomerCommentsCard:', data?.error)
          setComments([])
        }
        setUnreadCount(unread || 0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (workOrderId) load()
    return () => { cancelled = true }
  }, [workOrderId, supabase])

  const handleExpand = () => {
    const opening = !expanded
    setExpanded(opening)
    if (opening && unreadCount > 0) {
      setUnreadCount(0)
      supabase.rpc('mark_comments_read', { p_work_order_id: workOrderId }).catch(() => {})
    }
  }

  if (loading) return null
  if (comments.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={handleExpand}
        aria-expanded={expanded}
        className="w-full px-5 py-3 border-b border-gray-100 flex items-center gap-2 hover:bg-gray-50 transition-colors"
      >
        <MessageSquare className="text-blue-500 flex-shrink-0" size={16} />
        <p className="font-semibold text-gray-900 text-sm flex-1 text-left">
          Notes from your provider ({comments.length})
        </p>
        {unreadCount > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">
            {unreadCount} new
          </span>
        )}
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
                  {c.author_name}
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