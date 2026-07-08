'use client'

/**
 * ProviderDetailModal
 * Shows full provider details when a provider card is clicked on the booking pages.
 *
 * Props:
 *   provider   — provider object (already enriched with avgRating, reviewCount, shops, etc.)
 *   onClose    — () => void
 *   onBook     — (provider) => void  — called when user clicks "Book Now"
 *   canBook    — boolean  — whether vehicle is selected (controls Book button state)
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Star, MapPin, Phone, Mail, Globe, Shield, Clock,
  Wrench, CheckCircle, ChevronLeft, ChevronRight, Building2,
  BadgeCheck, Calendar, ThumbsUp, Award
} from 'lucide-react'

function StarRow({ rating, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(n => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}
        />
      ))}
    </div>
  )
}

function RatingBar({ label, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-6 text-right text-gray-500">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-gray-400">{pct}%</span>
    </div>
  )
}

export default function ProviderDetailModal({ provider, onClose, onBook, canBook }) {
  const supabase = createClient()
  const [tab, setTab]           = useState('overview')
  const [reviews, setReviews]   = useState([])
  const [services, setServices] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [reviewPage, setReviewPage]   = useState(0)
  const REVIEWS_PER_PAGE = 5

  const loadDetails = useCallback(async () => {
    // Reviews with reviewer name
    const { data: reviewData } = await supabase
      .from('provider_reviews')
      .select(`
        id, rating, title, body, review_text, created_at, is_verified,
        reviewer:user_profiles_secure!customer_user_id(first_name, last_name)
      `)
      .eq('service_provider_id', provider.id)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(50)
    setReviews(reviewData || [])

    // Services offered
    const { data: svcData } = await supabase
      .from('service_provider_services')
      .select('service:services(id, name, description)')
      .eq('service_provider_id', provider.id)
      .eq('is_active', true)
    setServices((svcData || []).map(s => s.service).filter(Boolean))
  }, [provider.id])

  useEffect(() => { loadDetails() }, [loadDetails])

  // Trap scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Rating distribution
  const dist = [5,4,3,2,1].map(n => ({
    n,
    count: reviews.filter(r => r.rating === n).length,
  }))

  const shops      = provider.shops || []
  const hasMap     = shops.some(s => s.latitude && s.longitude)
  const primaryShop = shops[0]
  const paginatedReviews = reviews.slice(reviewPage * REVIEWS_PER_PAGE, (reviewPage + 1) * REVIEWS_PER_PAGE)
  const totalPages = Math.ceil(reviews.length / REVIEWS_PER_PAGE)

  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'services',  label: `Services${services.length ? ` (${services.length})` : ''}` },
    { id: 'reviews',   label: `Reviews${reviews.length ? ` (${reviews.length})` : ''}` },
    ...(shops.length ? [{ id: 'locations', label: `Locations${shops.length > 1 ? ` (${shops.length})` : ''}` }] : []),
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 px-6 pt-6 pb-5 flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 text-white font-bold text-xl shadow-lg">
              {provider.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white leading-tight">{provider.name}</h2>
                {provider.is_verified && (
                  <BadgeCheck size={18} className="text-blue-400 flex-shrink-0" />
                )}
              </div>
              <p className="text-blue-300 text-sm mt-0.5">{provider.provider_type?.display_name}</p>

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {provider.avgRating > 0 && (
                  <div className="flex items-center gap-1.5">
                    <StarRow rating={provider.avgRating} size={13} />
                    <span className="text-white text-sm font-semibold">{provider.avgRating.toFixed(1)}</span>
                    <span className="text-white/50 text-xs">({provider.reviewCount})</span>
                  </div>
                )}
                {primaryShop && (
                  <div className="flex items-center gap-1 text-white/60 text-xs">
                    <MapPin size={11} />
                    {primaryShop.town}{primaryShop.county ? `, ${primaryShop.county}` : ''}
                  </div>
                )}
                {provider.years_in_operation > 0 && (
                  <div className="flex items-center gap-1 text-white/60 text-xs">
                    <Clock size={11} />
                    {provider.years_in_operation} yr{provider.years_in_operation !== 1 ? 's' : ''} in business
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex border-b border-gray-100 bg-white flex-shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="p-6 space-y-5">

              {/* Description */}
              {provider.description && (
                <p className="text-gray-600 text-sm leading-relaxed">{provider.description}</p>
              )}

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3">
                {provider.avgRating > 0 && (
                  <div className="bg-yellow-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{provider.avgRating.toFixed(1)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Avg Rating</p>
                  </div>
                )}
                {provider.reviewCount > 0 && (
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{provider.reviewCount}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Reviews</p>
                  </div>
                )}
                {provider.years_in_operation > 0 && (
                  <div className="bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{provider.years_in_operation}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Years</p>
                  </div>
                )}
              </div>

              {/* Verification badges */}
              {(provider.is_verified || provider.kra_pin_verified || provider.registration_verified || provider.location_verified) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Verifications</p>
                  <div className="flex flex-wrap gap-2">
                    {provider.is_verified && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium">
                        <CheckCircle size={12} /> Platform Verified
                      </span>
                    )}
                    {provider.kra_pin_verified && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-medium">
                        <Shield size={12} /> TAX Pin
                      </span>
                    )}
                    {provider.registration_verified && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs font-medium">
                        <Award size={12} /> Registered Business
                      </span>
                    )}
                    {provider.location_verified && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg text-xs font-medium">
                        <MapPin size={12} /> Location Verified
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Contact */}
              {(provider.phone || provider.email || provider.website) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contact</p>
                  <div className="space-y-2">
                    {provider.phone && (
                      <a href={`tel:${provider.phone}`}
                        className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600 transition-colors">
                        <Phone size={14} className="text-gray-400 flex-shrink-0" />
                        {provider.phone}
                      </a>
                    )}
                    {provider.email && (
                      <a href={`mailto:${provider.email}`}
                        className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600 transition-colors">
                        <Mail size={14} className="text-gray-400 flex-shrink-0" />
                        {provider.email}
                      </a>
                    )}
                    {provider.website && (
                      <a href={provider.website} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-sm text-blue-600 hover:underline">
                        <Globe size={14} className="text-gray-400 flex-shrink-0" />
                        {provider.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Primary shop map preview */}
              {primaryShop?.latitude && primaryShop?.longitude && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Location</p>
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <iframe
                      title={`${provider.name} location`}
                      width="100%"
                      height="200"
                      style={{ border: 0, display: 'block' }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${primaryShop.latitude},${primaryShop.longitude}&z=15&output=embed&hl=en`}
                    />
                    <div className="px-4 py-2.5 flex items-center gap-2 text-sm text-gray-600">
                      <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                      {[primaryShop.name, primaryShop.town, primaryShop.county].filter(Boolean).join(', ')}
                    </div>
                  </div>
                </div>
              )}

              {/* Top services preview */}
              {services.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Services Offered
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {services.slice(0, 8).map(s => (
                      <span key={s.id}
                        className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                        {s.name}
                      </span>
                    ))}
                    {services.length > 8 && (
                      <button onClick={() => setTab('services')}
                        className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                        +{services.length - 8} more
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SERVICES */}
          {tab === 'services' && (
            <div className="p-6">
              {services.length === 0 ? (
                <div className="text-center py-10">
                  <Wrench className="mx-auto text-gray-200 mb-3" size={36} />
                  <p className="text-gray-400 text-sm">No services listed yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services.map(s => (
                    <div key={s.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Wrench size={14} className="text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{s.name}</p>
                        {s.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{s.description}</p>
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
            <div className="p-6 space-y-5">
              {reviews.length === 0 ? (
                <div className="text-center py-10">
                  <Star className="mx-auto text-gray-200 mb-3" size={36} />
                  <p className="text-gray-400 text-sm">No reviews yet</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="flex items-center gap-6 bg-gray-50 rounded-2xl p-4">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-gray-900">{provider.avgRating.toFixed(1)}</p>
                      <StarRow rating={provider.avgRating} size={16} />
                      <p className="text-xs text-gray-400 mt-1">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex-1 space-y-1">
                      {dist.map(({ n, count }) => (
                        <RatingBar key={n} label={n} count={count} total={reviews.length} />
                      ))}
                    </div>
                  </div>

                  {/* Review list */}
                  <div className="space-y-4">
                    {paginatedReviews.map(r => {
                      const name = r.reviewer
                        ? `${r.reviewer.first_name || ''} ${r.reviewer.last_name?.[0] || ''}.`.trim()
                        : 'Customer'
                      const text = r.body || r.review_text || ''
                      return (
                        <div key={r.id} className="border-b border-gray-100 pb-4 last:border-0">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {name?.[0]?.toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-800 leading-none">{name}</p>
                                {r.is_verified && (
                                  <span className="text-xs text-green-600 flex items-center gap-0.5 mt-0.5">
                                    <CheckCircle size={10} /> Verified
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <StarRow rating={r.rating} size={12} />
                              <span className="text-xs text-gray-400">
                                {new Date(r.created_at).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          {r.title && <p className="text-sm font-medium text-gray-800 mb-0.5">{r.title}</p>}
                          {text && <p className="text-sm text-gray-600 leading-relaxed">{text}</p>}
                          {r.provider_response && (
                            <div className="mt-2 pl-3 border-l-2 border-blue-200">
                              <p className="text-xs font-semibold text-blue-700 mb-0.5">Provider response</p>
                              <p className="text-xs text-gray-600">{r.provider_response}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => setReviewPage(p => Math.max(0, p - 1))}
                        disabled={reviewPage === 0}
                        className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs text-gray-500">
                        Page {reviewPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setReviewPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={reviewPage >= totalPages - 1}
                        className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* LOCATIONS */}
          {tab === 'locations' && (
            <div className="p-6 space-y-4">
              {shops.length === 0 ? (
                <div className="text-center py-10">
                  <Building2 className="mx-auto text-gray-200 mb-3" size={36} />
                  <p className="text-gray-400 text-sm">No shop locations listed</p>
                </div>
              ) : (
                shops.map((shop, i) => (
                  <div key={shop.id || i} className="rounded-xl border border-gray-200 overflow-hidden">
                    {shop.latitude && shop.longitude && (
                      <iframe
                        title={shop.name || `Shop ${i + 1}`}
                        width="100%"
                        height="180"
                        style={{ border: 0, display: 'block' }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://maps.google.com/maps?q=${shop.latitude},${shop.longitude}&z=15&output=embed&hl=en`}
                      />
                    )}
                    <div className="px-4 py-3 bg-gray-50">
                      {shop.name && <p className="text-sm font-semibold text-gray-800">{shop.name}</p>}
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin size={12} className="flex-shrink-0" />
                        {[shop.town, shop.county].filter(Boolean).join(', ')}
                      </p>
                      {shop.latitude && shop.longitude && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`}
                          target="_blank" rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline"
                        >
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

        {/* ── Footer / CTA ── */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => onBook(provider)}
            disabled={!canBook}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              canBook
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Calendar size={15} />
            {canBook ? 'Book Now' : 'Select Vehicle First'}
          </button>
        </div>
      </div>
    </div>
  )
}