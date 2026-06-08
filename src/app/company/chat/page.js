// → Drop this file at: src/app/company/chat/page.js
'use client'

/* ============================================================================
 * Company-owner chat page — company-scoped chat surface for the owner.
 *
 * Path: /company/chat
 *
 * The company owner reaches this page from the /company/* portal sidebar.
 * Owners are stored in company_users with is_admin = true; this page resolves
 * THE company they own (caller-side, no route param) and then behaves
 * identically to /dashboard/company/[companyId]/chat — same data shape,
 * same RPC (send_message_to_provider with p_as_company = true), same role
 * (sender_role = 'company'), same unread counter (company_unread_count).
 *
 * Permission model:
 *   • Caller has a company_users row with is_admin = true AND is_active = true   ✅
 *   • Otherwise                                                                  ⛔  redirected
 *
 * Conversation creation: opening a chat with a new provider is initiated
 * elsewhere (e.g. provider directory) using ?provider= — same pattern as
 * /dashboard/chat.
 * ============================================================================ */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Send, MessageSquare, Search, Loader2, CheckCheck, Check,
  ArrowLeft, XCircle, CheckCircle, AlertCircle, Building2, RefreshCw,
} from 'lucide-react'

export default function CompanyOwnerChatPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [profile,        setProfile]        = useState(null)
  const [company,        setCompany]        = useState(null)        // { id, name }
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
  const [closingConv,    setClosingConv]    = useState(false)
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [refreshing,     setRefreshing]     = useState(false)

  const messagesEndRef = useRef(null)
  const channelRef     = useRef(null)
  const listChannelRef = useRef(null)
  const inputRef       = useRef(null)

  // ── Resolve profile + the company this user owns ─────────────────────────
  useEffect(() => {
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

      // The owner is whoever has an active is_admin row in company_users.
      // We look up their company through that membership; we don't trust a URL
      // param because there isn't one for this surface.
      const { data: cu } = await supabase
        .from('company_users')
        .select('company_id, is_admin, can_chat, is_active, company_profiles_secure!company_id(id, name)')
        .eq('user_id', prof.id)
        .eq('is_active', true)
        .eq('is_admin', true)
        .maybeSingle()

      if (!cu || !cu.company_profiles_secure) {
        setAuthState('denied')
        setDenyReason('No active company-admin membership found for this account.')
        return
      }
      setCompany({ id: cu.company_profiles_secure.id, name: cu.company_profiles_secure.name })
      setAuthState('ok')
    }
    init()
  }, [])

  // ── Load conversations for THIS company ─────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (authState !== 'ok' || !company?.id) return null
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, updated_at, last_message_at, last_message_preview,
        company_unread_count, status, closed_at,
        closed_by:user_profiles_secure!closed_by_id(id, first_name, last_name),
        provider:service_providers_secure!service_provider_id(id, name, is_verified),
        opened_by:user_profiles_secure!user_id(id, first_name, last_name)
      `)
      .eq('company_id', company.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
    return data || []
  }, [authState, company?.id])

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
    if (!company?.id || refreshing) return
    setRefreshing(true)
    await reloadConversationsSilent()
    setTimeout(() => setRefreshing(false), 350)
  }

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Realtime: list-wide subscription on this company's conversations ────
  useEffect(() => {
    if (!company?.id) return
    if (listChannelRef.current) supabase.removeChannel(listChannelRef.current)

    listChannelRef.current = supabase
      .channel(`company-chat-list-${company.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `company_id=eq.${company.id}`,
      }, payload => {
        const updated = payload.new
        setConversations(prev => {
          if (!prev.some(c => c.id === updated.id)) return prev
          return prev.map(c => c.id === updated.id ? { ...c, ...updated } : c)
            .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))
        })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `company_id=eq.${company.id}`,
      }, () => reloadConversationsSilent())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'conversations',
        filter: `company_id=eq.${company.id}`,
      }, payload => {
        const deletedId = payload.old?.id
        if (deletedId) setConversations(prev => prev.filter(c => c.id !== deletedId))
      })
      .subscribe()

    return () => {
      if (listChannelRef.current) supabase.removeChannel(listChannelRef.current)
    }
  }, [company?.id, reloadConversationsSilent])

  // ── Auto-open or create a conversation with a specific provider ─────────
  // Pattern: /company/chat?provider={providerId}
  useEffect(() => {
    const providerId = searchParams.get('provider')
    if (!providerId || authState !== 'ok' || !profile || !company?.id) return
    openOrCreateConversation(providerId)
  }, [searchParams, authState, profile, company?.id])

  const openOrCreateConversation = async (providerId) => {
    // Look up an existing company↔provider conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('company_id', company.id)
      .eq('service_provider_id', providerId)
      .maybeSingle()

    if (existing) {
      selectConversation(existing.id)
      return
    }

    // Otherwise create one. user_id = the calling owner (chat opener).
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        user_id:             profile.id,
        company_id:          company.id,
        service_provider_id: providerId,
      })
      .select(`
        id, updated_at, last_message_at, last_message_preview, company_unread_count, status,
        provider:service_providers_secure!service_provider_id(id, name, is_verified),
        opened_by:user_profiles_secure!user_id(id, first_name, last_name)
      `)
      .single()

    if (!error && newConv) {
      setConversations(prev => [newConv, ...prev])
      selectConversation(newConv.id, newConv)
    }
  }

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

    // Mark provider-side messages as read (the company is the customer here)
    await supabase.from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('sender_role', 'provider')
      .eq('is_read', false)

    // Reset company unread counter
    await supabase.from('conversations')
      .update({ company_unread_count: 0 })
      .eq('id', convId)

    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, company_unread_count: 0 } : c
    ))
    inputRef.current?.focus()
  }, [activeConv, conversations])

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConv?.id) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel(`company-owner-messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
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
        const enriched = { ...msg, sender }
        setMessages(prev => prev.some(m => m.id === enriched.id) ? prev : [...prev, enriched])
        // ── Mark inbound message as read AND clear the company unread counter ──
        // The provider's send_message_to_user RPC bumps company_unread_count
        // immediately after inserting the message (when the conversation has
        // a company_id). If the company has the conversation open we don't
        // want that bump to surface — they're looking at it. Both DB updates
        // are fire-and-forget; we also optimistically zero the counter in
        // local state so the badge doesn't flicker between the provider's
        // bump arriving and our zero landing.
        if (msg.sender_role === 'provider') {
          supabase.from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', msg.id)
            .then(({ error }) => { if (error) console.error('mark message read failed:', error) })
          supabase.from('conversations')
            .update({ company_unread_count: 0 })
            .eq('id', activeConv.id)
            .then(({ error }) => { if (error) console.error('reset company_unread_count failed:', error) })
          setConversations(prev => prev.map(c =>
            c.id === activeConv.id ? { ...c, company_unread_count: 0 } : c
          ))
          setActiveConv(prev => prev ? { ...prev, company_unread_count: 0 } : prev)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `id=eq.${activeConv.id}`,
      }, payload => {
        const updated = payload.new
        // Force company_unread_count to 0 for the active conversation. The
        // provider's send_message_to_user RPC bumps this counter as part of
        // the same write that inserts a message; that bump's UPDATE event
        // can race ahead of our own reset and would otherwise re-light the
        // badge for a conversation that's open and being read. Our INSERT
        // handler above is what does the authoritative DB reset; this local
        // override just keeps the rendered state truthful in between.
        const sanitised = { ...updated, company_unread_count: 0 }
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

  // ── Send message (company side) ─────────────────────────────────────────
  // Single atomic RPC: inserts message with sender_role='company', updates
  // conversation preview/timestamp, and bumps provider_unread_count.
  const sendMessage = async () => {
    if (!body.trim() || !activeConv || !profile || sending) return
    if (authState !== 'ok') return
    if (activeConv.status === 'closed') return
    setSending(true)
    const text = body.trim()
    setBody('')

    const optimistic = {
      id: `opt-${Date.now()}`, body: text,
      sender_id: profile.id, sender_role: 'company',
      created_at: new Date().toISOString(), is_read: false,
      sender: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name },
    }
    setMessages(prev => [...prev, optimistic])

    const { data: msg, error } = await supabase.rpc('send_message_to_provider', {
      p_conversation_id: activeConv.id,
      p_body:            text,
      p_as_company:      true,
    })

    if (error || !msg) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setBody(text)
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
        ).sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
      )

      // Notify the provider side. The notify route is sender-agnostic — we just
      // include senderName / providerName so the notification reads sensibly.
      try {
        await fetch('/api/chat/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: activeConv.id,
            messageId:      msg.id,
            senderName:     `${company?.name || 'Company'}` +
                            ((profile.first_name || profile.last_name)
                              ? ` (${[profile.first_name, profile.last_name].filter(Boolean).join(' ')})`
                              : ''),
            providerId:     activeConv.provider?.id,
            preview:        text.slice(0, 80),
          }),
        })
      } catch (_) {}
    }
    setSending(false)
    inputRef.current?.focus()
  }

  // ── Close / reopen conversation ─────────────────────────────────────────
  // The owner has authority to close from the customer side. The provider can
  // also close from their side; either action sets status='closed' and stamps
  // closed_by_id with the actor's profile id.
  const toggleClosed = async () => {
    if (!activeConv || authState !== 'ok') return
    setClosingConv(true)
    const isOpen = activeConv.status !== 'closed'
    const update = isOpen
      ? { status: 'closed', closed_at: new Date().toISOString(), closed_by_id: profile.id }
      : { status: 'open',   closed_at: null,                     closed_by_id: null }
    await supabase.from('conversations').update(update).eq('id', activeConv.id)
    // Reflect locally; the closed_by join is left as-is — the realtime UPDATE
    // event will refresh the rest of the row.
    const updated = isOpen
      ? { ...activeConv, ...update, closed_by: { id: profile.id, first_name: profile.first_name, last_name: profile.last_name } }
      : { ...activeConv, ...update, closed_by: null }
    setActiveConv(updated)
    setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, ...update } : c))
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
    const name = (c.provider?.name || '').toLowerCase()
    return !convSearch || name.includes(convSearch.toLowerCase())
  })

  const unreadTotal = conversations.reduce((s, c) => s + (c.company_unread_count || 0), 0)

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
          onClick={() => router.push('/company/dashboard')}
          className="mt-6 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Back to company dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">

      {/* ── Conversation list ─────────────────────────────────────────── */}
      <div className={`w-full sm:w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
        ${mobileShowChat ? 'hidden sm:flex' : 'flex'}`}>

        <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">Provider Chats</h2>
            <div className="flex items-center gap-2">
              {unreadTotal > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-bold">
                  {unreadTotal} new
                </span>
              )}
              <button
                onClick={handleManualRefresh}
                disabled={refreshing || !company?.id}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Refresh conversations"
                aria-label="Refresh conversations"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{company?.name}</p>

          <div className="relative mt-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input value={convSearch} onChange={e => setConvSearch(e.target.value)}
              placeholder="Search providers…"
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
              <p className="text-gray-500 text-sm font-medium">No conversations yet</p>
              <p className="text-gray-400 text-xs mt-1 max-w-[220px]">
                Find a service provider and tap <span className="font-medium text-gray-500">Chat</span> to start.
              </p>
              <button
                onClick={() => router.push('/company/providers')}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Search size={12} /> Find Providers
              </button>
            </div>
          ) : (
            filteredConvs.map(conv => {
              const name = conv.provider?.name || 'Provider'
              return (
                <button key={conv.id} onClick={() => selectConversation(conv.id, conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    activeConv?.id === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {name[0]?.toUpperCase()}
                  </div>
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
                      {conv.last_message_preview || 'No messages yet'}
                    </p>
                  </div>
                  {conv.company_unread_count > 0 && (
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {conv.company_unread_count > 9 ? '9+' : conv.company_unread_count}
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
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {(activeConv.provider?.name || 'P')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {activeConv.provider?.name || 'Provider'}
                </p>
                <p className={`text-xs ${activeConv.status === 'closed' ? 'text-red-500' : 'text-green-500'}`}>
                  {activeConv.status === 'closed' ? '● Closed' : '● Open'}
                  <span className="text-indigo-500 ml-2 inline-flex items-center gap-1">
                    · <Building2 size={10} /> Company chat
                  </span>
                </p>
              </div>
              {/* Close / reopen */}
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
                  const isMine    = msg.sender_id === profile.id           // sent by me personally
                  const isCompany = msg.sender_role === 'company'          // any company-side message
                  const isOurs    = isCompany                              // align bubble: company side = right
                  const prev      = messages[i - 1]
                  const showDate  = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString()
                  // Show a sender label whenever the previous bubble was from
                  // a different sender (or after a date divider). Skip on my own
                  // outgoing messages — no need to label myself to myself.
                  const showSenderLabel =
                    !isMine &&
                    (showDate || !prev || prev.sender_id !== msg.sender_id || prev.sender_role !== msg.sender_role)
                  // Compose the sender label.
                  // - 'provider' → provider staff member's name (and provider name)
                  // - 'company'  → coworker's name (we already know it's our company)
                  // - 'user'     → personal user (only happens for legacy/migrated chats)
                  const senderName = (() => {
                    const personName = `${msg.sender?.first_name || ''} ${msg.sender?.last_name || ''}`.trim()
                    if (msg.sender_role === 'provider') {
                      const provider = activeConv.provider?.name
                      if (provider && personName) return `${personName} · ${provider}`
                      return provider || personName || 'Provider'
                    }
                    if (msg.sender_role === 'company') {
                      return personName || 'Coworker'
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
                      <div className={`flex ${isOurs ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] flex flex-col ${isOurs ? 'items-end' : 'items-start'}`}>
                          {showSenderLabel && (
                            <span className="text-[11px] font-semibold text-gray-500 mb-0.5 mx-1">
                              {senderName}
                            </span>
                          )}
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isOurs
                              ? (isMine
                                  ? 'bg-blue-600 text-white rounded-br-sm'
                                  : 'bg-blue-100 text-blue-900 rounded-br-sm')   // coworker reply
                              : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                          }`}>
                            {msg.body}
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 ${isOurs ? 'flex-row-reverse' : ''}`}>
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMine && (
                              msg.is_read
                                ? <CheckCheck size={12} className="text-blue-300" />
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
                      placeholder="Reply on behalf of the company…"
                      rows={1}
                      className="flex-1 resize-none px-4 py-2.5 text-sm bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all max-h-32"
                      style={{ minHeight: '42px' }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!body.trim() || sending}
                      className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                    Sending as {company?.name} · Enter to send · Shift+Enter for new line
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}