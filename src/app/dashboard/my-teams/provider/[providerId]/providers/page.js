// → Drop this file at: src/app/dashboard/my-teams/provider/[providerId]/providers/page.js
'use client'

/* ============================================================================
 * Provider-member Search Providers — scoped to ONE provider via the route param.
 *
 * Path: /dashboard/my-teams/provider/[providerId]/providers
 *
 * The list is identical to the owner-side /provider/providers page, but:
 *   • the providerId in the URL determines which "own provider" the caller is
 *     acting as when they click "Chat" (matters when a user belongs to
 *     multiple providers);
 *   • the start_or_get_peer_conversation RPC is called with the 2-arg overload
 *     (p_target_provider_id, p_own_provider_id) so the conversation is created
 *     on the correct side;
 *   • route targets are scoped under /dashboard/my-teams/provider/<providerId>/.
 * ============================================================================ */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  Search, MapPin, Star, BadgeCheck, X, ChevronRight,
  Map, List, Loader2, MessageSquare, SlidersHorizontal,
  Building2, AlertCircle
} from 'lucide-react'

const ITEMS_PER_PAGE = 12

export default function MemberSearchProvidersPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const ownProviderId = params?.providerId

  const [authState,    setAuthState]    = useState('checking')
  const [providers,    setProviders]    = useState([])
  const [types,        setTypes]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [viewMode,     setViewMode]     = useState('list')
  const [page,         setPage]         = useState(0)
  const [total,        setTotal]        = useState(0)
  const [filtersOpen,  setFiltersOpen]  = useState(false)
  const [startingChat, setStartingChat] = useState(null)
  const mapRef = useRef(null)

  // Filters
  const [search,         setSearch]         = useState('')
  const [descSearch,     setDescSearch]     = useState('')
  const [typeFilter,     setTypeFilter]     = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [verifiedOnly,   setVerifiedOnly]   = useState(false)

  // ── Verify the caller is a chat-able member of `ownProviderId` ──
  // The RPCs and RLS will reject unauthorised callers anyway, but a clean
  // denied screen is better UX than a silent failure on first chat-attempt.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      if (!profile || cancelled) return

      const [{ data: owner }, { data: spu }, { data: mech }] = await Promise.all([
        supabase.from('service_providers').select('id')
          .eq('id', ownProviderId).eq('owner_user_id', profile.id).maybeSingle(),
        supabase.from('service_provider_users').select('can_chat')
          .eq('service_provider_id', ownProviderId).eq('user_id', profile.id)
          .eq('is_active', true).maybeSingle(),
        supabase.from('mechanics').select('can_chat')
          .eq('service_provider_id', ownProviderId).eq('user_id', profile.id)
          .eq('is_active', true).maybeSingle(),
      ])
      if (cancelled) return

      const canChat = !!owner?.id || !!spu?.can_chat || !!mech?.can_chat
      setAuthState(canChat ? 'ok' : 'denied')
    })()
    return () => { cancelled = true }
  }, [ownProviderId])

  // ── Load providers via RPC (excludes ALL providers the caller belongs to) ──
  const load = useCallback(async () => {
    if (authState !== 'ok') return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('search_providers_for_provider', {
        p_search:           search          || null,
        p_description:      descSearch      || null,
        p_provider_type_id: typeFilter      || null,
        p_location:         locationFilter  || null,
        p_verified_only:    verifiedOnly,
        p_limit:            ITEMS_PER_PAGE,
        p_offset:           page * ITEMS_PER_PAGE,
      })
      if (error) throw error
      const rows = data || []
      setProviders(rows.map(r => ({
        ...r,
        avgRating:   Number(r.avg_rating || 0),
        reviewCount: Number(r.review_count || 0),
        services:    Array.isArray(r.services) ? r.services : [],
        shops:       Array.isArray(r.shops)    ? r.shops    : [],
      })))
      setTotal(Number(rows[0]?.total_count || 0))
    } catch (e) {
      console.error('search_providers_for_provider failed:', e)
      setProviders([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [authState, search, descSearch, typeFilter, locationFilter, verifiedOnly, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('service_provider_types')
      .select('id, display_name, code')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setTypes(data || []))
  }, [])

  useEffect(() => { setPage(0) }, [search, descSearch, typeFilter, locationFilter, verifiedOnly])

  // ── Map rendering ──
  useEffect(() => {
    if (viewMode !== 'map') return
    if (typeof window === 'undefined') return
    const providersWithCoords = providers.filter(p =>
      p.shops?.some(s => s.latitude && s.longitude)
    )
    if (mapRef.current) {
      mapRef.current.innerHTML = ''
      if (providersWithCoords.length === 0) {
        mapRef.current.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-400">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <p class="mt-3 text-sm">No location data available for current results</p>
        </div>`
        return
      }
      const first = providersWithCoords[0].shops.find(s => s.latitude && s.longitude)
      const iframe = document.createElement('iframe')
      iframe.style.width = '100%'
      iframe.style.height = '100%'
      iframe.style.border = '0'
      iframe.style.borderRadius = '12px'
      iframe.loading = 'lazy'
      iframe.src = `https://maps.google.com/maps?q=${first.latitude},${first.longitude}&z=10&output=embed&hl=en`
      mapRef.current.appendChild(iframe)
    }
  }, [viewMode, providers])

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  // ── Start a peer-provider chat — uses the 2-arg overload to lock the
  // initiator side to the provider whose hat the caller is currently wearing.
  const handleChat = async (e, provider) => {
    e.stopPropagation()
    if (startingChat) return
    setStartingChat(provider.id)
    try {
      const { data: convId, error } = await supabase.rpc('start_or_get_peer_conversation', {
        p_target_provider_id: provider.id,
        p_own_provider_id:    ownProviderId,
      })
      if (error) throw error
      router.push(`/dashboard/my-teams/provider/${ownProviderId}/peer-chat?conversation=${convId}`)
    } catch (err) {
      console.error('start_or_get_peer_conversation failed:', err)
      alert(err.message || 'Could not start chat')
      setStartingChat(null)
    }
  }

  // ── Auth states ──
  if (authState === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-gray-300" size={28} />
      </div>
    )
  }
  if (authState === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <AlertCircle size={48} className="text-gray-300 mb-4" />
        <p className="text-gray-500 font-medium">Access not enabled</p>
        <p className="text-gray-400 text-sm mt-1 max-w-md">
          You're not a chat-able member of this provider, so the marketplace isn't available here.
          Ask the provider owner to enable chat for your account.
        </p>
        <button onClick={() => router.push('/dashboard/my-teams')}
          className="mt-4 text-sm text-green-700 hover:underline font-medium">
          ← Back to My Teams
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Search Providers</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {total} provider{total !== 1 ? 's' : ''} available · browse the marketplace and chat with peers
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-100'}`}
                title="List view"><List size={18} /></button>
              <button onClick={() => setViewMode('map')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'map' ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:bg-gray-100'}`}
                title="Map view"><Map size={18} /></button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by provider name…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500 focus:outline-none transition-all" />
            </div>
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={descSearch} onChange={e => setDescSearch(e.target.value)}
                placeholder="Search by description…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500 focus:outline-none transition-all" />
            </div>
            <button onClick={() => setFiltersOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors flex-shrink-0 ${filtersOpen ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <SlidersHorizontal size={15} />
              Filters
              {(typeFilter || locationFilter || verifiedOnly) && <span className="w-2 h-2 rounded-full bg-orange-400" />}
            </button>
          </div>

          {filtersOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3">
              <div className="relative">
                <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                  placeholder="Town or county…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500 focus:outline-none" />
              </div>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500 focus:outline-none">
                <option value="">All types</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
              </select>
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                <input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)}
                  className="w-4 h-4 rounded accent-green-600" />
                <span className="text-sm text-gray-700 font-medium">Verified only</span>
              </label>
              {(typeFilter || locationFilter || verifiedOnly || descSearch || search) && (
                <button onClick={() => { setSearch(''); setDescSearch(''); setTypeFilter(''); setLocationFilter(''); setVerifiedOnly(false) }}
                  className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 px-3 py-2">
                  <X size={13} /> Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {viewMode === 'map' && (
          <div className="mb-6">
            <div ref={mapRef}
              className="w-full h-[420px] bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 flex items-center justify-center">
              <Loader2 className="animate-spin text-gray-400" size={28} />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Showing locations for providers with available coordinates. Switch to List view to see all.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="animate-spin text-green-500 mb-3" size={32} />
            <p className="text-gray-500 text-sm">Loading providers…</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Building2 size={48} className="text-gray-200 mb-4" />
            <p className="text-gray-500 font-medium">No providers found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {providers.map(p => (
                <ProviderCard key={p.id} provider={p}
                  starting={startingChat === p.id}
                  onClick={() => router.push(`/dashboard/my-teams/provider/${ownProviderId}/providers/${p.id}`)}
                  onChat={e => handleChat(e, p)} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pg = i
                    if (totalPages > 7) {
                      if (page < 4) pg = i
                      else if (page > totalPages - 5) pg = totalPages - 7 + i
                      else pg = page - 3 + i
                    }
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${pg === page ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                        {pg + 1}
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ProviderCard({ provider: p, starting, onClick, onChat }) {
  const [expanded, setExpanded] = useState(false)
  const primaryShop = p.shops?.[0]
  const shownServices = expanded ? p.services : p.services?.slice(0, 4)

  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-green-200 transition-all cursor-pointer group overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-green-500 to-green-400" />
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg shadow-sm">
            {p.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">{p.name}</h3>
              {p.is_verified && <BadgeCheck size={14} className="text-green-500 flex-shrink-0" />}
            </div>
            <p className="text-xs text-green-700 mt-0.5 font-medium">{p.provider_type?.display_name}</p>
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-green-400 transition-colors flex-shrink-0 mt-1" />
        </div>

        {p.avgRating > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex items-center">
              {[1,2,3,4,5].map(n => (
                <Star key={n} size={11}
                  className={n <= Math.round(p.avgRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'} />
              ))}
            </div>
            <span className="text-xs font-semibold text-gray-700">{p.avgRating.toFixed(1)}</span>
            <span className="text-xs text-gray-400">({p.reviewCount})</span>
          </div>
        )}

        {p.description && (
          <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-2">{p.description}</p>
        )}

        {primaryShop && (
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
            <MapPin size={11} className="flex-shrink-0" />
            {[primaryShop.town, primaryShop.county].filter(Boolean).join(', ')}
          </div>
        )}

        {p.services?.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {shownServices.map(s => (
                <span key={s.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[11px] font-medium">
                  {s.name}
                </span>
              ))}
              {p.services.length > 4 && (
                <button onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                  className="px-2 py-0.5 bg-green-50 text-green-700 rounded-md text-[11px] font-medium hover:bg-green-100 transition-colors">
                  {expanded ? 'Less' : `+${p.services.length - 4}`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <button onClick={onChat} disabled={starting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-green-50 hover:text-green-700 text-gray-600 text-xs font-medium transition-colors disabled:opacity-60">
            {starting ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
            {starting ? 'Opening…' : 'Chat'}
          </button>
          <span className="flex-1" />
          <span className="text-xs text-green-700 font-medium group-hover:underline">View details →</span>
        </div>
      </div>
    </div>
  )
}