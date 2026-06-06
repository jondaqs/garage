'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send, Lock, MessageSquare, Loader2, AlertCircle } from 'lucide-react'

export default function CommentsTab({ workOrder }) {
  const supabase = createClient()

  const [comments, setComments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  const [content, setContent]     = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [currentProfileId, setCurrentProfileId] = useState(null)

  const loadComments = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('comments')
        .select(`
          id, content, comment_type, is_internal, created_at,
          author:user_profiles_secure!author_user_id(id, first_name, last_name)
        `)
        .eq('work_order_id', workOrder.id)
        .order('created_at', { ascending: true })
      if (err) throw err
      setComments(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [workOrder.id])

  useEffect(() => {
    loadComments()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('user_profiles_secure').select('id')
        .eq('auth_user_id', user.id).single()
        .then(({ data }) => setCurrentProfileId(data?.id))
    })
  }, [loadComments])

  const handleSend = async () => {
    if (!content.trim()) return
    setSending(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

      const { error: insertErr } = await supabase.from('comments').insert({
        work_order_id:  workOrder.id,
        author_user_id: profile.id,
        content:        content.trim(),
        is_internal:    isInternal,
        comment_type:   isInternal ? 'internal_note' : 'note',
      })
      if (insertErr) throw insertErr
      setContent('')
      await loadComments()
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const isTerminal = ['completed','cancelled','closed'].includes(workOrder.status?.code)

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
        {comments.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No comments yet.</p>
          </div>
        ) : (
          comments.map((c) => {
            const isMine = c.author?.id === currentProfileId
            return (
              <div key={c.id}
                className={`flex gap-3 ${isMine ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                  ${c.is_internal ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                  {c.author?.first_name?.[0]}{c.author?.last_name?.[0]}
                </div>
                <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className={`flex items-center gap-2 text-xs text-gray-500 ${isMine ? 'flex-row-reverse' : ''}`}>
                    <span className="font-medium text-gray-700">
                      {c.author?.first_name} {c.author?.last_name}
                    </span>
                    {c.is_internal && (
                      <span className="flex items-center gap-0.5 text-amber-600">
                        <Lock size={10} /> internal
                      </span>
                    )}
                    <span>{new Date(c.created_at).toLocaleTimeString('en-KE', {
                      hour: '2-digit', minute: '2-digit'
                    })}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed
                    ${c.is_internal
                      ? 'bg-amber-50 border border-amber-200 text-amber-900'
                      : isMine
                        ? 'bg-green-600 text-white rounded-tr-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                    }`}>
                    {c.content}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('en-KE', {
                      day: 'numeric', month: 'short'
                    })}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Input */}
      {!isTerminal && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setIsInternal(false)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !isInternal ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              Note
            </button>
            <button
              onClick={() => setIsInternal(true)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                isInternal ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              <Lock size={10} /> Internal only
            </button>
            <span className="text-xs text-gray-400">
              {isInternal ? 'Not visible to vehicle owner' : 'Visible to all parties'}
            </span>
          </div>
          <div className="flex gap-2">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={isInternal ? 'Internal note (provider only)...' : 'Add a comment...'}
              rows={2}
              className={`flex-1 px-3 py-2 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 ${
                isInternal
                  ? 'border-amber-300 focus:ring-amber-300 bg-amber-50'
                  : 'border-gray-300 focus:ring-green-400'
              }`}
            />
            <button
              onClick={handleSend}
              disabled={sending || !content.trim()}
              className="self-end p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex-shrink-0">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}