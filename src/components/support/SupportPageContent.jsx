// src/components/support/SupportPageContent.jsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LifeBuoy, Plus, Loader2, ChevronDown, ChevronUp, Send, RefreshCw,
  Clock, AlertCircle, CheckCircle, XCircle, MessageSquare,
} from 'lucide-react'
import SupportTicketModal from '@/components/support/SupportTicketModal'

const PRIORITY_COLORS = {
  p1_critical: 'bg-red-100 text-red-800',
  p2_high:     'bg-orange-100 text-orange-800',
  p3_medium:   'bg-yellow-100 text-yellow-800',
  p4_standard: 'bg-blue-100 text-blue-800',
  p5_basic:    'bg-gray-100 text-gray-600',
}
const STATUS_COLORS = {
  open:            'bg-yellow-100 text-yellow-800',
  assigned:        'bg-indigo-100 text-indigo-800',
  in_progress:     'bg-blue-100 text-blue-800',
  waiting_on_user: 'bg-amber-100 text-amber-800',
  resolved:        'bg-green-100 text-green-800',
  closed:          'bg-gray-100 text-gray-600',
  cancelled:       'bg-gray-100 text-gray-500',
}
const STATUS_ICONS = {
  open: Clock, assigned: AlertCircle, in_progress: Loader2,
  waiting_on_user: AlertCircle, resolved: CheckCircle, closed: XCircle, cancelled: XCircle,
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SupportPageContent({ subscriberType, entityId }) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const deepLinkedTicket = searchParams?.get('ticket') || null
  const [tickets, setTickets] = useState([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  // Messages
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [profileId, setProfileId] = useState(null)

  const loadTickets = useCallback(async (isInitial = false) => {
    if (isInitial) setInitialLoading(true)
    else setRefreshing(true)
    let query = supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
    // Scope to entity when viewing company/provider member context
    if (entityId && subscriberType === 'company') query = query.eq('company_id', entityId)
    else if (entityId && subscriberType === 'service_provider') query = query.eq('service_provider_id', entityId)
    else if (subscriberType === 'individual') query = query.eq('subscriber_type', 'individual')
    const { data } = await query
    setTickets(data || [])
    if (isInitial) setInitialLoading(false)
    else setRefreshing(false)
  }, [supabase, entityId, subscriberType])

  useEffect(() => {
    loadTickets(true)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('user_profiles').select('id').eq('auth_user_id', user.id).single()
          .then(({ data }) => { if (data) setProfileId(data.id) })
      }
    })
  }, [loadTickets, supabase])

  // Auto-expand deep-linked ticket from email CTA
  useEffect(() => {
    if (deepLinkedTicket && !initialLoading && tickets.length > 0) {
      const found = tickets.find(t => t.id === deepLinkedTicket)
      if (found) {
        setExpandedId(found.id)
        setStatusFilter('all') // ensure filter doesn't hide the ticket
        loadMessages(found.id)
      }
    }
  }, [deepLinkedTicket, initialLoading, tickets])

  const loadMessages = async (ticketId) => {
    setLoadingMessages(true)
    const { data } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMessages(false)
  }

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      setMessages([])
    } else {
      setExpandedId(id)
      setNewMessage('')
      loadMessages(id)
    }
  }

  const sendMessage = async (ticketId) => {
    if (!newMessage.trim() || !profileId) return
    setSendingMessage(true)
    await supabase.from('support_ticket_messages').insert({
      ticket_id: ticketId,
      sender_id: profileId,
      is_admin: false,
      message: newMessage.trim(),
    })
    setNewMessage('')
    await loadMessages(ticketId)
    setSendingMessage(false)
  }

  const cancelTicket = async (ticketId) => {
    await supabase.from('support_tickets')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ticketId)
    await loadTickets()
    setExpandedId(null)
  }

  const filtered = statusFilter === 'all'
    ? tickets
    : statusFilter === 'active'
      ? tickets.filter(t => ['open', 'assigned', 'in_progress', 'waiting_on_user'].includes(t.status))
      : tickets.filter(t => t.status === statusFilter)

  const activeCounts = tickets.filter(t => ['open', 'assigned', 'in_progress', 'waiting_on_user'].includes(t.status)).length

  // Initial loading — show spinner but always render modal below
  if (initialLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={28} /></div>
        <SupportTicketModal isOpen={showModal} onClose={() => setShowModal(false)} onSubmitted={() => loadTickets()} supabase={supabase} contextType={subscriberType} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LifeBuoy size={24} className="text-blue-600" /> Support
          </h1>
          <p className="text-sm text-gray-500 mt-1">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''} · {activeCounts} active</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadTickets()} disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={16} /> New Ticket
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-[11px] w-fit">
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: `Active (${activeCounts})` },
          { key: 'resolved', label: 'Resolved' },
          { key: 'closed', label: 'Closed' },
          { key: 'cancelled', label: 'Cancelled' },
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`px-2.5 py-1 rounded-md transition-colors ${statusFilter === f.key ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <LifeBuoy size={44} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No tickets found.</p>
          <button onClick={() => setShowModal(true)}
            className="mt-4 text-sm text-blue-600 font-medium hover:text-blue-700">
            Submit your first support ticket →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const isExpanded = expandedId === t.id
            const StatusIcon = STATUS_ICONS[t.status] || Clock
            const canCancel = t.status === 'open'
            const canReply = !['closed', 'cancelled', 'resolved'].includes(t.status)
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Row */}
                <div className="p-4 cursor-pointer hover:bg-gray-50/50 transition-colors" onClick={() => toggleExpand(t.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{t.ticket_number}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority_code] || ''}`}>
                          {t.priority_label}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5 ${STATUS_COLORS[t.status] || ''}`}>
                          <StatusIcon size={9} /> {t.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-gray-400 capitalize">{(t.category || '').replace(/_/g, ' ')}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{t.subject}</h3>
                      {!isExpanded && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xl">{t.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-[10px] text-gray-400">{fmtDate(t.created_at)}</p>
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/30">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">Description</p>
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{t.description}</p>
                    </div>

                    {t.admin_notes && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-[10px] text-blue-500 font-medium uppercase mb-1">Admin Response</p>
                        <p className="text-xs text-blue-800">{t.admin_notes}</p>
                      </div>
                    )}

                    {t.resolution_notes && (
                      <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                        <p className="text-[10px] text-green-500 font-medium uppercase mb-1">Resolution</p>
                        <p className="text-xs text-green-800">{t.resolution_notes}</p>
                      </div>
                    )}

                    {/* Messages thread */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2 flex items-center gap-1">
                        <MessageSquare size={11} /> Messages
                      </p>
                      {loadingMessages ? (
                        <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
                      ) : messages.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">No messages yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {messages.map(m => (
                            <div key={m.id} className={`rounded-lg px-3 py-2 text-xs ${
                              m.is_admin ? 'bg-blue-50 border border-blue-100 ml-4' : 'bg-white border border-gray-200 mr-4'
                            }`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`font-medium ${m.is_admin ? 'text-blue-700' : 'text-gray-700'}`}>
                                  {m.is_admin ? 'Support Team' : 'You'}
                                </span>
                                <span className="text-[10px] text-gray-400">{fmtDate(m.created_at)}</span>
                              </div>
                              <p className="text-gray-800 whitespace-pre-wrap">{m.message}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply input */}
                      {canReply && (
                        <div className="flex items-end gap-2 mt-3">
                          <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)}
                            placeholder="Type a reply..."
                            rows={2} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
                          <button onClick={() => sendMessage(t.id)} disabled={sendingMessage || !newMessage.trim()}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {sendingMessage ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Cancel button */}
                    {canCancel && (
                      <button onClick={() => cancelTicket(t.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium">
                        Cancel this ticket
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal — always rendered, never unmounted by loading state */}
      <SupportTicketModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmitted={() => loadTickets()}
        supabase={supabase}
        contextType={subscriberType}
      />
    </div>
  )
}