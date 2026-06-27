// → Drop this file at: src/app/dashboard/my-teams/provider/[providerId]/chat/page.js
'use client'

/* ============================================================================
 * Provider-member chat page — scoped to ONE provider via the route param.
 *
 * Path: /dashboard/my-teams/provider/[id]/chat
 *
 * This is the chat surface a service-provider STAFF MEMBER (SPU or mechanic
 * with can_chat) accesses from the normal-user sidebar's "Service Provider
 * Membership" section. It is intentionally separate from /provider/chat
 * (the provider-portal version) because it must work cleanly when a member
 * belongs to multiple providers — the provider id in the URL disambiguates.
 *
 * Permission model:
 *   • Provider owner                                                  ✅
 *   • service_provider_users  with is_active AND can_chat             ✅
 *   • mechanics                with is_active AND can_chat            ✅
 *   • everyone else                                                    ⛔  redirected
 * ============================================================================ */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  Send, MessageSquare, Search, Loader2, CheckCheck, Check,
  ArrowLeft, XCircle, CheckCircle, AlertCircle, Building2, RefreshCw,
} from 'lucide-react'

import ProviderSubscriptionGate from '@/components/ProviderSubscriptionGate'
import ChatAvatar from '@/components/ChatAvatar'
export default function ProviderMemberChatPage() {
  const router       = useRouter()
  const params       = useParams()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const providerId = params?.providerId

  const [profile,        setProfile]        = useState(null)
  const [provider,       setProvider]       = useState(null)
  const [authState,      setAuthState]      = useState('checking')  // checking | ok | denied
  const [denyReason,     setDenyReason]     = useState('')
  const [conversations,  setConversations]  = useState([])
  const [activeConv,     setActiveConv]     = useState(null)
  const [messages,       setMessages]       = useState([])
  const [body,           setBody]           = useState('')
  const [sending,        setSending]        = useState(false)
  const [loadingConvs,   setLoadingConvs]   = useState(true)
  const [loadingMsgs,    setLoadingMsgs]    = useState(false)
  const [convSearch,     setConvSearch]     = useState('')
  const [statusFilter,   setStatusFilter]   = useState('open')
  const [closingConv,    setClosingConv]    = useState(false)
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [refreshing,     setRefreshing]     = useState(false)

  const messagesEndRef = useRef(null)
  const channelRef     = useRef(null)
  const listChannelRef = useRef(null)
  const inputRef       = useRef(null)

  // ── Resolve profile + verify membership for THIS provider ───────────────
  useEffect(() => {
    if (!providerId) return
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: prof } = await supabase
        .from('user_profiles_secure')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single()
      if (!prof) { setAuthState('denied'); setDenyReason('Profile not found'); return }
      setProfile(prof)

      // Load the provider record (also validates the id exists)
      const { data: sp } = await supabase
        .from('service_providers_secure')
        .select('id, name, owner_user_id')
        .eq('id', providerId)
        .maybeSingle()

      if (!sp) {
        setAuthState('denied')
        setDenyReason('Service provider not found')
        return
      }
      setProvider({ id: sp.id, name: sp.name })

      // Permission check, in priority order: owner → SPU.can_chat → mechanic.can_chat
      if (sp.owner_user_id === prof.id) {
        setAuthState('ok')
        return
      }

      const { data: spu } = await supabase
        .from('service_provider_users')
        .select('can_chat')
        .eq('user_id', prof.id)
        .eq('service_provider_id', providerId)
        .eq('is_active', true)
        .maybeSingle()
      if (spu?.can_chat) { setAuthState('ok'); return }

      const { data: mech } = await supabase
        .from('mechanics')
        .select('can_chat')
        .eq('user_id', prof.id)
        .eq('service_provider_id', providerId)
        .eq('is_active', true)
        .maybeSingle()
      if (mech?.can_chat) { setAuthState('ok'); return }

      setAuthState('denied')
      setDenyReason(
        spu || mech
          ? 'Your membership does not include chat permission. Ask your provider owner to enable it.'
          : 'You are not a member of this service provider.'
      )
    }
    init()
  }, [providerId])

  // ── Load conversations for THIS provider ────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (authState !== 'ok' || !providerId) return null
    let q = supabase
      .from('conversations')
      .select(`
        id, updated_at, last_message_at, last_message_preview,
        provider_unread_count, status, closed_at, company_id,
        closed_by:user_profiles_secure!closed_by_id(id, first_name, last_name),
        user:user_profiles_secure!user_id(id, first_name, last_name, profile_picture_url),
        company:company_profiles_secure!company_id(id, name)
      `)
      .eq('service_provider_id', providerId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    const { data } = await q
    return data || []
  }, [authState, providerId, statusFilter])

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
    if (!providerId || refreshing) return
    setRefreshing(true)
    await reloadConversationsSilent()
    setTimeout(() => setRefreshing(false), 350)
  }

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Realtime: list-wide subscription on this provider's conversations ───
  useEffect(() => {
    if (!providerId) return
    if (listChannelRef.current) supabase.removeChannel(listChannelRef.current)

    listChannelRef.current = supabase
      .channel(`team-provider-chat-list-${providerId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `service_provider_id=eq.${providerId}`,
      }, payload => {
        const updated = payload.new
        setConversations(prev => {
          if (statusFilter !== 'all' && updated.status !== statusFilter) {
            return prev.filter(c => c.id !== updated.id)
          }
          if (!prev.some(c => c.id === updated.id)) return prev
          return prev.map(c => c.id === updated.id ? { ...c, ...updated } : c)
            .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
        })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `service_provider_id=eq.${providerId}`,
      }, () => reloadConversationsSilent())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'conversations',
        filter: `service_provider_id=eq.${providerId}`,
      }, payload => {
        const deletedId = payload.old?.id
        if (deletedId) setConversations(prev => prev.filter(c => c.id !== deletedId))
      })
      .subscribe()

    return () => {
      if (listChannelRef.current) supabase.removeChannel(listChannelRef.current)
    }
  }, [providerId, statusFilter, reloadConversationsSilent])

  // ── Auto-open from ?conversation= param ─────────────────────────────────
  useEffect(() => {
    const convId = searchParams.get('conversation')
    if (!convId || !conversations.length) return
    const conv = conversations.find(c => c.id === convId)
    if (conv) selectConversation(conv.id, conv)
  }, [searchParams, conversations])

  // ── Select conversation ─────────────────────────────────────────────────
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
        sender:user_profiles_secure!sender_id(id, first_name, last_name)
      `)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(msgs || [])
    setLoadingMsgs(false)

    // Mark customer-side messages (user OR company) as read for the provider
    await supabase.from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .in('sender_role', ['user', 'company'])
      .eq('is_read', false)

    // Reset provider unread counter
    await supabase.from('conversations')
      .update({ provider_unread_count: 0 })
      .eq('id', convId)

    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, provider_unread_count: 0 } : c
    ))
    inputRef.current?.focus()
  }, [activeConv, conversations])

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConv?.id) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel(`provider-member-messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, async payload => {
        const msg = payload.new
        // Hydrate sender for display. Postgres_changes payloads don't include
        // joins, so we fetch the sender's profile separately.
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
        setMessages(prev => prev.some(m => m.id === enriched.id) ? prev : [...prev, enriched])
        // ── Mark inbound message as read AND clear the provider unread counter ──
        // The customer's send_message_to_provider RPC bumps provider_unread_count
        // immediately after inserting the message. If the conversation is open
        // we don't want that bump to surface — the member is looking at it.
        // Both DB updates are fire-and-forget; we also optimistically zero the
        // counter in local state so the badge doesn't flicker between the
        // customer's bump arriving and our zero landing.
        if (msg.sender_role === 'user' || msg.sender_role === 'company') {
          supabase.from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', msg.id)
            .then(({ error }) => { if (error) console.error('mark message read failed:', error) })
          supabase.from('conversations')
            .update({ provider_unread_count: 0 })
            .eq('id', activeConv.id)
            .then(({ error }) => { if (error) console.error('reset provider_unread_count failed:', error) })
          setConversations(prev => prev.map(c =>
            c.id === activeConv.id ? { ...c, provider_unread_count: 0 } : c
          ))
          setActiveConv(prev => prev ? { ...prev, provider_unread_count: 0 } : prev)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `id=eq.${activeConv.id}`,
      }, payload => {
        const updated = payload.new
        // Force provider_unread_count to 0 for the active conversation. The
        // customer's send_message_to_provider RPC bumps this counter as part
        // of the same write that inserts a message; that bump's UPDATE event
        // can race ahead of our own reset and would otherwise re-light the
        // badge for a conversation that's open and being read. Our INSERT
        // handler above is what does the authoritative DB reset; this local
        // override just keeps the rendered state truthful in between.
        const sanitised = { ...updated, provider_unread_count: 0 }
        setActiveConv(prev => ({ ...prev, ...sanitised }))
        setConversations(prev =>
          prev.map(c => c.id === activeConv.id ? { ...c, ...sanitised } : c)
        )
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [activeConv?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message (provider side) ────────────────────────────────────────
  // Single atomic RPC: inserts the message, updates the conversation
  // preview/timestamp, and bumps the appropriate customer-side unread
  // counter (user_unread_count or company_unread_count) — all server-side.
  const sendMessage = async () => {
    if (!body.trim() || !activeConv || !profile || sending) return
    if (authState !== 'ok') return
    if (activeConv.status === 'closed') return
    setSending(true)
    const text = body.trim()
    setBody('')

    const optimistic = {
      id: `opt-${Date.now()}`, body: text,
      sender_id: profile.id, sender_role: 'provider',
      created_at: new Date().toISOString(), is_read: false,
      sender: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name },
    }
    setMessages(prev => [...prev, optimistic])

    const { data: msg, error } = await supabase.rpc('send_message_to_user', {
      p_conversation_id: activeConv.id,
      p_body:            text,
    })

    if (error || !msg) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setBody(text)
    } else {
      // RPC returns a bare messages row; attach sender for consistent rendering.
      const enriched = {
        ...msg,
        sender: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name },
      }
      setMessages(prev => prev.map(m => m.id === optimistic.id ? enriched : m))
      const preview = text.length > 60 ? text.slice(0, 60) + '…' : text

      // Optimistically reflect the conversation update in the local list;
      // the RPC has already persisted it server-side.
      setConversations(prev =>
        prev.map(c => c.id === activeConv.id
          ? { ...c, last_message_at: msg.created_at, last_message_preview: preview }
          : c
        ).sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
      )

      // Notify the customer side
      try {
        await fetch('/api/chat/notify-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeConv.id,
            messageId:      msg.id,
            senderName:     `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || provider?.name,
            providerName:   provider?.name,
            preview:        text.slice(0, 80),
          }),
        })
      } catch (_) {}
    }
    setSending(false)
    inputRef.current?.focus()
  }

  // ── Close / reopen conversation ─────────────────────────────────────────
  const toggleClosed = async () => {
    if (!activeConv || authState !== 'ok') return
    setClosingConv(true)
    const isOpen = activeConv.status === 'open'
    const update = isOpen
      ? { status: 'closed', closed_at: new Date().toISOString(), closed_by_id: profile?.id }
      : { status: 'open',   closed_at: null,                     closed_by_id: null }

    await supabase.from('conversations').update(update).eq('id', activeConv.id)
    const updated = { ...activeConv, ...update }
    setActiveConv(updated)
    setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, ...update } : c))

    // In-app notification to the user side (only when closing, not on reopen)
    if (isOpen && activeConv.user?.id) {
      await supabase.from('notifications').insert({
        user_id:           activeConv.user.id,
        recipient_user_id: activeConv.user.id,
        type:              'chat_closed',
        notification_type: 'chat_closed',
        title:             `Chat with ${provider?.name} has been closed`,
        message:           `Your conversation with ${provider?.name} has been marked as closed. You can still view the history.`,
        reference_table:   'conversations',
        reference_id:      activeConv.id,
        reference_type:    'conversation',
        is_read:           false,
      })
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

  // Customer-side display name resolves to either the company name (for
  // company conversations) or the user's full name (for personal conversations)
  const customerName = c => {
    if (!c) return 'Customer'
    if (c.company?.name) return c.company.name
    const n = `${c.user?.first_name || ''} ${c.user?.last_name || ''}`.trim()
    return n || 'Customer'
  }

  const filteredConvs = conversations.filter(c => {
    const name = customerName(c).toLowerCase()
    return !convSearch || name.includes(convSearch.toLowerCase())
  })

  const unreadTotal = conversations.reduce((s, c) => s + (c.provider_unread_count || 0), 0)

  // ── Auth gates ──────────────────────────────────────────────────────────
  if (authState === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="animate-spin text-gray-300" size={32} />
      </div>
    )
  }

  if (authState === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8 text-center">
        <AlertCircle size={48} className="text-gray-300 mb-4" />
        <p className="text-gray-700 font-semibold mb-1">Chat unavailable</p>
        <p className="text-gray-500 text-sm max-w-md">{denyReason}</p>
        <button
          onClick={() => router.push('/dashboard/my-teams')}
          className="mt-6 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Back to My Teams
        </button>
      </div>
    )
  }

  return (
    <ProviderSubscriptionGate featureName="Chat">
    <div className="h-screen flex bg-gray-50 overflow-hidden">

      {/* ── Conversation list ─────────────────────────────────────────── */}
      <div className={`w-full sm:w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
        ${mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>

        <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between mb-1">
            <button
              onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}`)}
              className="p-1 -ml-1 rounded-lg text-gray-400 hover:bg-gray-100"
              title="Back to provider"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              {unreadTotal > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-bold">
                  {unreadTotal} new
                </span>
              )}
              <button
                onClick={handleManualRefresh}
                disabled={refreshing || !providerId}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Refresh conversations"
                aria-label="Refresh conversations"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">Customer Chats</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{provider?.name}</p>

          {/* Status filter */}
          <div className="flex gap-1 mt-3 mb-3">
            {['open', 'closed', 'all'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={convSearch} onChange={e => setConvSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-gray-300" size={24} />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <MessageSquare size={36} className="text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm">No conversations</p>
            </div>
          ) : (
            filteredConvs.map(conv => {
              const name      = customerName(conv)
              const isCompany = !!conv.company_id
              return (
                <button key={conv.id} onClick={() => selectConversation(conv.id, conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    activeConv?.id === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}>
                  {isCompany ? (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-gradient-to-br from-indigo-400 to-indigo-600">
                      <Building2 size={16} />
                    </div>
                  ) : (
                    <ChatAvatar
                      src={conv.user?.profile_picture_url}
                      name={name}
                      gradient="from-gray-400 to-gray-600"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
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
                      {isCompany && <span className="text-indigo-500 font-medium">Company · </span>}
                      {conv.last_message_preview || 'No messages yet'}
                    </p>
                  </div>
                  {conv.provider_unread_count > 0 && (
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {conv.provider_unread_count > 9 ? '9+' : conv.provider_unread_count}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>

        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
            <MessageSquare size={56} className="text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">Select a conversation</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setMobileShowChat(false)}
                className="sm:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <ArrowLeft size={18} />
              </button>
              {activeConv.company_id ? (
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-gradient-to-br from-indigo-400 to-indigo-600">
                  <Building2 size={16} />
                </div>
              ) : (
                <ChatAvatar
                  src={activeConv.user?.profile_picture_url}
                  name={customerName(activeConv)}
                  size="sm"
                  gradient="from-gray-400 to-gray-600"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{customerName(activeConv)}</p>
                <p className={`text-xs ${activeConv.status === 'closed' ? 'text-red-500' : 'text-green-500'}`}>
                  {activeConv.status === 'closed' ? '● Closed' : '● Open'}
                  {activeConv.company_id && <span className="text-indigo-500 ml-2">· Company</span>}
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
            </div>

            {/* Closed banner */}
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {loadingMsgs ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-gray-300" size={24} />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center pb-8">
                  <MessageSquare size={36} className="text-gray-200 mb-3" />
                  <p className="text-gray-400 text-sm">No messages yet</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isProvider = msg.sender_role === 'provider'
                  const isMine     = msg.sender_id === profile?.id
                  const prev       = messages[i - 1]
                  const showDate   = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString()
                  // Show a label above messages from anyone OTHER than me, on the
                  // first of a same-sender run. That covers two cases:
                  //   • Customer-side replies (user / company) — what we always showed.
                  //   • Coworker provider replies (owner, SPU staff, mechanic) —
                  //     so the viewer knows which staff member said what.
                  // My own outgoing messages are skipped — no need to label myself.
                  const showSenderLabel =
                    !isMine &&
                    (showDate || !prev || prev.sender_id !== msg.sender_id || prev.sender_role !== msg.sender_role)
                  // Compose the sender label. For company-side messages, prefix
                  // the company name so the provider knows which client it's from.
                  const senderName = (() => {
                    const personName = `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim()
                    if (msg.sender_role === 'provider') {
                      // Coworker — keep the label compact since the viewer already
                      // knows the provider context (it's their own inbox).
                      return personName || 'Coworker'
                    }
                    if (msg.sender_role === 'company') {
                      const company = activeConv.company?.name
                      if (company && personName) return `${personName} · ${company}`
                      return company || personName || 'Company'
                    }
                    return personName || 'Customer'
                  })()
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-3">
                          <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                            {new Date(msg.created_at).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isProvider ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] flex flex-col ${isProvider ? 'items-end' : 'items-start'}`}>
                          {showSenderLabel && (
                            <span className="text-[11px] font-semibold text-gray-500 mb-0.5 ml-1">
                              {senderName}
                            </span>
                          )}
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isProvider
                              ? (isMine
                                  ? 'bg-green-600 text-white rounded-br-sm'
                                  : 'bg-green-100 text-green-900 rounded-br-sm')   // coworker reply
                              : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                          }`}>
                            {msg.body}
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 ${isProvider ? 'flex-row-reverse' : ''}`}>
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

            {/* Input */}
            <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
              {activeConv.status === 'closed' ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                  <XCircle size={15} />
                  Conversation closed — reopen to reply
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder="Reply to customer…"
                      rows={1}
                      className="flex-1 resize-none px-4 py-2.5 text-sm bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-all max-h-32"
                      style={{ minHeight: '42px' }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!body.trim() || sending}
                      className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
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
    </ProviderSubscriptionGate>
  )
}