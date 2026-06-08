// → Drop this file at: src/app/dashboard/company/[companyId]/providers/page.js
'use client'

/* ============================================================================
 * Find Providers — team-company member surface.
 *
 * Path: /dashboard/company/[companyId]/providers
 *
 * Purpose: lets a company member (with is_admin OR can_chat) discover service
 * providers and start a conversation ON BEHALF OF the company. The Chat CTA
 * routes to /dashboard/company/[companyId]/chat?provider=<id>, where the team
 * chat page creates a company-scoped conversation (sender_role = 'company',
 * company_unread_count tracked). View-details routes to the in-context
 * provider detail under /dashboard/company/[companyId]/providers/[id].
 *
 * The list/filters/cards are intentionally identical to /company/providers
 * (the company-owner equivalent); only the navigation targets and the auth
 * gate differ.
 * ============================================================================ */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  Search, MapPin, Star, BadgeCheck, Filter, X, ChevronRight,
  Map, List, Loader2, Wrench, MessageSquare, SlidersHorizontal,
  Building2, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react'
import VerificationScore from '@/components/VerificationScore'

const ITEMS_PER_PAGE = 12

export default function CompanyMemberProvidersPage() {
  const router    = useRouter()
  const params    = useParams()
  const companyId = params?.companyId
  const supabase  = createClient()

  // Auth gate: caller must be an active company member with is_admin OR can_chat
  const [authState,  setAuthState]  = useState('checking')   // checking | ok | denied
  const [denyReason, setDenyReason] = useState('')
  const [company,    setCompany]    = useState(null)         // { id, name }

  useEffect(() => {
    const check = async () => {
      if (!companyId) return
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.push('/auth/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', authUser.id).single()
      if (!profile) { setAuthState('denied'); setDenyReason('Profile not found'); return }
      const { data: cu } = await supabase
        .from('company_users')
        .select('is_admin, can_chat, is_active, company_profiles_secure!company_id(id, name)')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .maybeSingle()
      if (!cu || !cu.is_active) {
        setAuthState('denied')
        setDenyReason('You are not an active member of this company.')
        return
      }
      if (!(cu.is_admin || cu.can_chat)) {
        setAuthState('denied')
        setDenyReason('You don\u2019t have chat permission for this company. Ask an admin to enable it.')
        return
      }
      setCompany({ id: cu.company_profiles_secure.id, name: cu.company_profiles_secure.name })
      setAuthState('ok')
    }
    check()
  }, [companyId])

  const [providers,   setProviders]   = useState([])
  const [types,       setTypes]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [viewMode,    setViewMode]    = useState('list') // 'list' | 'map'
  const [page,        setPage]        = useState(0)
  const [total,       setTotal]       = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  // Filters
  const [search,      setSearch]      = useState('')
  const [descSearch,  setDescSearch]  = useState('')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [verifiedOnly,   setVerifiedOnly]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('service_providers_secure')
        .select(`
          id, name, description, is_verified, phone, email, website,
          years_in_operation, kra_pin_verified, registration_verified, location_verified,
          verification_score,
          provider_type:service_provider_types(id, display_name, code, description),
          shops_secure(id, name, town, county, latitude, longitude),
          provider_reviews(rating),
          service_provider_services(service:services(id, name))
        `, { count: 'exact' })
        .eq('status', 'active')
        .eq('is_active', true)

      if (search)       q = q.ilike('name', `%${search}%`)
      if (descSearch)   q = q.ilike('description', `%${descSearch}%`)
      if (typeFilter)   q = q.eq('provider_type_id', typeFilter)
      if (verifiedOnly) q = q.eq('is_verified', true)
      if (locationFilter) {
        // Filter by shop town/county — we can't do a direct join filter with count in one call,
        // so we'll post-filter after fetch
      }

      const { data, count, error } = await q
        .order('is_verified', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1)

      if (error) throw error

      let results = (data || []).map(p => ({
        ...p,
        avgRating:   p.provider_reviews?.length
          ? p.provider_reviews.reduce((s, r) => s + r.rating, 0) / p.provider_reviews.length
          : 0,
        reviewCount: p.provider_reviews?.length || 0,
        services:    (p.service_provider_services || []).map(s => s.service).filter(Boolean),
      }))

      // Post-filter by location
      if (locationFilter.trim()) {
        const loc = locationFilter.toLowerCase()
        results = results.filter(p =>
          p.shops?.some(s =>
            s.town?.toLowerCase().includes(loc) ||
            s.county?.toLowerCase().includes(loc) ||
            s.name?.toLowerCase().includes(loc)
          )
        )
      }

      setProviders(results)
      setTotal(count || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search, descSearch, typeFilter, locationFilter, verifiedOnly, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('service_provider_types')
      .select('id, display_name, code')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setTypes(data || []))
  }, [])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [search, descSearch, typeFilter, locationFilter, verifiedOnly])

  // Map rendering
  useEffect(() => {
    if (viewMode !== 'map') return
    if (typeof window === 'undefined') return

    const providersWithCoords = providers.filter(p =>
      p.shops?.some(s => s.latitude && s.longitude)
    )

    // Build simple iframe map or use Leaflet-like approach
    // We'll render a simple grid of mini maps + a summary map using Google Maps embed
    // For the interactive map we render the map div with markers via inline approach
    if (mapRef.current) {
      mapRef.current.innerHTML = ''

      if (providersWithCoords.length === 0) {
        mapRef.current.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-400">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <p class="mt-3 text-sm">No location data available for current results</p>
        </div>`
        return
      }

      // Center on first provider with coords
      const first = providersWithCoords[0].shops.find(s => s.latitude && s.longitude)
      const lat = first.latitude, lng = first.longitude

      const iframe = document.createElement('iframe')
      iframe.style.width = '100%'
      iframe.style.height = '100%'
      iframe.style.border = '0'
      iframe.style.borderRadius = '12px'
      iframe.loading = 'lazy'

      // Build markers query for all providers with coords
      const markers = providersWithCoords.flatMap(p =>
        p.shops.filter(s => s.latitude && s.longitude).map(s =>
          `markers=color:blue%7Clabel:${encodeURIComponent(p.name[0])}%7C${s.latitude},${s.longitude}`
        )
      ).slice(0, 20).join('&')

      iframe.src = `https://maps.google.com/maps?q=${lat},${lng}&z=10&output=embed&hl=en`
      mapRef.current.appendChild(iframe)
    }
  }, [viewMode, providers])

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  // ── Auth gates ──────────────────────────────────────────────────────────
  if (authState === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="animate-spin text-gray-300" size={32} />
      </div>
    )
  }
  if (authState === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8 text-center">
        <AlertCircle size={48} className="text-gray-300 mb-4" />
        <p className="text-gray-700 font-semibold mb-1">Provider directory unavailable</p>
        <p className="text-gray-500 text-sm max-w-md">{denyReason}</p>
        <button
          onClick={() => router.push(companyId ? `/dashboard/company/${companyId}` : '/dashboard')}
          className="mt-6 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Back to dashboard
        </button>
      </div>
    )
  }

  const handleChat = async (e, provider) => {
    e.stopPropagation()
    router.push(`/dashboard/company/${companyId}/chat?provider=${provider.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Find a Service Provider</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {total} provider{total !== 1 ? 's' : ''} available
                {company?.name && (
                  <>
                    {' \u00b7 '}
                    <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                      <Building2 size={11} /> {company.name}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                title="List view"
              >
                <List size={18} />
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'map' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                title="Map view"
              >
                <Map size={18} />
              </button>
            </div>
          </div>

          {/* Search bars — always visible */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by provider name…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              />
            </div>
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={descSearch}
                onChange={e => setDescSearch(e.target.value)}
                placeholder="Search by description…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              />
            </div>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors flex-shrink-0 ${filtersOpen ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              <SlidersHorizontal size={15} />
              Filters
              {(typeFilter || locationFilter || verifiedOnly) && (
                <span className="w-2 h-2 rounded-full bg-orange-400" />
              )}
            </button>
          </div>

          {/* Expanded filters — location, type, verified */}
          {filtersOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <div className="relative">
                <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  placeholder="Town or county…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">All types</option>
                {types.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={e => setVerifiedOnly(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-gray-700 font-medium">Verified only</span>
              </label>
              {(typeFilter || locationFilter || verifiedOnly || descSearch || search) && (
                <button
                  onClick={() => { setSearch(''); setDescSearch(''); setTypeFilter(''); setLocationFilter(''); setVerifiedOnly(false) }}
                  className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 px-3 py-2"
                >
                  <X size={13} /> Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Map view */}
        {viewMode === 'map' && (
          <div className="mb-6">
            <div
              ref={mapRef}
              className="w-full h-[420px] bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 flex items-center justify-center"
            >
              <Loader2 className="animate-spin text-gray-400" size={28} />
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Showing locations for providers with available coordinates. Switch to List view to see all.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="animate-spin text-blue-500 mb-3" size={32} />
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
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onClick={() => router.push(`/dashboard/company/${companyId}/providers/${p.id}`)}
                  onChat={e => handleChat(e, p)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
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
                      <button
                        key={pg}
                        onClick={() => setPage(pg)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          pg === page
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {pg + 1}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
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

function ProviderCard({ provider: p, onClick, onChat }) {
  const [expanded, setExpanded] = useState(false)
  const primaryShop = p.shops?.[0]
  const shownServices = expanded ? p.services : p.services?.slice(0, 4)

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group overflow-hidden"
    >
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-400" />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 text-white font-bold text-lg shadow-sm">
            {p.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">{p.name}</h3>
              {p.is_verified && (
                <BadgeCheck size={14} className="text-blue-500 flex-shrink-0" />
              )}
              {p.verification_score > 0 && (
                <VerificationScore score={p.verification_score} />
              )}
            </div>
            <p className="text-xs text-blue-600 mt-0.5 font-medium">{p.provider_type?.display_name}</p>
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-1" />
        </div>

        {/* Rating */}
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

        {/* Description */}
        {p.description && (
          <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-2">{p.description}</p>
        )}

        {/* Location */}
        {primaryShop && (
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
            <MapPin size={11} className="flex-shrink-0" />
            {[primaryShop.town, primaryShop.county].filter(Boolean).join(', ')}
          </div>
        )}

        {/* Services */}
        {p.services?.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {shownServices.map(s => (
                <span key={s.id}
                  className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[11px] font-medium">
                  {s.name}
                </span>
              ))}
              {p.services.length > 4 && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                  className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[11px] font-medium hover:bg-blue-100 transition-colors"
                >
                  {expanded ? 'Less' : `+${p.services.length - 4}`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* CTA row */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <button
            onClick={onChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-blue-50 hover:text-blue-600 text-gray-600 text-xs font-medium transition-colors"
          >
            <MessageSquare size={12} /> Chat
          </button>
          <span className="flex-1" />
          <span className="text-xs text-blue-500 font-medium group-hover:underline">View details →</span>
        </div>
      </div>
    </div>
  )
}