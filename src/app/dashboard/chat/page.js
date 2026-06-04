// → Drop this file at: src/app/dashboard/chat/page.js
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Send, MessageSquare, Search, Loader2,
  Building2, CheckCheck, Check, X, XCircle, AlertCircle, CheckCircle, RefreshCw
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
  const [refreshing,    setRefreshing]    = useState(false)

  const messagesEndRef = useRef(null)
  const channelRef     = useRef(null)
  const listChannelRef = useRef(null)
  const inputRef       = useRef(null)

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('user_profiles_secure').select('id, first_name, last_name')
        .eq('auth_user_id', user.id).single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  // ── Load conversations ────────────────────────────────────────────────────
  // Two flavours:
  //   • loadConversations(): used on mount; toggles loadingConvs so the list
  //     shows a spinner while the first fetch is in flight.
  //   • reloadConversationsSilent(): same query, but leaves loadingConvs alone.
  //     Used by realtime callbacks and the manual refresh button so the list
  //     doesn't flash a spinner every time a message arrives.
  const fetchConversations = useCallback(async () => {
    if (!profile) return null
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, updated_at, last_message_at, last_message_preview, user_unread_count, status,
        closed_at, closed_by:user_profiles!closed_by_id(id, first_name, last_name),
        provider:service_providers(id, name, is_verified)
      `)
      .eq('user_id', profile.id)
      .is('company_id', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
    return data || []
  }, [profile])

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    const data = await fetchConversations()
    if (data) setConversations(data)
    setLoadingConvs(false)
  }, [fetchConversations])

  const reloadConversationsSilent = useCallback(async () => {
    const data = await fetchConversations()
    if (data) setConversations(data)
  }, [fetchConversations])

  const handleManualRefresh = async () => {
    if (!profile || refreshing) return
    setRefreshing(true)
    await reloadConversationsSilent()
    setTimeout(() => setRefreshing(false), 350)
  }

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Realtime: keep the conversation list in sync without a page reload ───
  // Listen to ALL changes on conversations the current user owns. UPDATE
  // events deliver the new row, so we patch in place to avoid a refetch.
  // INSERT/DELETE are rare and need joined data we can't get from the
  // payload — fall back to a silent refetch.
  useEffect(() => {
    if (!profile?.id) return
    if (listChannelRef.current) supabase.removeChannel(listChannelRef.current)

    listChannelRef.current = supabase
      .channel(`dashboard-chat-list-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `user_id=eq.${profile.id}`,
      }, payload => {
        const updated = payload.new
        setConversations(prev => {
          // Personal-chat surface only — ignore company conversations even if
          // they share a user_id with the caller.
          if (updated.company_id) return prev
          if (!prev.some(c => c.id === updated.id)) return prev
          return prev.map(c => c.id === updated.id ? { ...c, ...updated } : c)
            .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
        })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `user_id=eq.${profile.id}`,
      }, () => reloadConversationsSilent())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'conversations',
        filter: `user_id=eq.${profile.id}`,
      }, payload => {
        const deletedId = payload.old?.id
        if (!deletedId) return
        setConversations(prev => prev.filter(c => c.id !== deletedId))
      })
      .subscribe()

    return () => {
      if (listChannelRef.current) supabase.removeChannel(listChannelRef.current)
    }
  }, [profile?.id, reloadConversationsSilent])

  // ── Auto-open or create conversation from ?provider= param ───────────────
  useEffect(() => {
    const providerId = searchParams.get('provider')
    if (!providerId || !profile) return
    openOrCreateConversation(providerId)
  }, [searchParams, profile])

  const openOrCreateConversation = async (providerId) => {
    // Check existing — strictly the personal (non-company) chat with this
    // provider. If the user has only a company chat with this provider, this
    // returns nothing and we create a new personal chat below.
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', profile.id)
      .eq('service_provider_id', providerId)
      .is('company_id', null)
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
      .select(`
        id, body, sender_id, sender_role, created_at, is_read,
        sender:user_profiles!sender_id(id, first_name, last_name)
      `)
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
      }, async payload => {
        const msg = payload.new
        // Realtime payloads don't include joins; hydrate sender separately so
        // the name label has data to render.
        let sender = null
        if (msg.sender_id) {
          const { data: s } = await supabase
            .from('user_profiles_secure')
            .select('id, first_name, last_name')
            .eq('id', msg.sender_id)
            .maybeSingle()
          sender = s
        }
        const enriched = { ...msg, sender }
        setMessages(prev => {
          if (prev.some(m => m.id === enriched.id)) return prev
          return [...prev, enriched]
        })
        // ── Mark inbound message as read AND clear the user unread counter ──
        // The provider's send_message_to_user RPC bumps user_unread_count
        // immediately after inserting the message. If the customer has the
        // conversation open we don't want that bump to surface — they're
        // looking at it. Both DB updates are fire-and-forget; we also
        // optimistically zero the counter in local state so the badge
        // doesn't flicker between the provider's bump arriving and our
        // zero landing.
        if (msg.sender_role === 'provider' || msg.sender_role === 'company') {
          supabase.from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', msg.id)
            .then(({ error }) => { if (error) console.error('mark message read failed:', error) })
          supabase.from('conversations')
            .update({ user_unread_count: 0 })
            .eq('id', activeConv.id)
            .then(({ error }) => { if (error) console.error('reset user_unread_count failed:', error) })
          setConversations(prev => prev.map(c =>
            c.id === activeConv.id ? { ...c, user_unread_count: 0 } : c
          ))
          setActiveConv(prev => prev ? { ...prev, user_unread_count: 0 } : prev)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `id=eq.${activeConv.id}`,
      }, payload => {
        const updated = payload.new
        // Force user_unread_count to 0 for the active conversation. The
        // provider's send_message_to_user RPC bumps this counter as part of
        // the same write that inserts a message; that bump's UPDATE event
        // can race ahead of our own reset and would otherwise re-light the
        // badge for a conversation that's open and being read. Our INSERT
        // handler above is what does the authoritative DB reset; this local
        // override just keeps the rendered state truthful in between.
        const sanitised = { ...updated, user_unread_count: 0 }
        setActiveConv(prev => ({ ...prev, ...sanitised }))
        setConversations(prev =>
          prev.map(c => c.id === activeConv.id ? { ...c, ...sanitised } : c)
        )
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
      sender: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name },
    }
    setMessages(prev => [...prev, optimistic])

    // Atomic RPC: inserts message with sender_role='user', updates conversation
    // preview/timestamp, and bumps provider_unread_count — all server-side.
    const { data: msg, error } = await supabase.rpc('send_message_to_provider', {
      p_conversation_id: activeConv.id,
      p_body:            text,
      p_as_company:      false,
    })

    if (error || !msg) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setBody(text)
    } else {
      // Hydrate sender on the returned row so renderers that show name labels
      // have it without a follow-up query.
      const enriched = {
        ...msg,
        sender: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name },
      }
      setMessages(prev => prev.map(m => m.id === optimistic.id ? enriched : m))
      const preview = text.length > 60 ? text.slice(0, 60) + '…' : text
      setConversations(prev => prev.map(c =>
        c.id === activeConv.id
          ? { ...c, last_message_at: msg.created_at, last_message_preview: preview }
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
            <div className="flex items-center gap-3">
              {conversations.length > 0 && (
                <span className="text-xs text-gray-400">{conversations.length} chat{conversations.length !== 1 ? 's' : ''}</span>
              )}
              {/* Manual refresh — realtime keeps the list updated on its own,
                  but this is a "force pull" escape hatch for cases where the
                  realtime subscription drops (flaky mobile networks, etc). */}
              <button
                onClick={handleManualRefresh}
                disabled={refreshing || !profile}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Refresh conversations"
                aria-label="Refresh conversations"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
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
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2">
                <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 leading-snug">
                  <p className="font-medium">This conversation is closed. Reopen it to send new messages.</p>
                  {(activeConv.closed_at || activeConv.closed_by) && (
                    <p className="text-[11px] text-amber-600/80 mt-0.5">
                      Closed
                      {activeConv.closed_by && (
                        <> by <span className="font-medium">
                          {`${activeConv.closed_by.first_name || ''} ${activeConv.closed_by.last_name || ''}`.trim() || 'someone'}
                        </span></>
                      )}
                      {activeConv.closed_at && (
                        <> on {new Date(activeConv.closed_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </p>
                  )}
                </div>
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
                  // Label above incoming messages on the first of a same-sender run.
                  // Outgoing (own) messages don't get a label.
                  const showSenderLabel =
                    !isUser &&
                    (showDate || !prevMsg || prevMsg.sender_id !== msg.sender_id || prevMsg.sender_role !== msg.sender_role)
                  const senderName = (() => {
                    const personName = `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim()
                    const providerName = activeConv.provider?.name
                    if (personName && providerName) return `${personName} · ${providerName}`
                    return personName || providerName || 'Service Provider'
                  })()

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
                          {showSenderLabel && (
                            <span className="text-[11px] font-semibold text-gray-500 mb-0.5 ml-1">
                              {senderName}
                            </span>
                          )}
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