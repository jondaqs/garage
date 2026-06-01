// → Drop this file at: src/app/provider/providers/[id]/page.js
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Star, MapPin, Phone, Mail, Globe, BadgeCheck, Shield,
  Award, Clock, Wrench, MessageSquare, ChevronLeft,
  ChevronRight, CheckCircle, Building2, Loader2
} from 'lucide-react'

function StarRow({ rating, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={size}
          className={n <= Math.round(rating)
            ? 'text-yellow-400 fill-yellow-400'
            : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  )
}

const REVIEWS_PER_PAGE = 5

export default function ProviderPeerDetailPage() {
  const router  = useRouter()
  const params  = useParams()
  const supabase = createClient()
  const { id }  = params

  const [provider, setProvider] = useState(null)
  const [reviews,  setReviews]  = useState([])
  const [services, setServices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('overview')
  const [reviewPage,   setReviewPage]   = useState(0)
  const [startingChat, setStartingChat] = useState(false)
  const [isOwnProvider, setIsOwnProvider] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: p } = await supabase
        .from('service_providers')
        .select(`
          *,
          provider_type:service_provider_types(id, display_name, code, description),
          shops(id, name, town, county, latitude, longitude),
          provider_reviews(rating)
        `)
        .eq('id', id)
        .single()

      if (!p) { router.replace('/provider/providers'); return }

      // Sanity: prevent the page from being used to chat with your own provider.
      // The list-page RPC excludes self, but a direct URL could still land here.
      // Mirror the RPC's exclusion logic — owner / SPU / mechanic.
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prof } = await supabase
          .from('user_profiles').select('id')
          .eq('auth_user_id', user.id).maybeSingle()
        if (prof?.id) {
          const [{ data: ownAsOwner }, { data: ownAsSpu }, { data: ownAsMech }] = await Promise.all([
            supabase.from('service_providers').select('id')
              .eq('id', id).eq('owner_user_id', prof.id).maybeSingle(),
            supabase.from('service_provider_users').select('service_provider_id')
              .eq('service_provider_id', id).eq('user_id', prof.id).eq('is_active', true).maybeSingle(),
            supabase.from('mechanics').select('service_provider_id')
              .eq('service_provider_id', id).eq('user_id', prof.id).eq('is_active', true).maybeSingle(),
          ])
          if (ownAsOwner?.id || ownAsSpu?.service_provider_id || ownAsMech?.service_provider_id) {
            setIsOwnProvider(true)
          }
        }
      }

      const avgRating = p.provider_reviews?.length
        ? p.provider_reviews.reduce((s, r) => s + r.rating, 0) / p.provider_reviews.length
        : 0

      setProvider({ ...p, avgRating, reviewCount: p.provider_reviews?.length || 0 })

      // Services
      const { data: svcData } = await supabase
        .from('service_provider_services')
        .select('service:services(id, name, description)')
        .eq('service_provider_id', id)
        .eq('is_active', true)
      setServices((svcData || []).map(s => s.service).filter(Boolean))

      // Reviews
      const { data: revData } = await supabase
        .from('provider_reviews')
        .select(`
          id, rating, title, body, review_text, created_at, is_verified, provider_response,
          reviewer:user_profiles!customer_user_id(first_name, last_name)
        `)
        .eq('service_provider_id', id)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
      setReviews(revData || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // ── Start (or resume) a peer-provider chat ──
  const handleChat = async () => {
    if (startingChat || isOwnProvider) return
    setStartingChat(true)
    try {
      const { data: convId, error } = await supabase.rpc('start_or_get_peer_conversation', {
        p_target_provider_id: id,
      })
      if (error) throw error
      router.push(`/provider/peer-chat?conversation=${convId}`)
    } catch (err) {
      console.error('start_or_get_peer_conversation failed:', err)
      alert(err.message || 'Could not start chat')
      setStartingChat(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <Loader2 className="animate-spin text-green-500 mx-auto mb-3" size={32} />
        <p className="text-gray-500 text-sm">Loading provider…</p>
      </div>
    </div>
  )

  if (!provider) return null

  const tabs = [
    { id: 'overview',   label: 'Overview' },
    { id: 'services',   label: `Services${services.length ? ` (${services.length})` : ''}` },
    { id: 'reviews',    label: `Reviews${reviews.length ? ` (${reviews.length})` : ''}` },
    ...(provider.shops?.length ? [{ id: 'locations', label: `Locations (${provider.shops.length})` }] : []),
  ]

  const dist = [5,4,3,2,1].map(n => ({
    n, count: reviews.filter(r => r.rating === n).length,
  }))

  const totalPages = Math.ceil(reviews.length / REVIEWS_PER_PAGE)
  const paginatedReviews = reviews.slice(reviewPage * REVIEWS_PER_PAGE, (reviewPage + 1) * REVIEWS_PER_PAGE)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-green-900 text-white">
        <div className="max-w-4xl mx-auto px-4 pt-6 pb-8">
          <button onClick={() => router.back()}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft size={16} /> Back
          </button>

          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-green-700 flex items-center justify-center text-white font-bold text-2xl shadow-xl flex-shrink-0">
              {provider.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold leading-tight">{provider.name}</h1>
                {provider.is_verified && (
                  <BadgeCheck size={22} className="text-green-400 flex-shrink-0" />
                )}
              </div>
              <p className="text-green-300 text-sm mt-1 font-medium">
                {provider.provider_type?.display_name}
              </p>
              {provider.provider_type?.description && (
                <p className="text-white/50 text-xs mt-0.5">{provider.provider_type.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 mt-3">
                {provider.avgRating > 0 && (
                  <div className="flex items-center gap-1.5">
                    <StarRow rating={provider.avgRating} size={14} />
                    <span className="text-white font-semibold text-sm">{provider.avgRating.toFixed(1)}</span>
                    <span className="text-white/40 text-xs">({provider.reviewCount} reviews)</span>
                  </div>
                )}
                {provider.shops?.[0] && (
                  <div className="flex items-center gap-1 text-white/50 text-xs">
                    <MapPin size={12} />
                    {[provider.shops[0].town, provider.shops[0].county].filter(Boolean).join(', ')}
                  </div>
                )}
                {provider.years_in_operation > 0 && (
                  <div className="flex items-center gap-1 text-white/50 text-xs">
                    <Clock size={12} />
                    {provider.years_in_operation} yr{provider.years_in_operation !== 1 ? 's' : ''} in business
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CTA row — provider-to-provider: chat only */}
          <div className="flex gap-3 mt-6">
            {isOwnProvider ? (
              <div className="px-5 py-2.5 bg-white/10 rounded-xl text-sm text-white/70 border border-white/20">
                This is your own provider profile.
              </div>
            ) : (
              <button
                onClick={handleChat}
                disabled={startingChat}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-400 rounded-xl text-sm font-semibold transition-colors shadow-lg disabled:opacity-60"
              >
                {startingChat
                  ? <Loader2 size={15} className="animate-spin" />
                  : <MessageSquare size={15} />}
                {startingChat ? 'Opening chat…' : 'Chat with Provider'}
              </button>
            )}
          </div>

          {/* Helper note: makes purpose explicit */}
          {!isOwnProvider && (
            <p className="text-white/50 text-xs mt-3 max-w-xl">
              Reach out to coordinate peer-to-peer collaboration: parts referrals, subcontracting, or just to introduce yourselves.
            </p>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-green-400 text-white'
                    : 'border-transparent text-white/50 hover:text-white/80'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {provider.description && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">About</h2>
                <p className="text-gray-600 leading-relaxed">{provider.description}</p>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {provider.avgRating > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
                  <p className="text-3xl font-bold text-yellow-500">{provider.avgRating.toFixed(1)}</p>
                  <StarRow rating={provider.avgRating} size={13} />
                  <p className="text-xs text-gray-400 mt-1">Rating</p>
                </div>
              )}
              {provider.reviewCount > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
                  <p className="text-3xl font-bold text-green-600">{provider.reviewCount}</p>
                  <p className="text-xs text-gray-400 mt-1">Reviews</p>
                </div>
              )}
              {services.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
                  <p className="text-3xl font-bold text-emerald-500">{services.length}</p>
                  <p className="text-xs text-gray-400 mt-1">Services</p>
                </div>
              )}
            </div>

            {/* Verifications */}
            {(provider.is_verified || provider.kra_pin_verified || provider.registration_verified || provider.location_verified || provider.verification_score > 0) && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Verifications</h2>
                {provider.verification_score > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500">Trust Score</span>
                      <span className={`text-sm font-bold ${
                        provider.verification_score >= 80 ? 'text-green-600' :
                        provider.verification_score >= 50 ? 'text-yellow-600' :
                        'text-gray-500'
                      }`}>{provider.verification_score}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${
                        provider.verification_score >= 80 ? 'bg-green-500' :
                        provider.verification_score >= 50 ? 'bg-yellow-500' :
                        'bg-gray-400'
                      }`} style={{ width: `${provider.verification_score}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {provider.is_verified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs font-medium">
                      <CheckCircle size={13} /> Platform Verified
                    </span>
                  )}
                  {provider.kra_pin_verified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-xs font-medium">
                      <Shield size={13} /> KRA Pin Verified
                    </span>
                  )}
                  {provider.registration_verified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl text-xs font-medium">
                      <Award size={13} /> Registered Business
                    </span>
                  )}
                  {provider.location_verified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-xs font-medium">
                      <MapPin size={13} /> Location Verified
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Contact */}
            {(provider.phone || provider.email || provider.website) && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact</h2>
                <div className="space-y-3">
                  {provider.phone && (
                    <a href={`tel:${provider.phone}`}
                      className="flex items-center gap-3 text-sm text-gray-700 hover:text-green-700 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Phone size={14} className="text-gray-500" />
                      </div>
                      {provider.phone}
                    </a>
                  )}
                  {provider.email && (
                    <a href={`mailto:${provider.email}`}
                      className="flex items-center gap-3 text-sm text-gray-700 hover:text-green-700 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Mail size={14} className="text-gray-500" />
                      </div>
                      {provider.email}
                    </a>
                  )}
                  {provider.website && (
                    <a href={provider.website} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 text-sm text-green-700 hover:underline">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Globe size={14} className="text-gray-500" />
                      </div>
                      {provider.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Primary shop map */}
            {provider.shops?.[0]?.latitude && provider.shops?.[0]?.longitude && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <iframe
                  title="Provider location"
                  width="100%" height="240"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://maps.google.com/maps?q=${provider.shops[0].latitude},${provider.shops[0].longitude}&z=15&output=embed&hl=en`}
                />
                <div className="px-5 py-3 flex items-center gap-2 text-sm text-gray-600">
                  <MapPin size={13} className="text-gray-400" />
                  {[provider.shops[0].name, provider.shops[0].town, provider.shops[0].county].filter(Boolean).join(', ')}
                </div>
              </div>
            )}

            {/* Services preview */}
            {services.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Services</h2>
                  {services.length > 6 && (
                    <button onClick={() => setTab('services')}
                      className="text-xs text-green-700 hover:underline">View all</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {services.slice(0, 10).map(s => (
                    <span key={s.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-xl text-xs font-medium">
                      <Wrench size={11} /> {s.name}
                    </span>
                  ))}
                  {services.length > 10 && (
                    <button onClick={() => setTab('services')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200">
                      +{services.length - 10} more
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SERVICES */}
        {tab === 'services' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            {services.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="mx-auto text-gray-200 mb-3" size={40} />
                <p className="text-gray-400">No services listed</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {services.map(s => (
                  <div key={s.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl hover:bg-green-50 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Wrench size={15} className="text-green-700" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                      {s.description && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* REVIEWS */}
        {tab === 'reviews' && (
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
                <Star className="mx-auto text-gray-200 mb-3" size={40} />
                <p className="text-gray-400">No reviews yet</p>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-5xl font-bold text-gray-900">{provider.avgRating.toFixed(1)}</p>
                    <StarRow rating={provider.avgRating} size={18} />
                    <p className="text-xs text-gray-400 mt-1">{reviews.length} reviews</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {dist.map(({ n, count }) => {
                      const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0
                      return (
                        <div key={n} className="flex items-center gap-2 text-xs">
                          <span className="w-3 text-right text-gray-500">{n}</span>
                          <Star size={10} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-gray-400">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Review list */}
                <div className="space-y-3">
                  {paginatedReviews.map(r => {
                    const name = r.reviewer
                      ? `${r.reviewer.first_name || ''} ${r.reviewer.last_name?.[0] || ''}.`.trim()
                      : 'Customer'
                    const text = r.body || r.review_text || ''
                    return (
                      <div key={r.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                              {name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{name}</p>
                              {r.is_verified && (
                                <span className="text-xs text-green-700 flex items-center gap-0.5">
                                  <CheckCircle size={10} /> Verified customer
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <StarRow rating={r.rating} size={13} />
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        {r.title && <p className="text-sm font-semibold text-gray-800 mb-1">{r.title}</p>}
                        {text && <p className="text-sm text-gray-600 leading-relaxed">{text}</p>}
                        {r.provider_response && (
                          <div className="mt-3 pl-4 border-l-2 border-green-200 bg-green-50 rounded-r-xl p-3">
                            <p className="text-xs font-semibold text-green-700 mb-1">Provider response</p>
                            <p className="text-xs text-gray-600">{r.provider_response}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <button onClick={() => setReviewPage(p => Math.max(0, p - 1))} disabled={reviewPage === 0}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50 transition-colors">
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <span className="text-sm text-gray-500">Page {reviewPage + 1} of {totalPages}</span>
                    <button onClick={() => setReviewPage(p => Math.min(totalPages - 1, p + 1))} disabled={reviewPage >= totalPages - 1}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-30 hover:bg-gray-50 transition-colors">
                      Next <ChevronRight size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* LOCATIONS */}
        {tab === 'locations' && (
          <div className="space-y-4">
            {provider.shops?.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
                <Building2 className="mx-auto text-gray-200 mb-3" size={40} />
                <p className="text-gray-400">No shop locations listed</p>
              </div>
            ) : (
              provider.shops.map((shop, i) => (
                <div key={shop.id || i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {shop.latitude && shop.longitude ? (
                    <iframe
                      title={shop.name || `Shop ${i + 1}`}
                      width="100%" height="220"
                      style={{ border: 0, display: 'block' }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${shop.latitude},${shop.longitude}&z=15&output=embed&hl=en`}
                    />
                  ) : (
                    <div className="h-20 bg-gray-100 flex items-center justify-center">
                      <p className="text-xs text-gray-400">No coordinates available</p>
                    </div>
                  )}
                  <div className="px-5 py-4">
                    {shop.name && <p className="font-semibold text-gray-800 text-sm">{shop.name}</p>}
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin size={13} className="text-gray-400" />
                      {[shop.town, shop.county].filter(Boolean).join(', ')}
                    </p>
                    {shop.latitude && shop.longitude && (
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`}
                        target="_blank" rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-green-700 font-medium hover:underline">
                        Get directions →
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}