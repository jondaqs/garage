'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Send, MessageSquare, Search, Loader2,
  Building2, CheckCheck, Check, X, XCircle, AlertCircle, CheckCircle
} from 'lucide-react'

export default function ChatPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [profile,       setProfile]       = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConv,    setActiveConv]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [body,          setBody]          = useState('')
  const [sending,       setSending]       = useState(false)
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [convSearch,    setConvSearch]    = useState('')
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [closingConv,   setClosingConv]   = useState(false)

  const messagesEndRef = useRef(null)
  const channelRef     = useRef(null)
  const inputRef       = useRef(null)

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('user_profiles').select('id, first_name, last_name')
        .eq('auth_user_id', user.id).single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  // ── Load conversations ────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!profile) return
    setLoadingConvs(true)
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, updated_at, last_message_at, last_message_preview, user_unread_count, status,
        provider:service_providers(id, name, is_verified)
      `)
      .eq('user_id', profile.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
    setConversations(data || [])
    setLoadingConvs(false)
  }, [profile])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Auto-open or create conversation from ?provider= param ───────────────
  useEffect(() => {
    const providerId = searchParams.get('provider')
    if (!providerId || !profile) return
    openOrCreateConversation(providerId)
  }, [searchParams, profile])

  const openOrCreateConversation = async (providerId) => {
    // Check existing
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', profile.id)
      .eq('service_provider_id', providerId)
      .maybeSingle()

    if (existing) {
      selectConversation(existing.id)
    } else {
      // Create new
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({ user_id: profile.id, service_provider_id: providerId })
        .select(`id, updated_at, last_message_at, last_message_preview, user_unread_count,
          provider:service_providers(id, name, is_verified)`)
        .single()
      if (!error && newConv) {
        setConversations(prev => [newConv, ...prev])
        selectConversation(newConv.id, newConv)
      }
    }
  }

  // ── Select conversation + load messages ───────────────────────────────────
  const selectConversation = useCallback(async (convId, convObj = null) => {
    if (activeConv?.id === convId) return
    setLoadingMsgs(true)
    setMessages([])
    setMobileShowChat(true)

    const conv = convObj || conversations.find(c => c.id === convId)
    setActiveConv(conv || { id: convId })

    const { data: msgs } = await supabase
      .from('messages')
      .select('id, body, sender_id, sender_role, created_at, is_read')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(msgs || [])
    setLoadingMsgs(false)

    // Mark user messages as read
    await supabase.from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('sender_role', 'provider')
      .eq('is_read', false)

    // Reset unread count
    await supabase.from('conversations')
      .update({ user_unread_count: 0 })
      .eq('id', convId)

    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, user_unread_count: 0 } : c
    ))

    inputRef.current?.focus()
  }, [activeConv, conversations])

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConv?.id) return

    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel(`messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, payload => {
        const msg = payload.new
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        // Mark as read if from provider
        if (msg.sender_role === 'provider') {
          supabase.from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', msg.id)
        }
      })
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [activeConv?.id])

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!body.trim() || !activeConv || !profile || sending) return
    setSending(true)
    const text = body.trim()
    setBody('')

    // Optimistic
    const optimistic = {
      id: `opt-${Date.now()}`, body: text,
      sender_id: profile.id, sender_role: 'user',
      created_at: new Date().toISOString(), is_read: false,
    }
    setMessages(prev => [...prev, optimistic])

    const { data: msg, error } = await supabase.from('messages').insert({
      conversation_id: activeConv.id,
      sender_id:       profile.id,
      sender_role:     'user',
      body:            text,
    }).select().single()

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setBody(text)
    } else {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? msg : m))
      // Update conversation preview
      await supabase.from('conversations').update({
        last_message_at:      msg.created_at,
        last_message_preview: text.length > 60 ? text.slice(0, 60) + '…' : text,
        provider_unread_count: supabase.rpc ? undefined : undefined,
      }).eq('id', activeConv.id)
      setConversations(prev => prev.map(c =>
        c.id === activeConv.id
          ? { ...c, last_message_at: msg.created_at, last_message_preview: text.slice(0, 60) }
          : c
      ).sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at)))

      // In-app notification to provider
      try {
        await fetch(`/api/chat/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId:    activeConv.id,
            messageId:         msg.id,
            senderName:        `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
            preview:           text.slice(0, 80),
          }),
        })
      } catch (_) {}
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const toggleClosed = async () => {
    if (!activeConv || !profile) return
    setClosingConv(true)
    const isOpen = activeConv.status !== 'closed'
    const update = isOpen
      ? { status: 'closed', closed_at: new Date().toISOString(), closed_by_id: profile.id }
      : { status: 'open',   closed_at: null,                     closed_by_id: null }
    await supabase.from('conversations').update(update).eq('id', activeConv.id)
    const updated = { ...activeConv, ...update }
    setActiveConv(updated)
    setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, ...update } : c))
    setClosingConv(false)
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const filteredConvs = conversations.filter(c =>
    !convSearch || c.provider?.name?.toLowerCase().includes(convSearch.toLowerCase())
  )

  const formatTime = dt => {
    const d = new Date(dt)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">

      {/* ── Conversation list (sidebar) ───────────────────────────────────── */}
      <div className={`w-full sm:w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
        ${mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>

        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Messages</h2>
            {conversations.length > 0 && (
              <span className="text-xs text-gray-400">{conversations.length} chat{conversations.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={convSearch}
              onChange={e => setConvSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-300" size={24} />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <MessageSquare size={40} className="text-gray-200 mb-3" />
              <p className="text-gray-500 text-sm font-medium">No conversations yet</p>
              <p className="text-gray-400 text-xs mt-1">
                Find a service provider and tap Chat to start
              </p>
              <button onClick={() => router.push('/dashboard/providers')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
                Find Providers
              </button>
            </div>
          ) : (
            filteredConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id, conv)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  activeConv?.id === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {conv.provider?.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800 truncate">{conv.provider?.name}</p>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {conv.status === 'closed' && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">closed</span>
                      )}
                      {conv.last_message_at && (
                        <span className="text-[11px] text-gray-400">
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {conv.last_message_preview || 'Start a conversation'}
                  </p>
                </div>
                {conv.user_unread_count > 0 && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {conv.user_unread_count > 9 ? '9+' : conv.user_unread_count}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0
        ${!mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>

        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
            <MessageSquare size={56} className="text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">Select a conversation</p>
            <p className="text-gray-300 text-sm mt-1">or find a provider to start chatting</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setMobileShowChat(false)}
                className="sm:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {activeConv.provider?.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {activeConv.provider?.name || 'Service Provider'}
                </p>
                <p className={`text-xs ${activeConv.status === 'closed' ? 'text-red-500' : 'text-green-500'}`}>
                  {activeConv.status === 'closed' ? '● Closed' : '● Open'}
                </p>
              </div>
              <button
                onClick={toggleClosed}
                disabled={closingConv}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                  activeConv.status === 'closed'
                    ? 'bg-green-50 text-green-700 hover:bg-green-100'
                    : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
              >
                {closingConv
                  ? <Loader2 size={12} className="animate-spin" />
                  : activeConv.status === 'closed'
                    ? <><CheckCircle size={12} /> Reopen</>
                    : <><XCircle size={12} /> Close chat</>
                }
              </button>
              <button
                onClick={() => router.push(`/dashboard/providers/${activeConv.provider?.id}`)}
                className="text-xs text-blue-600 hover:underline px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                View profile
              </button>
            </div>

            {/* Closed banner */}
            {activeConv.status === 'closed' && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  This conversation is closed. Reopen it to send new messages.
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-gray-300" size={24} />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center pb-8">
                  <MessageSquare size={36} className="text-gray-200 mb-3" />
                  <p className="text-gray-400 text-sm">No messages yet</p>
                  <p className="text-gray-300 text-xs mt-1">Say hello to get started</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isUser = msg.sender_role === 'user'
                  const prevMsg = messages[i - 1]
                  const showDate = !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString()

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex items-center justify-center my-3">
                          <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                            {new Date(msg.created_at).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isUser
                              ? 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                          }`}>
                            {msg.body}
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isUser && (
                              msg.is_read
                                ? <CheckCheck size={12} className="text-blue-400" />
                                : <Check size={12} className="text-gray-300" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
              {activeConv.status === 'closed' ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                  <XCircle size={15} />
                  Conversation closed — reopen to send messages
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder="Type a message…"
                      rows={1}
                      className="flex-1 resize-none px-4 py-2.5 text-sm bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all max-h-32"
                      style={{ minHeight: '42px' }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!body.trim() || sending}
                      className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      {sending
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Send size={16} />
                      }
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}