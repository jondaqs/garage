// src/app/admin/support/page.js
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import {
  LifeBuoy, Loader2, ChevronDown, ChevronUp, Send, Save, Eye, CheckCircle,
  XCircle, Clock, AlertCircle, MessageSquare, Settings, Mail, Ban, Building2, Wrench, User,
} from 'lucide-react'

const PRIORITY_COLORS = {
  p1_critical: 'bg-red-100 text-red-800',
  p2_high:     'bg-orange-100 text-orange-800',
  p3_medium:   'bg-yellow-100 text-yellow-800',
  p4_standard: 'bg-blue-100 text-blue-800',
  p5_basic:    'bg-gray-100 text-gray-600',
}
const STATUS_COLORS = {
  open: 'bg-yellow-100 text-yellow-800', assigned: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-blue-100 text-blue-800', waiting_on_user: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800', closed: 'bg-gray-100 text-gray-600', cancelled: 'bg-gray-100 text-gray-500',
}
const SUB_TYPE_ICON = { individual: User, company: Building2, service_provider: Wrench }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Toast({ message, type, onDismiss }) {
  if (!message) return null
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
      {message}
      <button onClick={onDismiss} className="ml-3 opacity-70 hover:opacity-100">✕</button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  TICKETS TAB
// ════════════════════════════════════════════════════════════════
function TicketsView({ supabase }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [expandedId, setExpandedId] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [adminReply, setAdminReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [profileId, setProfileId] = useState(null)
  const [toast, setToast] = useState({ message: '', type: 'success' })

  const loadTickets = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadTickets()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) supabase.from('user_profiles').select('id').eq('auth_user_id', user.id).single()
        .then(({ data }) => { if (data) setProfileId(data.id) })
    })
  }, [loadTickets, supabase])

  const loadMessages = async (ticketId) => {
    setLoadingMessages(true)
    const { data } = await supabase.from('support_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMessages(false)
  }

  const toggleExpand = (id) => {
    const ticket = tickets.find(t => t.id === id)
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    setAdminNotes(ticket?.admin_notes || '')
    setResolutionNotes(ticket?.resolution_notes || '')
    setAdminReply('')
    loadMessages(id)
  }

  const updateTicket = async (id, updates) => {
    setUpdatingId(id)
    try {
      const { error } = await supabase.from('support_tickets')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      setToast({ message: 'Ticket updated', type: 'success' })
      setTimeout(() => setToast({ message: '' }), 3000)
      await loadTickets()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setUpdatingId(null) }
  }

  const sendAdminReply = async (ticketId) => {
    if (!adminReply.trim() || !profileId) return
    setSendingReply(true)
    await supabase.from('support_ticket_messages').insert({
      ticket_id: ticketId, sender_id: profileId, is_admin: true, message: adminReply.trim(),
    })
    setAdminReply('')
    await loadMessages(ticketId)
    setSendingReply(false)
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

  const filtered = tickets.filter(t => {
    if (priorityFilter !== 'all' && t.priority_code !== priorityFilter) return false
    if (statusFilter === 'active') return ['open', 'assigned', 'in_progress', 'waiting_on_user'].includes(t.status)
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    return true
  })

  const counts = { active: 0, resolved: 0, total: tickets.length }
  tickets.forEach(t => { if (['open', 'assigned', 'in_progress', 'waiting_on_user'].includes(t.status)) counts.active++ })
  counts.resolved = tickets.filter(t => t.status === 'resolved').length

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />

      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-[11px]">
            {['all', 'active', 'resolved', 'closed', 'cancelled'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 rounded-md transition-colors capitalize ${statusFilter === s ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500'}`}>
                {s === 'active' ? `Active (${counts.active})` : s}
              </button>
            ))}
          </div>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="text-[11px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
            <option value="all">All priorities</option>
            <option value="p1_critical">P1 — Critical</option>
            <option value="p2_high">P2 — High</option>
            <option value="p3_medium">P3 — Medium</option>
            <option value="p4_standard">P4 — Standard</option>
            <option value="p5_basic">P5 — Basic</option>
          </select>
        </div>
        <p className="text-xs text-gray-500">{filtered.length} / {counts.total} tickets</p>
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <LifeBuoy size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No tickets match the current filters.</p>
        </div>
      ) : (
        filtered.map(t => {
          const isExpanded = expandedId === t.id
          const TypeIcon = SUB_TYPE_ICON[t.subscriber_type] || User
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleExpand(t.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{t.ticket_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[t.priority_code] || ''}`}>{t.priority_label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[t.status] || ''}`}>{t.status.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-gray-400 capitalize flex items-center gap-0.5"><TypeIcon size={9} /> {(t.subscriber_type || '').replace(/_/g, ' ')}</span>
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

              {isExpanded && (
                <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50">
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{t.description}</p>

                  {t.package_name && (
                    <p className="text-[10px] text-gray-400">Subscription at time of submission: <strong>{t.package_name}</strong></p>
                  )}

                  {/* Admin notes */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Admin Notes</p>
                    <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>

                  {/* Resolution notes (for resolving) */}
                  {['open', 'assigned', 'in_progress', 'waiting_on_user'].includes(t.status) && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">Resolution Notes <span className="font-normal text-gray-400">(for resolving)</span></p>
                      <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} rows={2}
                        placeholder="Describe the resolution..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.status === 'open' && (
                      <button onClick={() => updateTicket(t.id, { status: 'assigned', assigned_to: profileId, assigned_at: new Date().toISOString(), admin_notes: adminNotes })}
                        disabled={updatingId === t.id} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                        <Eye size={12} /> Assign to Me
                      </button>
                    )}
                    {['open', 'assigned'].includes(t.status) && (
                      <button onClick={() => updateTicket(t.id, { status: 'in_progress', admin_notes: adminNotes })}
                        disabled={updatingId === t.id} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                        <Clock size={12} /> In Progress
                      </button>
                    )}
                    {['open', 'assigned', 'in_progress'].includes(t.status) && (
                      <button onClick={() => updateTicket(t.id, { status: 'waiting_on_user', admin_notes: adminNotes })}
                        disabled={updatingId === t.id} className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1">
                        <AlertCircle size={12} /> Waiting on User
                      </button>
                    )}
                    {['open', 'assigned', 'in_progress', 'waiting_on_user'].includes(t.status) && (
                      <button onClick={() => updateTicket(t.id, { status: 'resolved', resolved_at: new Date().toISOString(), admin_notes: adminNotes, resolution_notes: resolutionNotes })}
                        disabled={updatingId === t.id} className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                        <CheckCircle size={12} /> Resolve
                      </button>
                    )}
                    {t.status === 'resolved' && (
                      <button onClick={() => updateTicket(t.id, { status: 'closed', admin_notes: adminNotes })}
                        disabled={updatingId === t.id} className="px-3 py-1.5 bg-gray-600 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1">
                        <XCircle size={12} /> Close
                      </button>
                    )}
                    {adminNotes !== (t.admin_notes || '') && (
                      <button onClick={() => updateTicket(t.id, { admin_notes: adminNotes })}
                        disabled={updatingId === t.id} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 flex items-center gap-1">
                        <Save size={12} /> Save Notes
                      </button>
                    )}
                  </div>

                  {/* Message thread */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2 flex items-center gap-1"><MessageSquare size={11} /> Messages</p>
                    {loadingMessages ? (
                      <Loader2 size={14} className="animate-spin text-gray-400" />
                    ) : messages.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {messages.map(m => (
                          <div key={m.id} className={`rounded-lg px-3 py-2 text-xs ${m.is_admin ? 'bg-blue-50 border border-blue-100 ml-4' : 'bg-white border border-gray-200 mr-4'}`}>
                            <div className="flex justify-between mb-0.5">
                              <span className={`font-medium ${m.is_admin ? 'text-blue-700' : 'text-gray-700'}`}>{m.is_admin ? 'Admin' : 'User'}</span>
                              <span className="text-[10px] text-gray-400">{fmtDate(m.created_at)}</span>
                            </div>
                            <p className="text-gray-800 whitespace-pre-wrap">{m.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No messages.</p>}

                    <div className="flex items-end gap-2 mt-2">
                      <textarea value={adminReply} onChange={e => setAdminReply(e.target.value)} placeholder="Reply as admin..." rows={2}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      <button onClick={() => sendAdminReply(t.id)} disabled={sendingReply || !adminReply.trim()}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {sendingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  ROUTING CONFIG TAB
// ════════════════════════════════════════════════════════════════
function RoutingConfigView({ supabase }) {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState(null)
  const [editEmail, setEditEmail] = useState('')
  const [editSla, setEditSla] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'success' })

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('support_ticket_routing').select('*').order('sla_hours', { ascending: true })
    setRoutes(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const startEdit = (r) => { setEditId(r.id); setEditEmail(r.email_to); setEditSla(String(r.sla_hours)) }
  const cancelEdit = () => { setEditId(null); setEditEmail(''); setEditSla('') }

  const saveRoute = async (r) => {
    setSaving(true)
    const { data, error } = await supabase.rpc('update_support_ticket_routing', {
      p_priority_code: r.priority_code,
      p_email_to: editEmail,
      p_sla_hours: Number(editSla) || r.sla_hours,
    })
    if (error) {
      setToast({ message: error.message, type: 'error' })
    } else {
      const res = typeof data === 'string' ? JSON.parse(data) : data
      if (!res.success) setToast({ message: res.error, type: 'error' })
      else { setToast({ message: 'Routing updated', type: 'success' }); cancelEdit() }
    }
    setTimeout(() => setToast({ message: '' }), 3000)
    setSaving(false)
    await load()
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />
      <p className="text-sm text-gray-500">Configure which email address receives support tickets for each priority level.</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
              <th className="text-left p-3">Priority</th>
              <th className="text-left p-3">Email To</th>
              <th className="text-center p-3">SLA (hours)</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.map(r => {
              const isEditing = editId === r.id
              return (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${PRIORITY_COLORS[r.priority_code] || ''}`}>
                      {r.priority_label}
                    </span>
                  </td>
                  <td className="p-3">
                    {isEditing ? (
                      <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-full max-w-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    ) : (
                      <span className="text-gray-900 font-mono text-xs">{r.email_to}</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {isEditing ? (
                      <input type="number" min={1} value={editSla} onChange={e => setEditSla(e.target.value)}
                        onWheel={e => e.currentTarget.blur()}
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-20 text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    ) : (
                      <span className="text-gray-700">{r.sla_hours}h</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => saveRoute(r)} disabled={saving}
                          className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Save
                        </button>
                        <button onClick={cancelEdit} className="px-2.5 py-1 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(r)} className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200 flex items-center gap-1 ml-auto">
                        <Mail size={10} /> Edit
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function AdminSupportPageWrapper() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={28} /></div>}>
      <AdminSupportPage />
    </Suspense>
  )
}

function AdminSupportPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState(searchParams?.get('tab') || 'tickets')

  const TABS = [
    { id: 'tickets', label: 'All Tickets', icon: LifeBuoy },
    { id: 'routing', label: 'Priority Routing', icon: Settings },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LifeBuoy size={24} className="text-blue-600" /> Support Tickets
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage support requests from all users</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'tickets' && <TicketsView supabase={supabase} />}
      {tab === 'routing' && <RoutingConfigView supabase={supabase} />}
    </div>
  )
}