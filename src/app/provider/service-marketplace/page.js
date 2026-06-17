// src/app/provider/service-marketplace/page.js
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Megaphone, Plus, Loader2, RefreshCw, ChevronDown, ChevronUp,
  Clock, CheckCircle, XCircle, MapPin, DollarSign, Eye, FileText, Award,
  Building2, User, Wrench, Star, Search,
} from 'lucide-react'
import CreateBroadcastModal from '@/components/broadcast/CreateBroadcastModal'
import RespondToBroadcastModal from '@/components/broadcast/RespondToBroadcastModal'

const URGENCY_COLORS = { low: 'bg-gray-100 text-gray-700', medium: 'bg-blue-100 text-blue-800', high: 'bg-orange-100 text-orange-800', urgent: 'bg-red-100 text-red-800' }
const STATUS_COLORS = { open: 'bg-green-100 text-green-800', in_review: 'bg-blue-100 text-blue-800', awarded: 'bg-purple-100 text-purple-800', completed: 'bg-gray-100 text-gray-800', cancelled: 'bg-gray-100 text-gray-500', expired: 'bg-yellow-100 text-yellow-700' }
const RESP_STATUS_COLORS = { submitted: 'bg-blue-100 text-blue-800', shortlisted: 'bg-purple-100 text-purple-800', accepted: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800', withdrawn: 'bg-gray-100 text-gray-500' }
const POSTER_ICON = { individual: User, company: Building2, service_provider: Wrench }

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }

function ProviderMarketplaceContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const initialView = searchParams?.get('view') || 'browse'
  const [tab, setTab] = useState(initialView)

  // Browse state
  const [allBroadcasts, setAllBroadcasts] = useState([])
  const [loadingBrowse, setLoadingBrowse] = useState(true)
  const [refreshingBrowse, setRefreshingBrowse] = useState(false)
  const [browseExpanded, setBrowseExpanded] = useState(searchParams?.get('broadcast') || null)
  const [searchQuery, setSearchQuery] = useState('')

  // My responses state
  const [myResponses, setMyResponses] = useState([])
  const [loadingResponses, setLoadingResponses] = useState(true)
  const [refreshingResponses, setRefreshingResponses] = useState(false)
  const [responseExpanded, setResponseExpanded] = useState(null)

  // My broadcasts (provider posting their own needs)
  const [myBroadcasts, setMyBroadcasts] = useState([])
  const [loadingMyBroadcasts, setLoadingMyBroadcasts] = useState(true)

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [respondingTo, setRespondingTo] = useState(null)
  const [profileId, setProfileId] = useState(null)

  const loadBrowse = useCallback(async (initial = false) => {
    if (initial) setLoadingBrowse(true); else setRefreshingBrowse(true)
    // Exclude this user's own broadcasts so providers only see others' requests
    let query = supabase.from('service_broadcasts')
      .select('*').eq('status', 'open').eq('is_hidden', false)
      .order('created_at', { ascending: false })
    if (profileId) query = query.neq('posted_by', profileId)
    const { data } = await query
    setAllBroadcasts(data || [])
    if (initial) setLoadingBrowse(false); else setRefreshingBrowse(false)
  }, [supabase, profileId])

  const loadMyResponses = useCallback(async (initial = false) => {
    if (initial) setLoadingResponses(true); else setRefreshingResponses(true)
    const { data } = await supabase.from('service_broadcast_responses')
      .select('*, service_broadcasts(id, broadcast_number, title, description, status, poster_type, urgency, location, budget_estimate)')
      .order('created_at', { ascending: false })
    setMyResponses(data || [])
    if (initial) setLoadingResponses(false); else setRefreshingResponses(false)
  }, [supabase])

  const loadMyBroadcasts = useCallback(async () => {
    setLoadingMyBroadcasts(true)
    const { data } = await supabase.from('service_broadcasts')
      .select('*').order('created_at', { ascending: false })
    // Filter to only this user's broadcasts (RLS handles but we refine client-side)
    setMyBroadcasts(data || [])
    setLoadingMyBroadcasts(false)
  }, [supabase])

  useEffect(() => {
    // Resolve profile first, then load data
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('user_profiles').select('id').eq('auth_user_id', user.id).single()
          .then(({ data }) => { if (data) setProfileId(data.id) })
      }
    })
    loadMyResponses(true)
    loadMyBroadcasts()
  }, [supabase, loadMyResponses, loadMyBroadcasts])

  // Load browse after profileId is resolved (so the .neq filter works)
  useEffect(() => {
    if (profileId) loadBrowse(true)
  }, [profileId, loadBrowse])

  const filteredBrowse = searchQuery
    ? allBroadcasts.filter(b =>
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.service_category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.location || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allBroadcasts

  const TABS = [
    { id: 'browse', label: 'Browse Requests', icon: Eye, count: allBroadcasts.length },
    { id: 'responses', label: 'My Responses', icon: FileText, count: myResponses.length },
    { id: 'post', label: 'Post Request', icon: Plus },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone size={24} className="text-emerald-600" /> Service Marketplace
        </h1>
        <p className="text-sm text-gray-500 mt-1">Browse requests, submit proposals, manage engagements</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
              {t.count != null && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full ml-1">{t.count}</span>}
            </button>
          )
        })}
      </div>

      {/* ═══ BROWSE REQUESTS ═══ */}
      {tab === 'browse' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by title, category, location..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={() => loadBrowse()} disabled={refreshingBrowse} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <RefreshCw size={14} className={refreshingBrowse ? 'animate-spin' : ''} />
            </button>
          </div>

          {loadingBrowse ? <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-emerald-600" /></div> :
          filteredBrowse.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Megaphone size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">{searchQuery ? 'No matching requests.' : 'No open service requests at the moment.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBrowse.map(b => {
                const isExp = browseExpanded === b.id
                const PosterIcon = POSTER_ICON[b.poster_type] || User
                return (
                  <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="p-4 cursor-pointer hover:bg-gray-50/50" onClick={() => setBrowseExpanded(isExp ? null : b.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{b.broadcast_number}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${URGENCY_COLORS[b.urgency] || ''}`}>{b.urgency}</span>
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><PosterIcon size={9} />{(b.poster_type || '').replace(/_/g, ' ')}</span>
                            {b.service_category && <span className="text-[10px] text-gray-400">{b.service_category}</span>}
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
                          {b.location && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex items-center gap-0.5"><MapPin size={8} />{b.location}</span>}
                          {b.budget_estimate && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex items-center gap-0.5"><DollarSign size={8} />{b.budget_estimate}</span>}
                          {b.preferred_start && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex items-center gap-0.5"><Clock size={8} />Start: {fmtDate(b.preferred_start)}</span>}
                        </div>
                        <button onClick={() => setRespondingTo(b)}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
                          <FileText size={14} /> Submit Proposal
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ MY RESPONSES ═══ */}
      {tab === 'responses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button onClick={() => loadMyResponses()} disabled={refreshingResponses} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <RefreshCw size={14} className={refreshingResponses ? 'animate-spin' : ''} />
            </button>
          </div>

          {loadingResponses ? <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-blue-600" /></div> :
          myResponses.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <FileText size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">You haven't responded to any broadcasts yet.</p>
              <button onClick={() => setTab('browse')} className="mt-4 text-sm text-emerald-600 font-medium">Browse requests →</button>
            </div>
          ) : (
            <div className="space-y-3">
              {myResponses.map(r => {
                const b = r.service_broadcasts
                const isExp = responseExpanded === r.id
                return (
                  <div key={r.id} className={`bg-white rounded-xl border overflow-hidden shadow-sm ${r.status === 'accepted' ? 'border-green-300' : r.status === 'rejected' ? 'border-gray-200 opacity-70' : 'border-gray-200'}`}>
                    <div className="p-4 cursor-pointer hover:bg-gray-50/50" onClick={() => setResponseExpanded(isExp ? null : r.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{b?.broadcast_number}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${RESP_STATUS_COLORS[r.status] || ''}`}>
                              {r.status === 'accepted' && <Award size={8} className="inline mr-0.5" />}
                              {r.status}
                            </span>
                            {b?.status && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[b.status] || ''}`}>Broadcast: {b.status}</span>}
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{b?.title || 'Broadcast'}</h3>
                          {!isExp && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xl">{r.proposal_text}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-[10px] text-gray-400">{fmtDate(r.created_at)}</p>
                          {isExp ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        </div>
                      </div>
                    </div>
                    {isExp && (
                      <div className="border-t border-gray-100 p-5 space-y-3 bg-gray-50/30">
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Original Request</p>
                          <p className="text-xs text-gray-700">{b?.description}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Your Proposal</p>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.proposal_text}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {r.quoted_price && <span className="font-mono">KES {Number(r.quoted_price).toLocaleString()}</span>}
                          {r.estimated_duration && <span>{r.estimated_duration}</span>}
                          {r.availability && <span>{r.availability}</span>}
                        </div>
                        {r.status === 'accepted' && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-xs text-green-800 font-medium flex items-center gap-1"><Star size={10} /> Your proposal was accepted! Contact the requester to coordinate.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ POST REQUEST ═══ */}
      {tab === 'post' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Post your own service needs</p>
            <button onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 shadow-sm">
              <Plus size={16} /> New Request
            </button>
          </div>

          {loadingMyBroadcasts ? <Loader2 size={24} className="animate-spin text-emerald-600 mx-auto mt-8" /> :
          myBroadcasts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Megaphone size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">You haven't posted any service requests yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myBroadcasts.map(b => (
                <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{b.broadcast_number}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[b.status] || ''}`}>{b.status}</span>
                    {b.response_count > 0 && <span className="text-[10px] text-blue-600 font-medium">{b.response_count} response{b.response_count !== 1 ? 's' : ''}</span>}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{b.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{b.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateBroadcastModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}
        onSubmitted={() => { loadMyBroadcasts(); loadBrowse() }} supabase={supabase} />
      <RespondToBroadcastModal isOpen={!!respondingTo} onClose={() => setRespondingTo(null)}
        onSubmitted={() => { loadMyResponses(); loadBrowse() }} supabase={supabase} broadcast={respondingTo} />
    </div>
  )
}

export default function ProviderMarketplacePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={28} /></div>}>
      <ProviderMarketplaceContent />
    </Suspense>
  )
}