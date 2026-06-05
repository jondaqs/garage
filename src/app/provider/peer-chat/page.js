// → Drop this file at: src/app/provider/peer-chat/page.js
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Send, MessageSquare, Search, Loader2, CheckCheck, Check,
  ArrowLeft, XCircle, CheckCircle, AlertCircle, RefreshCw, Building2, BadgeCheck
} from 'lucide-react'

// Provider-to-provider chat (owner / single-provider context).
// Reads/writes only peer_conversations / peer_messages — completely separate
// from the customer-chat surface at /provider/chat.

export default function ProviderPeerChatPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [profile,       setProfile]       = useState(null)
  const [provider,      setProvider]      = useState(null)
  const [canChat,       setCanChat]       = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConv,    setActiveConv]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [body,          setBody]          = useState('')
  const [sending,       setSending]       = useState(false)
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [convSearch,    setConvSearch]    = useState('')
  const [statusFilter,  setStatusFilter]  = useState('open')
  const [closingConv,   setClosingConv]   = useState(false)
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)

  const messagesEndRef = useRef(null)
  const msgChannelRef  = useRef(null)
  const listChannelInitRef  = useRef(null)
  const listChannelRecipRef = useRef(null)
  const inputRef       = useRef(null)
  // Mirror of activeConv?.id so decorate() and realtime handlers can know
  // the current selection without being re-bound on every selection.
  const activeConvIdRef = useRef(null)

  // ── Load profile + provider + permissions ────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('user_profiles_secure')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single()
      setProfile(prof)
      if (!prof) return

      const { data: owned } = await supabase
        .from('service_providers_secure')
        .select('id, name')
        .eq('owner_user_id', prof.id)
        .maybeSingle()
      if (owned) {
        setProvider(owned)
        setCanChat(true)
        return
      }

      const { data: spu } = await supabase
        .from('service_provider_users')
        .select('service_provider_id, can_chat, service_providers_secure(id, name)')
        .eq('user_id', prof.id)
        .eq('is_active', true)
        .maybeSingle()
      if (spu) {
        setProvider(spu.service_providers)
        setCanChat(!!spu.can_chat)
        return
      }

      const { data: mech } = await supabase
        .from('mechanics')
        .select('service_provider_id, can_chat, service_providers_secure(id, name)')
        .eq('user_id', prof.id)
        .eq('is_active', true)
        .maybeSingle()
      if (mech) {
        setProvider(mech.service_providers)
        setCanChat(!!mech.can_chat)
      }
    }
    init()
  }, [])

  // ── Decoration ──
  // For each row, figure out which side this provider is on so the UI can
  // show the right "other party" name and the right unread counter. If the
  // row IS the conversation the user is currently looking at, force the
  // counter to 0 — they're seeing the messages in real time.
  const decorate = useCallback((row) => {
    if (!provider?.id) return row
    const isInitiator = row.initiator_provider_id === provider.id
    const rawUnread = isInitiator ? (row.initiator_unread_count || 0) : (row.recipient_unread_count || 0)
    const isActive  = activeConvIdRef.current === row.id
    return {
      ...row,
      role:        isInitiator ? 'initiator' : 'recipient',
      unreadCount: isActive ? 0 : rawUnread,
      otherProvider: isInitiator ? row.recipient : row.initiator,
    }
  }, [provider?.id])

  // ── Load conversations ────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!provider?.id) return null

    const baseSelect = `
      id, status, closed_at,
      last_message_at, last_message_preview, updated_at, created_at,
      initiator_provider_id, recipient_provider_id,
      initiator_unread_count, recipient_unread_count,
      closed_by:user_profiles!closed_by_id(id, first_name, last_name),
      initiator:service_providers!initiator_provider_id(id, name, is_verified),
      recipient:service_providers!recipient_provider_id(id, name, is_verified)
    `

    let qInit  = supabase.from('peer_conversations').select(baseSelect)
      .eq('initiator_provider_id', provider.id)
    let qRecip = supabase.from('peer_conversations').select(baseSelect)
      .eq('recipient_provider_id', provider.id)

    if (statusFilter !== 'all') {
      qInit  = qInit.eq('status',  statusFilter)
      qRecip = qRecip.eq('status', statusFilter)
    }

    const [{ data: r1 }, { data: r2 }] = await Promise.all([qInit, qRecip])
    const merged = [...(r1 || []), ...(r2 || [])]
      .reduce((acc, c) => acc.find(x => x.id === c.id) ? acc : [...acc, c], [])
      .sort((a, b) =>
        new Date(b.last_message_at || b.updated_at || 0) -
        new Date(a.last_message_at || a.updated_at || 0)
      )
    return merged.map(decorate)
  }, [provider?.id, statusFilter, decorate])

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
    if (!provider?.id || refreshing) return
    setRefreshing(true)
    await reloadConversationsSilent()
    setTimeout(() => setRefreshing(false), 350)
  }

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Realtime: list ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!provider?.id) return
    if (listChannelInitRef.current)  supabase.removeChannel(listChannelInitRef.current)
    if (listChannelRecipRef.current) supabase.removeChannel(listChannelRecipRef.current)

    listChannelInitRef.current = supabase
      .channel(`peer-list-init-${provider.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'peer_conversations',
        filter: `initiator_provider_id=eq.${provider.id}`,
      }, () => reloadConversationsSilent())
      .subscribe()

    listChannelRecipRef.current = supabase
      .channel(`peer-list-recip-${provider.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'peer_conversations',
        filter: `recipient_provider_id=eq.${provider.id}`,
      }, () => reloadConversationsSilent())
      .subscribe()

    return () => {
      if (listChannelInitRef.current)  supabase.removeChannel(listChannelInitRef.current)
      if (listChannelRecipRef.current) supabase.removeChannel(listChannelRecipRef.current)
    }
  }, [provider?.id, statusFilter, reloadConversationsSilent])

  // ── Auto-open from ?conversation= ──
  useEffect(() => {
    const convId = searchParams.get('conversation')
    if (!convId || !conversations.length) return
    const conv = conversations.find(c => c.id === convId)
    if (conv) selectConversation(conv.id, conv)
  }, [searchParams, conversations])

  // ── Select conversation ──
  const selectConversation = useCallback(async (convId, convObj = null) => {
    if (activeConv?.id === convId) return
    setLoadingMsgs(true)
    setMessages([])
    setMobileShowChat(true)

    const conv = convObj || conversations.find(c => c.id === convId)
    setActiveConv(conv || { id: convId })

    const { data: msgs } = await supabase
      .from('peer_messages')
      .select(`
        id, body, sender_id, sender_provider_id, created_at, is_read,
        sender:user_profiles!sender_id(id, first_name, last_name)
      `)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(msgs || [])
    setLoadingMsgs(false)

    await supabase.rpc('mark_peer_conversation_read', { p_conversation_id: convId })

    setConversations(prev => prev.map(c =>
      c.id === convId
        ? { ...c, unreadCount: 0,
            initiator_unread_count: c.role === 'initiator' ? 0 : c.initiator_unread_count,
            recipient_unread_count: c.role === 'recipient' ? 0 : c.recipient_unread_count }
        : c
    ))
    inputRef.current?.focus()
  }, [activeConv, conversations])

  // ── Realtime: messages in active conv ──
  useEffect(() => {
    if (!activeConv?.id) return
    if (msgChannelRef.current) supabase.removeChannel(msgChannelRef.current)

    msgChannelRef.current = supabase
      .channel(`peer-messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'peer_messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, async payload => {
        const msg = payload.new
        let sender = null
        if (msg.sender_id) {
          const { data: s } = await supabase
            .from('user_profiles_secure')
            .select('id, first_name, last_name')
            .eq('id', msg.sender_id)
            .maybeSingle()
          sender = s
        }
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, { ...msg, sender }])

        // If this message came from the OTHER side and the chat is open,
        // mark the conversation read immediately — otherwise the counter
        // would grow while the user is staring at the chat. The RPC is a
        // no-op for own messages, but we still skip those here to avoid
        // the round-trip.
        if (msg.sender_provider_id !== provider?.id) {
          supabase.rpc('mark_peer_conversation_read', { p_conversation_id: activeConv.id })
            .then(({ error }) => { if (error) console.error('mark_peer_conversation_read failed:', error) })
          // Optimistic local zero so the badge clears immediately, before
          // the realtime UPDATE on peer_conversations arrives.
          setConversations(prev => prev.map(c => c.id === activeConv.id
            ? {
                ...c,
                unreadCount: 0,
                initiator_unread_count: c.role === 'initiator' ? 0 : c.initiator_unread_count,
                recipient_unread_count: c.role === 'recipient' ? 0 : c.recipient_unread_count,
              }
            : c))
        }
      })
      .subscribe()

    return () => {
      if (msgChannelRef.current) supabase.removeChannel(msgChannelRef.current)
    }
  }, [activeConv?.id, provider?.id])

  useEffect(() => {
    activeConvIdRef.current = activeConv?.id || null
  }, [activeConv?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──
  const sendMessage = async () => {
    if (!body.trim() || !activeConv || !profile || sending || !canChat) return
    if (activeConv.status === 'closed') return
    setSending(true)
    const text = body.trim()
    setBody('')

    const optimistic = {
      id: `opt-${Date.now()}`, body: text,
      sender_id: profile.id, sender_provider_id: provider?.id,
      created_at: new Date().toISOString(), is_read: false,
      sender: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name },
    }
    setMessages(prev => [...prev, optimistic])

    const { data: msg, error } = await supabase.rpc('send_peer_message', {
      p_conversation_id: activeConv.id,
      p_body:            text,
    })

    if (error || !msg) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setBody(text)
      console.error('send_peer_message failed:', error)
    } else {
      const enriched = {
        ...msg,
        sender: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name },
      }
      setMessages(prev => prev.map(m => m.id === optimistic.id ? enriched : m))
      const preview = text.length > 60 ? text.slice(0, 60) + '…' : text
      setConversations(prev =>
        prev.map(c => c.id === activeConv.id
          ? { ...c, last_message_at: msg.created_at, last_message_preview: preview }
          : c
        ).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
      )
    }
    setSending(false)
    inputRef.current?.focus()
  }

  // ── Close / reopen ──
  const toggleClosed = async () => {
    if (!activeConv || !canChat) return
    setClosingConv(true)
    const next = activeConv.status === 'open' ? 'closed' : 'open'
    const { data: row, error } = await supabase.rpc('toggle_peer_conversation_status', {
      p_conversation_id: activeConv.id,
      p_status:          next,
    })
    if (!error && row) {
      const updated = { ...activeConv, ...row }
      setActiveConv(updated)
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, ...row } : c))
    } else if (error) {
      console.error('toggle_peer_conversation_status failed:', error)
    }
    setClosingConv(false)
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const formatTime = dt => {
    const d = new Date(dt), now = new Date()
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
  }

  const filteredConvs = conversations.filter(c => {
    if (!convSearch) return true
    return (c.otherProvider?.name || '').toLowerCase().includes(convSearch.toLowerCase())
  })

  const unreadTotal = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0)

  if (!canChat && !loadingConvs) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8 text-center">
        <AlertCircle size={48} className="text-gray-300 mb-4" />
        <p className="text-gray-500 font-medium">Chat access not enabled</p>
        <p className="text-gray-400 text-sm mt-1">Your account does not have chat permissions. Contact your provider owner.</p>
      </div>
    )
  }

  const otherName = activeConv?.otherProvider?.name || 'Provider'
  const otherVerified = !!activeConv?.otherProvider?.is_verified

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">

      {/* List */}
      <div className={`w-full sm:w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
        ${mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>

        <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Provider Chats</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Peer-to-peer collaboration</p>
            </div>
            <div className="flex items-center gap-2">
              {unreadTotal > 0 && (
                <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-xs font-bold">
                  {unreadTotal} new
                </span>
              )}
              <button onClick={handleManualRefresh} disabled={refreshing || !provider?.id}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-40 transition-colors"
                title="Refresh" aria-label="Refresh conversations">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="flex gap-1 mb-3">
            {['open','closed','all'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {s}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={convSearch} onChange={e => setConvSearch(e.target.value)}
              placeholder="Search providers…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-gray-300" size={24} />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <Building2 size={36} className="text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm">No conversations yet</p>
              <button onClick={() => router.push('/provider/providers')}
                className="mt-4 text-xs text-green-700 hover:underline font-medium">
                Find a provider →
              </button>
            </div>
          ) : (
            filteredConvs.map(conv => (
              <button key={conv.id} onClick={() => selectConversation(conv.id, conv)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  activeConv?.id === conv.id ? 'bg-green-50 border-l-2 border-l-green-500' : ''
                }`}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white flex-shrink-0">
                  <Building2 size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {conv.otherProvider?.name || 'Provider'}
                      </p>
                      {conv.otherProvider?.is_verified && (
                        <BadgeCheck size={12} className="text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {conv.status === 'closed' && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">closed</span>
                      )}
                      {conv.last_message_at && (
                        <span className="text-[11px] text-gray-400">{formatTime(conv.last_message_at)}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {conv.last_message_preview || 'No messages yet'}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>

        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
            <Building2 size={56} className="text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">Select a conversation</p>
            <button onClick={() => router.push('/provider/providers')}
              className="mt-3 text-sm text-green-700 hover:underline font-medium">
              or find a new provider to chat with →
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setMobileShowChat(false)}
                className="sm:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <ArrowLeft size={18} />
              </button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white flex-shrink-0">
                <Building2 size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{otherName}</p>
                  {otherVerified && <BadgeCheck size={14} className="text-green-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">
                    Provider
                  </span>
                  <p className={`text-xs ${activeConv.status === 'closed' ? 'text-red-500' : 'text-green-600'}`}>
                    {activeConv.status === 'closed' ? '● Closed' : '● Open'}
                  </p>
                </div>
              </div>
              <button onClick={toggleClosed} disabled={closingConv || !canChat}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
                  activeConv.status === 'closed'
                    ? 'bg-green-50 text-green-700 hover:bg-green-100'
                    : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}>
                {closingConv
                  ? <Loader2 size={12} className="animate-spin" />
                  : activeConv.status === 'closed'
                    ? <><CheckCircle size={12} /> Reopen</>
                    : <><XCircle size={12} /> Close chat</>
                }
              </button>
            </div>

            {activeConv.status === 'closed' && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2">
                <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 leading-snug">
                  <p className="font-medium">This conversation is closed. Reopen it to send messages.</p>
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

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {loadingMsgs ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-gray-300" size={24} />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center pb-8">
                  <MessageSquare size={36} className="text-gray-200 mb-3" />
                  <p className="text-gray-400 text-sm">No messages yet</p>
                  <p className="text-gray-300 text-xs mt-1">Send the first message to {otherName}</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMyProvider = msg.sender_provider_id === provider?.id
                  const isMine       = msg.sender_id === profile?.id
                  const prev = messages[i - 1]
                  const showDate = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString()
                  const showSenderLabel =
                    !isMine &&
                    (showDate || !prev || prev.sender_id !== msg.sender_id)
                  const personName = `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim()
                  const senderLabel = isMyProvider
                    ? (personName || 'Coworker')
                    : (personName ? `${personName} · ${otherName}` : otherName)

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-3">
                          <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                            {new Date(msg.created_at).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isMyProvider ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] flex flex-col ${isMyProvider ? 'items-end' : 'items-start'}`}>
                          {showSenderLabel && (
                            <span className="text-[11px] font-semibold text-gray-500 mb-0.5 ml-1">
                              {senderLabel}
                            </span>
                          )}
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isMyProvider
                              ? (isMine
                                  ? 'bg-green-600 text-white rounded-br-sm'
                                  : 'bg-green-100 text-green-900 rounded-br-sm')
                              : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                          }`}>
                            {msg.body}
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 ${isMyProvider ? 'flex-row-reverse' : ''}`}>
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMine && (
                              msg.is_read
                                ? <CheckCheck size={12} className="text-green-400" />
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

            <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
              {activeConv.status === 'closed' ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                  <XCircle size={15} />
                  Conversation closed — reopen to reply
                </div>
              ) : !canChat ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                  <AlertCircle size={15} />
                  You don't have permission to send messages
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder={`Message ${otherName}…`}
                      rows={1}
                      className="flex-1 resize-none px-4 py-2.5 text-sm bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all max-h-32"
                      style={{ minHeight: '42px' }}
                    />
                    <button onClick={sendMessage} disabled={!body.trim() || sending}
                      className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0">
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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