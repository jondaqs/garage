// src/app/admin/service-broadcasts/page.js
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Megaphone, Loader2, ChevronDown, ChevronUp, Eye, EyeOff, Flag,
  XCircle, CheckCircle, AlertTriangle, Shield, Clock, RefreshCw,
  FileText, Settings, BarChart3, ScrollText, Ban, Undo2, Save,
  Building2, User, Wrench, Search, MapPin, DollarSign, Award,
} from 'lucide-react'

const URGENCY_COLORS = { low: 'bg-gray-100 text-gray-700', medium: 'bg-blue-100 text-blue-800', high: 'bg-orange-100 text-orange-800', urgent: 'bg-red-100 text-red-800' }
const STATUS_COLORS = { open: 'bg-green-100 text-green-800', in_review: 'bg-blue-100 text-blue-800', awarded: 'bg-purple-100 text-purple-800', completed: 'bg-gray-100 text-gray-800', cancelled: 'bg-gray-100 text-gray-500', expired: 'bg-yellow-100 text-yellow-700' }
const RESP_COLORS = { submitted: 'bg-blue-100 text-blue-800', shortlisted: 'bg-purple-100 text-purple-800', accepted: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800', withdrawn: 'bg-gray-100 text-gray-500' }
const POSTER_ICON = { individual: User, company: Building2, service_provider: Wrench }
const FLAG_TYPES = ['inappropriate_content', 'spam', 'misleading', 'harassment', 'illegal_activity', 'duplicate', 'fraud', 'other']

function fmtD(d) { return d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' }

function Toast({ message, type, onDismiss }) {
  if (!message) return null
  return <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
    {message}<button onClick={onDismiss} className="ml-3 opacity-70 hover:opacity-100">✕</button>
  </div>
}

// ════════════════════════════════════════════════════════
//  ALL BROADCASTS TAB
// ════════════════════════════════════════════════════════
function BroadcastsView({ supabase, toast, setToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [statusF, setStatusF] = useState('all')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [flagType, setFlagType] = useState('')
  const [flagReason, setFlagReason] = useState('')
  const [flaggingId, setFlaggingId] = useState(null)
  const [actioning, setActioning] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('service_broadcasts').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [supabase])
  useEffect(() => { load() }, [load])

  const doAction = async (id, action, reason) => {
    setActioning(id)
    const { data } = await supabase.rpc('admin_force_action_broadcast', { p_broadcast_id: id, p_action: action, p_reason: reason || null })
    const r = typeof data === 'string' ? JSON.parse(data) : data
    setToast({ message: r?.success ? `Action: ${action}` : (r?.error || 'Failed'), type: r?.success ? 'success' : 'error' })
    setTimeout(() => setToast({ message: '' }), 3000)
    setActioning(null); load()
  }

  const doFlag = async (id) => {
    if (!flagType) return
    const { data } = await supabase.rpc('admin_flag_broadcast', { p_broadcast_id: id, p_flag_type: flagType, p_reason: flagReason || null })
    const r = typeof data === 'string' ? JSON.parse(data) : data
    setToast({ message: r?.success ? `Flagged${r.auto_hidden ? ' (auto-hidden)' : ''}` : (r?.error || 'Failed'), type: r?.success ? 'success' : 'error' })
    setTimeout(() => setToast({ message: '' }), 3000)
    setFlaggingId(null); setFlagType(''); setFlagReason(''); load()
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-emerald-600" /></div>

  const filtered = items.filter(b => {
    if (statusF !== 'all' && b.status !== statusF) return false
    if (flaggedOnly && !b.is_flagged) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
            <option value="all">All statuses</option>
            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} className="rounded" />
            Flagged only
          </label>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-500">{filtered.length} / {items.length}</p>
          <button onClick={load} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"><RefreshCw size={12} /></button>
        </div>
      </div>

      {filtered.map(b => {
        const isExp = expandedId === b.id
        const PIcon = POSTER_ICON[b.poster_type] || User
        const isFlagging = flaggingId === b.id
        return (
          <div key={b.id} className={`bg-white rounded-xl border overflow-hidden ${b.is_hidden ? 'border-red-200 bg-red-50/30' : b.is_flagged ? 'border-amber-200' : 'border-gray-200'}`}>
            <div className="p-4 cursor-pointer hover:bg-gray-50/50" onClick={() => setExpandedId(isExp ? null : b.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{b.broadcast_number}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${STATUS_COLORS[b.status] || ''}`}>{b.status}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize ${URGENCY_COLORS[b.urgency] || ''}`}>{b.urgency}</span>
                    <span className="text-[9px] text-gray-400 flex items-center gap-0.5"><PIcon size={8} />{(b.poster_type || '').replace(/_/g, ' ')}</span>
                    {b.is_flagged && <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Flag size={7} />{b.flag_count}</span>}
                    {b.is_hidden && <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><EyeOff size={7} />HIDDEN</span>}
                    {b.response_count > 0 && <span className="text-[9px] text-blue-600">{b.response_count} resp</span>}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{b.title}</h3>
                </div>
                <p className="text-[10px] text-gray-400 shrink-0">{fmtD(b.created_at)}</p>
              </div>
            </div>

            {isExp && (
              <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/30">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{b.description}</p>
                <div className="flex flex-wrap gap-2">
                  {b.service_category && <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded">{b.service_category}</span>}
                  {b.location && <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded flex items-center gap-0.5"><MapPin size={8} />{b.location}</span>}
                  {b.budget_estimate && <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded flex items-center gap-0.5"><DollarSign size={8} />{b.budget_estimate}</span>}
                </div>

                {b.admin_notes && <div className="bg-blue-50 border border-blue-100 rounded-lg p-3"><p className="text-[10px] text-blue-500 font-medium uppercase mb-1">Admin Notes</p><p className="text-xs text-blue-800">{b.admin_notes}</p></div>}

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {b.is_hidden
                    ? <button onClick={() => doAction(b.id, 'unhide')} disabled={actioning === b.id} className="px-2.5 py-1.5 bg-green-100 text-green-800 text-xs rounded-lg hover:bg-green-200 flex items-center gap-1"><Eye size={10} />Unhide</button>
                    : <button onClick={() => doAction(b.id, 'hide', 'Admin action')} disabled={actioning === b.id} className="px-2.5 py-1.5 bg-red-100 text-red-800 text-xs rounded-lg hover:bg-red-200 flex items-center gap-1"><EyeOff size={10} />Hide</button>
                  }
                  {['open', 'in_review'].includes(b.status) && (
                    <button onClick={() => doAction(b.id, 'force_close', 'Admin action')} disabled={actioning === b.id} className="px-2.5 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300 flex items-center gap-1"><XCircle size={10} />Force Close</button>
                  )}
                  {['cancelled', 'expired'].includes(b.status) && (
                    <button onClick={() => doAction(b.id, 'reopen')} disabled={actioning === b.id} className="px-2.5 py-1.5 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200 flex items-center gap-1"><Undo2 size={10} />Reopen</button>
                  )}
                  <button onClick={() => setFlaggingId(isFlagging ? null : b.id)} className="px-2.5 py-1.5 bg-amber-100 text-amber-800 text-xs rounded-lg hover:bg-amber-200 flex items-center gap-1"><Flag size={10} />Flag</button>
                </div>

                {/* Flag form */}
                {isFlagging && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <select value={flagType} onChange={e => setFlagType(e.target.value)} className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5">
                      <option value="">Select flag type...</option>
                      {FLAG_TYPES.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                    </select>
                    <input type="text" value={flagReason} onChange={e => setFlagReason(e.target.value)} placeholder="Reason (optional)" className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5" />
                    <button onClick={() => doFlag(b.id)} disabled={!flagType} className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-50">Submit Flag</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  ALL RESPONSES TAB
// ════════════════════════════════════════════════════════
function ResponsesView({ supabase, toast, setToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('service_broadcast_responses')
      .select('*, service_broadcasts(broadcast_number, title), service_providers(name)')
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [supabase])
  useEffect(() => { load() }, [load])

  const doAction = async (id, action) => {
    setActioning(id)
    const { data } = await supabase.rpc('admin_force_action_response', { p_response_id: id, p_action: action, p_reason: 'Admin action' })
    const r = typeof data === 'string' ? JSON.parse(data) : data
    setToast({ message: r?.success ? `Action: ${action}` : (r?.error || 'Failed'), type: r?.success ? 'success' : 'error' })
    setTimeout(() => setToast({ message: '' }), 3000)
    setActioning(null); load()
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-blue-600" /></div>

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{items.length} responses</p>
        <button onClick={load} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"><RefreshCw size={12} /></button>
      </div>
      {items.map(r => (
        <div key={r.id} className={`bg-white rounded-xl border p-4 ${r.is_hidden ? 'border-red-200 opacity-60' : r.is_flagged ? 'border-amber-200' : 'border-gray-200'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{r.service_broadcasts?.broadcast_number}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${RESP_COLORS[r.status] || ''}`}>{r.status}</span>
                <span className="text-[10px] text-gray-600 font-medium">{r.service_providers?.name}</span>
                {r.is_hidden && <span className="text-[9px] text-red-600 font-bold">HIDDEN</span>}
              </div>
              <p className="text-xs text-gray-500">Re: {r.service_broadcasts?.title}</p>
            </div>
            <p className="text-[10px] text-gray-400">{fmtD(r.created_at)}</p>
          </div>
          <p className="text-xs text-gray-700 line-clamp-2 mb-2">{r.proposal_text}</p>
          <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-2">
            {r.quoted_price && <span className="font-mono">KES {Number(r.quoted_price).toLocaleString()}</span>}
            {r.estimated_duration && <span>{r.estimated_duration}</span>}
          </div>
          <div className="flex gap-1.5">
            {r.status === 'submitted' && <button onClick={() => doAction(r.id, 'force_reject')} disabled={actioning === r.id} className="px-2 py-1 bg-red-100 text-red-700 text-[10px] rounded-lg hover:bg-red-200 flex items-center gap-0.5"><XCircle size={8} />Force Reject</button>}
            {r.is_hidden
              ? <button onClick={() => doAction(r.id, 'unhide')} disabled={actioning === r.id} className="px-2 py-1 bg-green-100 text-green-700 text-[10px] rounded-lg hover:bg-green-200 flex items-center gap-0.5"><Eye size={8} />Unhide</button>
              : <button onClick={() => doAction(r.id, 'hide')} disabled={actioning === r.id} className="px-2 py-1 bg-red-100 text-red-700 text-[10px] rounded-lg hover:bg-red-200 flex items-center gap-0.5"><EyeOff size={8} />Hide</button>
            }
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  MODERATION QUEUE TAB
// ════════════════════════════════════════════════════════
function ModerationView({ supabase, toast, setToast }) {
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [moderating, setModerating] = useState(null)
  const [modNotes, setModNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('service_broadcast_flags')
      .select('*, service_broadcasts(broadcast_number, title), service_broadcast_responses(id, proposal_text, service_providers(name))')
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: false })
    setFlags(data || [])
    setLoading(false)
  }, [supabase])
  useEffect(() => { load() }, [load])

  const moderate = async (flagId, decision, action) => {
    setModerating(flagId)
    const { data } = await supabase.rpc('admin_moderate_flag', {
      p_flag_id: flagId, p_decision: decision, p_notes: modNotes || null, p_action: action || null,
    })
    const r = typeof data === 'string' ? JSON.parse(data) : data
    setToast({ message: r?.success ? `Flag ${decision}` : (r?.error || 'Failed'), type: r?.success ? 'success' : 'error' })
    setTimeout(() => setToast({ message: '' }), 3000)
    setModerating(null); setModNotes(''); load()
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-amber-600" /></div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{flags.length} pending flag{flags.length !== 1 ? 's' : ''}</p>
      {flags.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <CheckCircle size={40} className="mx-auto text-green-300 mb-3" />
          <p className="text-sm text-gray-500">No flags pending review.</p>
        </div>
      ) : flags.map(f => (
        <div key={f.id} className="bg-white rounded-xl border border-amber-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full capitalize">{(f.flag_type || '').replace(/_/g, ' ')}</span>
              {f.service_broadcasts && <span className="font-mono text-[10px] text-gray-500">{f.service_broadcasts.broadcast_number}</span>}
              {f.service_broadcast_responses?.service_providers?.name && <span className="text-[10px] text-gray-500">Response by: {f.service_broadcast_responses.service_providers.name}</span>}
            </div>
            <p className="text-[10px] text-gray-400">{fmtD(f.created_at)}</p>
          </div>
          {f.flag_reason && <p className="text-xs text-gray-700">{f.flag_reason}</p>}
          {f.service_broadcasts?.title && <p className="text-xs text-gray-500">Broadcast: "{f.service_broadcasts.title}"</p>}

          <input type="text" value={modNotes} onChange={e => setModNotes(e.target.value)} placeholder="Moderation notes (optional)"
            className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5" />

          <div className="flex gap-2">
            <button onClick={() => moderate(f.id, 'upheld', 'content_hidden')} disabled={moderating === f.id}
              className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
              <AlertTriangle size={10} /> Uphold & Hide
            </button>
            <button onClick={() => moderate(f.id, 'dismissed')} disabled={moderating === f.id}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300 disabled:opacity-50 flex items-center gap-1">
              <XCircle size={10} /> Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  SUSPENSIONS TAB
// ════════════════════════════════════════════════════════
function SuspensionsView({ supabase, toast, setToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [userId, setUserId] = useState('')
  const [suspendType, setSuspendType] = useState('both')
  const [days, setDays] = useState('30')
  const [reason, setReason] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('service_broadcast_suspensions').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [supabase])
  useEffect(() => { load() }, [load])

  const createSuspension = async () => {
    if (!userId || !reason) return
    setCreating(true)
    const { data } = await supabase.rpc('admin_suspend_broadcast_user', {
      p_user_id: userId, p_suspend_type: suspendType, p_duration_days: Number(days), p_reason: reason,
    })
    const r = typeof data === 'string' ? JSON.parse(data) : data
    setToast({ message: r?.success ? 'Suspension created' : (r?.error || 'Failed'), type: r?.success ? 'success' : 'error' })
    setTimeout(() => setToast({ message: '' }), 3000)
    setCreating(false); setShowCreate(false); setUserId(''); setReason(''); load()
  }

  const liftSuspension = async (id) => {
    const { data } = await supabase.rpc('admin_lift_suspension', { p_suspension_id: id })
    const r = typeof data === 'string' ? JSON.parse(data) : data
    setToast({ message: r?.success ? 'Suspension lifted' : (r?.error || 'Failed'), type: r?.success ? 'success' : 'error' })
    setTimeout(() => setToast({ message: '' }), 3000); load()
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{items.length} suspension{items.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowCreate(!showCreate)} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 flex items-center gap-1"><Ban size={10} /> New Suspension</button>
      </div>

      {showCreate && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <input type="text" value={userId} onChange={e => setUserId(e.target.value)} placeholder="User profile ID (uuid)" className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2" />
          <div className="grid grid-cols-2 gap-2">
            <select value={suspendType} onChange={e => setSuspendType(e.target.value)} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="posting">Posting only</option>
              <option value="responding">Responding only</option>
              <option value="both">Both</option>
            </select>
            <input type="number" min={1} max={365} value={days} onChange={e => setDays(e.target.value)} onWheel={e => e.currentTarget.blur()} className="text-xs border border-gray-300 rounded-lg px-2 py-1.5" placeholder="Days" />
          </div>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2" />
          <button onClick={createSuspension} disabled={creating || !userId || !reason} className="px-4 py-2 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50">
            {creating ? 'Creating...' : 'Create Suspension'}
          </button>
        </div>
      )}

      {items.map(s => (
        <div key={s.id} className={`bg-white rounded-xl border p-4 ${s.is_active && new Date(s.expires_at) > new Date() ? 'border-red-200' : 'border-gray-200 opacity-60'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.is_active && new Date(s.expires_at) > new Date() ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                {s.is_active && new Date(s.expires_at) > new Date() ? 'ACTIVE' : 'EXPIRED/LIFTED'}
              </span>
              <span className="text-[10px] text-gray-500 capitalize">{s.suspend_type.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-[10px] text-gray-400">Expires: {fmtD(s.expires_at)}</p>
          </div>
          <p className="text-xs text-gray-700 mb-1">{s.reason}</p>
          <p className="text-[10px] text-gray-400 font-mono">User: {s.user_id}</p>
          {s.is_active && new Date(s.expires_at) > new Date() && (
            <button onClick={() => liftSuspension(s.id)} className="mt-2 px-2.5 py-1 bg-green-100 text-green-700 text-[10px] rounded-lg hover:bg-green-200 flex items-center gap-0.5"><Undo2 size={8} />Lift</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  AUDIT LOG TAB
// ════════════════════════════════════════════════════════
function AuditLogView({ supabase }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('service_broadcast_admin_log').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
  }, [supabase])

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-600" /></div>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{logs.length} log entries (last 100)</p>
      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <ScrollText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No admin actions recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600 uppercase text-[10px]">
                <th className="text-left p-2.5">Time</th>
                <th className="text-left p-2.5">Action</th>
                <th className="text-left p-2.5">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-2.5 text-gray-500 whitespace-nowrap">{fmtD(l.created_at)}</td>
                  <td className="p-2.5"><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{l.action}</span></td>
                  <td className="p-2.5 text-gray-600 max-w-xs truncate">{l.details ? JSON.stringify(l.details).substring(0, 100) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  ANALYTICS TAB
// ════════════════════════════════════════════════════════
function AnalyticsView({ supabase }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [bRes, rRes] = await Promise.all([
        supabase.from('service_broadcasts').select('id, status, urgency, service_category, poster_type, response_count, created_at'),
        supabase.from('service_broadcast_responses').select('id, status, provider_id, created_at'),
      ])
      const broadcasts = bRes.data || []
      const responses = rRes.data || []

      const byStatus = {}; broadcasts.forEach(b => { byStatus[b.status] = (byStatus[b.status] || 0) + 1 })
      const byUrgency = {}; broadcasts.forEach(b => { byUrgency[b.urgency] = (byUrgency[b.urgency] || 0) + 1 })
      const byCategory = {}; broadcasts.forEach(b => { const c = b.service_category || 'Uncategorized'; byCategory[c] = (byCategory[c] || 0) + 1 })
      const byPosterType = {}; broadcasts.forEach(b => { byPosterType[b.poster_type] = (byPosterType[b.poster_type] || 0) + 1 })
      const avgResponses = broadcasts.length > 0 ? (broadcasts.reduce((s, b) => s + (b.response_count || 0), 0) / broadcasts.length).toFixed(1) : '0'
      const respByStatus = {}; responses.forEach(r => { respByStatus[r.status] = (respByStatus[r.status] || 0) + 1 })

      setStats({ total: broadcasts.length, totalResponses: responses.length, byStatus, byUrgency, byCategory, byPosterType, avgResponses, respByStatus })
      setLoading(false)
    })()
  }, [supabase])

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-emerald-600" /></div>
  if (!stats) return null

  const StatCard = ({ label, value, color }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  )

  const BreakdownRow = ({ label, count, total, color }) => (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-700 capitalize">{label.replace(/_/g, ' ')}</span>
      <div className="flex items-center gap-2">
        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color || 'bg-emerald-500'}`} style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
        </div>
        <span className="text-xs font-mono text-gray-500 w-8 text-right">{count}</span>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Broadcasts" value={stats.total} color="text-emerald-700" />
        <StatCard label="Total Responses" value={stats.totalResponses} color="text-blue-700" />
        <StatCard label="Avg Responses/Broadcast" value={stats.avgResponses} />
        <StatCard label="Awarded" value={stats.byStatus.awarded || 0} color="text-purple-700" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">By Status</p>
          {Object.entries(stats.byStatus).map(([k, v]) => <BreakdownRow key={k} label={k} count={v} total={stats.total} />)}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">By Urgency</p>
          {Object.entries(stats.byUrgency).map(([k, v]) => <BreakdownRow key={k} label={k} count={v} total={stats.total} color="bg-orange-500" />)}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">By Poster Type</p>
          {Object.entries(stats.byPosterType).map(([k, v]) => <BreakdownRow key={k} label={k} count={v} total={stats.total} color="bg-blue-500" />)}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">Top Categories</p>
          {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => <BreakdownRow key={k} label={k} count={v} total={stats.total} color="bg-purple-500" />)}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════

export default function AdminBroadcastsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" size={28} /></div>}>
      <AdminBroadcastsPage />
    </Suspense>
  )
}

function AdminBroadcastsPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState(searchParams?.get('tab') || 'broadcasts')
  const [toast, setToast] = useState({ message: '', type: 'success' })

  const TABS = [
    { id: 'broadcasts', label: 'All Broadcasts', icon: Megaphone },
    { id: 'responses', label: 'All Responses', icon: FileText },
    { id: 'moderation', label: 'Moderation Queue', icon: Shield },
    { id: 'suspensions', label: 'Suspensions', icon: Ban },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'audit', label: 'Audit Log', icon: ScrollText },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone size={24} className="text-emerald-600" /> Service Broadcasts
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage broadcasts, moderate content, track activity</p>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'broadcasts' && <BroadcastsView supabase={supabase} toast={toast} setToast={setToast} />}
      {tab === 'responses' && <ResponsesView supabase={supabase} toast={toast} setToast={setToast} />}
      {tab === 'moderation' && <ModerationView supabase={supabase} toast={toast} setToast={setToast} />}
      {tab === 'suspensions' && <SuspensionsView supabase={supabase} toast={toast} setToast={setToast} />}
      {tab === 'analytics' && <AnalyticsView supabase={supabase} />}
      {tab === 'audit' && <AuditLogView supabase={supabase} />}
    </div>
  )
}