'use client'

/* ============================================================================
 * Company-member chat page — scoped to ONE company via the route param.
 *
 * Path: /dashboard/company/[id]/chat
 *
 * The company is the CUSTOMER in this surface (chats with service providers).
 * Any active member of the company with can_chat can read and reply on behalf
 * of the company; replies are stored with sender_role = 'company'.
 *
 * Permission model:
 *   • company_users with is_active AND can_chat                       ✅
 *   • everyone else                                                    ⛔  redirected
 *
 * Conversation creation: opening a chat with a new provider is initiated
 * elsewhere (e.g. provider directory) using ?provider= — same pattern as
 * /dashboard/chat. Including that handler here keeps parity.
 * ============================================================================ */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  Send, MessageSquare, Search, Loader2, CheckCheck, Check,
  ArrowLeft, XCircle, AlertCircle, Building2,
} from 'lucide-react'

export default function CompanyMemberChatPage() {
  const router       = useRouter()
  const params       = useParams()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const companyId = params?.companyId

  const [profile,        setProfile]        = useState(null)
  const [company,        setCompany]        = useState(null)
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
  const [mobileShowChat, setMobileShowChat] = useState(false)

  const messagesEndRef = useRef(null)
  const channelRef     = useRef(null)
  const inputRef       = useRef(null)

  // ── Resolve profile + verify company membership ─────────────────────────
  useEffect(() => {
    if (!companyId) return
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: prof } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single()
      if (!prof) { setAuthState('denied'); setDenyReason('Profile not found'); return }
      setProfile(prof)

      // Validate the company exists and the caller is an active member with can_chat
      const { data: comp } = await supabase
        .from('company_profiles')
        .select('id, name')
        .eq('id', companyId)
        .maybeSingle()
      if (!comp) { setAuthState('denied'); setDenyReason('Company not found'); return }
      setCompany(comp)

      const { data: cu } = await supabase
        .from('company_users')
        .select('can_chat, is_admin')
        .eq('user_id', prof.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!cu) {
        setAuthState('denied')
        setDenyReason('You are not a member of this company.')
        return
      }
      if (!cu.can_chat && !cu.is_admin) {
        setAuthState('denied')
        setDenyReason('Your membership does not include chat permission. Ask a company admin to enable it.')
        return
      }
      setAuthState('ok')
    }
    init()
  }, [companyId])

  // ── Load conversations for THIS company ─────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (authState !== 'ok' || !companyId) return
    setLoadingConvs(true)
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, updated_at, last_message_at, last_message_preview,
        company_unread_count, status, closed_at,
        provider:service_providers!service_provider_id(id, name, is_verified),
        opened_by:user_profiles!user_id(id, first_name, last_name)
      `)
      .eq('company_id', companyId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    setConversations(data || [])
    setLoadingConvs(false)
  }, [authState, companyId])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Auto-open or create a conversation with a specific provider ─────────
  // Pattern: /dashboard/company/{companyId}/chat?provider={providerId}
  useEffect(() => {
    const providerId = searchParams.get('provider')
    if (!providerId || authState !== 'ok' || !profile || !companyId) return
    openOrCreateConversation(providerId)
  }, [searchParams, authState, profile, companyId])

  const openOrCreateConversation = async (providerId) => {
    // Look up an existing company↔provider conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('company_id', companyId)
      .eq('service_provider_id', providerId)
      .maybeSingle()

    if (existing) {
      selectConversation(existing.id)
      return
    }

    // Otherwise create one. user_id = the calling member (chat opener).
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        user_id:             profile.id,
        company_id:          companyId,
        service_provider_id: providerId,
      })
      .select(`
        id, updated_at, last_message_at, last_message_preview, company_unread_count, status,
        provider:service_providers!service_provider_id(id, name, is_verified),
        opened_by:user_profiles!user_id(id, first_name, last_name)
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
        sender:user_profiles!sender_id(id, first_name, last_name)
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
      .channel(`company-member-messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, async payload => {
        const msg = payload.new
        let sender = null
        if (msg.sender_id) {
          const { data: s } = await supabase
            .from('user_profiles')
            .select('id, first_name, last_name')
            .eq('id', msg.sender_id)
            .maybeSingle()
          sender = s
        }
        const enriched = { ...msg, sender }
        setMessages(prev => prev.some(m => m.id === enriched.id) ? prev : [...prev, enriched])
        if (msg.sender_role === 'provider') {
          supabase.from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', msg.id)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
        filter: `id=eq.${activeConv.id}`,
      }, payload => {
        const updated = payload.new
        setActiveConv(prev => ({ ...prev, ...updated }))
        setConversations(prev =>
          prev.map(c => c.id === activeConv.id ? { ...c, ...updated } : c)
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

      // Notify the provider side. The existing notify route is provider-agnostic
      // about the sender — we just include senderName / providerName so the
      // notification reads sensibly on the other end.
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
          onClick={() => router.push(`/dashboard/company/${companyId}`)}
          className="mt-6 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Back to company
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
            <button
              onClick={() => router.push(`/dashboard/company/${companyId}`)}
              className="p-1 -ml-1 rounded-lg text-gray-400 hover:bg-gray-100"
              title="Back to company"
            >
              <ArrowLeft size={18} />
            </button>
            {unreadTotal > 0 && (
              <span className="px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs font-bold">
                {unreadTotal} new
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">Provider Chats</h2>
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
              <p className="text-gray-400 text-sm">No conversations</p>
              <p className="text-gray-400 text-xs mt-1">Start one from a provider's page.</p>
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
            </div>

            {/* Closed banner */}
            {activeConv.status === 'closed' && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  This conversation is closed by the provider. You can still view the history.
                </p>
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
                  // - 'provider'  → provider staff member's name (and provider name)
                  // - 'company'   → coworker's name (we already know it's our company)
                  // - 'user'      → personal user (only happens for legacy/migrated chats)
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
                  Conversation closed by provider
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