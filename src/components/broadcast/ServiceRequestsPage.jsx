// src/components/broadcast/ServiceRequestsPage.jsx
'use client'

/**
 * Shared page component for individuals and companies.
 * Single view: their posted broadcasts with responses.
 * Used by /dashboard/service-requests and /company/service-requests
 */

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Megaphone, Plus, Loader2, RefreshCw, ChevronDown, ChevronUp,
  Clock, CheckCircle, XCircle, AlertCircle, MapPin, DollarSign,
  Building2, Wrench, Award, Star, MessageSquare,
} from 'lucide-react'
import CreateBroadcastModal from '@/components/broadcast/CreateBroadcastModal'
import WriteGate from '@/components/WriteGate'

const URGENCY_COLORS = { low: 'bg-gray-100 text-gray-700', medium: 'bg-blue-100 text-blue-800', high: 'bg-orange-100 text-orange-800', urgent: 'bg-red-100 text-red-800' }
const STATUS_COLORS = { open: 'bg-green-100 text-green-800', in_review: 'bg-blue-100 text-blue-800', awarded: 'bg-purple-100 text-purple-800', completed: 'bg-gray-100 text-gray-800', cancelled: 'bg-gray-100 text-gray-500', expired: 'bg-yellow-100 text-yellow-700' }

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }

function ServiceRequestsContent({ subscriberType, entityId, canWrite = true, accessState = 'subscribed' }) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const deepLinked = searchParams?.get('broadcast') || null
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [responses, setResponses] = useState([])
  const [loadingResponses, setLoadingResponses] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true)

    // Resolve current user's profile id to scope "my" broadcasts
    let profileId = null
    if (!entityId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()
        profileId = profile?.id
      }
    }

    let query = supabase.from('service_broadcasts').select('*').order('created_at', { ascending: false })
    // Scope to entity when viewing company/provider member context
    if (entityId && subscriberType === 'company') query = query.eq('company_id', entityId)
    else if (entityId && subscriberType === 'service_provider') query = query.eq('service_provider_id', entityId)
    // Scope to the logged-in user's own broadcasts (not all broadcasts of that type)
    else if (profileId) query = query.eq('posted_by', profileId).eq('poster_type', subscriberType)
    else query = query.eq('poster_type', subscriberType)

    const { data } = await query
    setBroadcasts(data || [])
    if (initial) setLoading(false); else setRefreshing(false)
  }, [supabase, entityId, subscriberType])

  useEffect(() => { load(true) }, [load])
  useEffect(() => {
    if (deepLinked && !loading && broadcasts.length > 0) {
      const found = broadcasts.find(b => b.id === deepLinked)
      if (found) { setExpandedId(found.id); setStatusFilter('all'); loadResponses(found.id) }
    }
  }, [deepLinked, loading, broadcasts])

  const loadResponses = async (broadcastId) => {
    setLoadingResponses(true)
    const { data } = await supabase.from('service_broadcast_responses')
      .select('*, service_providers(name)')
      .eq('broadcast_id', broadcastId).eq('is_hidden', false)
      .order('created_at', { ascending: true })
    setResponses(data || [])
    setLoadingResponses(false)
  }

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); setResponses([]) }
    else { setExpandedId(id); loadResponses(id) }
  }

  const awardBroadcast = async (broadcastId, responseId, providerName, providerId, broadcastTitle, broadcastNumber) => {
    if (!confirm(`Award this broadcast to ${providerName}? All other responses will be rejected.`)) return
    const { data } = await supabase.rpc('award_broadcast', { p_broadcast_id: broadcastId, p_response_id: responseId })
    const res = typeof data === 'string' ? JSON.parse(data) : data
    if (res?.success) {
      await load(); loadResponses(broadcastId)
      // Send email/SMS notification to the winning provider
      fetch('/api/service-broadcast/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'award',
          broadcast_id: broadcastId,
          broadcast_number: broadcastNumber || res.broadcast_number,
          broadcast_title: broadcastTitle,
          winner_provider_id: providerId,
          response_id: responseId,
        }),
      }).catch(() => {})
    }
    else alert(res?.error || 'Failed to award')
  }

  const cancelBroadcast = async (id) => {
    if (!confirm('Cancel this broadcast? This cannot be undone.')) return
    await supabase.from('service_broadcasts').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id)
    await load()
  }

  const filtered = statusFilter === 'all' ? broadcasts : statusFilter === 'active'
    ? broadcasts.filter(b => ['open', 'in_review'].includes(b.status))
    : broadcasts.filter(b => b.status === statusFilter)

  if (loading) return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={28} /></div>
      <CreateBroadcastModal isOpen={showModal} onClose={() => setShowModal(false)} onSubmitted={() => load()} supabase={supabase} contextType={subscriberType} />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Megaphone size={24} className="text-emerald-600" /> Service Requests</h1>
          <p className="text-sm text-gray-500 mt-1">{broadcasts.length} broadcast{broadcasts.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} disabled={refreshing} className="p-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <WriteGate canWrite={canWrite} state={accessState}>
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 shadow-sm">
            <Plus size={16} /> New Request
          </button>
          </WriteGate>
        </div>
      </div>

      <p className="text-sm text-gray-600 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2.5">
        Describe what you need — verified service providers will send you proposals with pricing and availability. Review, compare, and accept the best fit.
      </p>

      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-[11px] w-fit">
        {['all', 'active', 'awarded', 'completed', 'cancelled'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-2.5 py-1 rounded-md capitalize ${statusFilter === f ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500'}`}>
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Megaphone size={44} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No broadcasts found.</p>
          <WriteGate canWrite={canWrite} state={accessState} inline>
          <button onClick={() => setShowModal(true)} className="mt-4 text-sm text-emerald-600 font-medium">Post your first service request →</button>
          </WriteGate>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => {
            const isExp = expandedId === b.id
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-4 cursor-pointer hover:bg-gray-50/50" onClick={() => toggleExpand(b.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{b.broadcast_number}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[b.status] || ''}`}>{b.status}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${URGENCY_COLORS[b.urgency] || ''}`}>{b.urgency}</span>
                        {b.response_count > 0 && <span className="text-[10px] text-blue-600 font-medium">{b.response_count} response{b.response_count !== 1 ? 's' : ''}</span>}
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{b.title}</h3>
                      {!isExp && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xl">{b.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-[10px] text-gray-400">{fmtDate(b.created_at)}</p>
                      {isExp ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/30">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{b.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {b.service_category && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{b.service_category}</span>}
                      {b.location && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex items-center gap-0.5"><MapPin size={8} />{b.location}</span>}
                      {b.budget_estimate && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex items-center gap-0.5"><DollarSign size={8} />{b.budget_estimate}</span>}
                      {b.preferred_start && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex items-center gap-0.5"><Clock size={8} />Start: {fmtDate(b.preferred_start)}</span>}
                    </div>

                    {b.is_hidden && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">This broadcast has been hidden by an administrator.</p>}

                    {/* Responses */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Responses ({responses.length})</p>
                      {loadingResponses ? <Loader2 size={14} className="animate-spin text-gray-400" /> :
                        responses.length === 0 ? <p className="text-xs text-gray-400">No responses yet.</p> :
                        <div className="space-y-2">
                          {responses.map(r => (
                            <div key={r.id} className={`border rounded-lg p-4 space-y-2 ${r.status === 'accepted' ? 'border-green-300 bg-green-50' : r.status === 'rejected' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Wrench size={12} className="text-gray-400" />
                                  <span className="text-sm font-semibold text-gray-900">{r.service_providers?.name || 'Provider'}</span>
                                  {r.status === 'accepted' && <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-0.5"><Award size={8} />ACCEPTED</span>}
                                  {r.status === 'rejected' && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">REJECTED</span>}
                                </div>
                                <span className="text-[10px] text-gray-400">{fmtDate(r.created_at)}</span>
                              </div>
                              <p className="text-xs text-gray-700">{r.proposal_text}</p>
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                {r.quoted_price && <span className="font-mono">KES {Number(r.quoted_price).toLocaleString()}</span>}
                                {r.estimated_duration && <span>{r.estimated_duration}</span>}
                                {r.availability && <span>{r.availability}</span>}
                              </div>
                              {b.status === 'open' && r.status === 'submitted' && (
                                <button onClick={() => awardBroadcast(b.id, r.id, r.service_providers?.name, r.provider_id, b.title, b.broadcast_number)}
                                  className="mt-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 flex items-center gap-1">
                                  <Star size={10} /> Accept Proposal
                                </button>
                              )}
                              {r.status === 'accepted' && r.provider_id && (
                                <a href={`/dashboard/chat?provider=${r.provider_id}`}
                                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-700 text-white text-xs font-medium rounded-lg hover:bg-green-800">
                                  <MessageSquare size={10} /> Chat with {r.service_providers?.name || 'Provider'}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      }
                    </div>

                    {b.status === 'open' && (
                      <button onClick={() => cancelBroadcast(b.id)} className="text-xs text-red-600 hover:text-red-700 font-medium">Cancel this broadcast</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <CreateBroadcastModal isOpen={showModal} onClose={() => setShowModal(false)} onSubmitted={() => load()} supabase={supabase} contextType={subscriberType} />
    </div>
  )
}

export default function ServiceRequestsPage({ subscriberType, entityId, canWrite, accessState }) {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={28} /></div>}>
      <ServiceRequestsContent subscriberType={subscriberType} entityId={entityId} canWrite={canWrite} accessState={accessState} />
    </Suspense>
  )
}