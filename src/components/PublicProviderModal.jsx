'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  X, Star, MapPin, Globe, BadgeCheck, Shield, Award, Clock,
  Wrench, MessageSquare, Calendar, ChevronLeft, ChevronRight,
  CheckCircle, Building2, Loader2, LogIn, ExternalLink,
} from 'lucide-react'
import VerificationScore from '@/components/VerificationScore'

const REVIEWS_PER_PAGE = 5

function StarRow({ rating, size = 14, dark = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={size}
          style={{ color: n <= Math.round(rating) ? '#facc15' : (dark ? 'rgba(255,255,255,0.15)' : '#e5e7eb') }}
          fill={n <= Math.round(rating) ? '#facc15' : (dark ? 'rgba(255,255,255,0.15)' : '#e5e7eb')} />
      ))}
    </div>
  )
}

export default function PublicProviderModal({ provider: p, isLoggedIn, onClose }) {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState('overview')
  const [reviews, setReviews] = useState([])
  const [services, setServices] = useState(p.services || [])
  const [loadingReviews, setLoadingReviews] = useState(true)
  const [reviewPage, setReviewPage] = useState(0)

  // Fetch reviews
  useEffect(() => {
    const fetchReviews = async () => {
      setLoadingReviews(true)
      try {
        let query = supabase
          .from('provider_reviews')
          .select('id, rating, title, body, review_text, created_at, is_verified, provider_response')
          .eq('service_provider_id', p.id)
          .eq('is_approved', true)
          .order('created_at', { ascending: false })

        const { data, error } = await query
        if (!error) setReviews(data || [])
      } catch (e) {
        console.error('Failed to load reviews:', e)
      } finally {
        setLoadingReviews(false)
      }
    }
    fetchReviews()
  }, [p.id])

  // Close on ESC
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const handleChat = () => {
    if (isLoggedIn) router.push(`/dashboard/chat?provider=${p.id}`)
    else router.push(`/auth/login?redirect=/dashboard/chat?provider=${p.id}`)
  }

  const handleBook = () => {
    if (isLoggedIn) router.push(`/dashboard/bookings/new?provider=${p.id}`)
    else router.push(`/auth/login?redirect=/dashboard/bookings/new?provider=${p.id}`)
  }

  const primaryShop = p.shops?.[0]
  const dist = [5,4,3,2,1].map(n => ({
    n, count: reviews.filter(r => r.rating === n).length,
  }))
  const totalPages = Math.ceil(reviews.length / REVIEWS_PER_PAGE)
  const paginatedReviews = reviews.slice(reviewPage * REVIEWS_PER_PAGE, (reviewPage + 1) * REVIEWS_PER_PAGE)

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: `Services${services.length ? ` (${services.length})` : ''}` },
    { id: 'reviews',  label: `Reviews${reviews.length ? ` (${reviews.length})` : loadingReviews ? '' : ''}` },
  ]

  /* ── glass card helper ── */
  const glass = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 16,
    padding: 22,
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        .modal-gc { font-family: 'DM Sans', sans-serif; }
        .modal-gc-display { font-family: 'Syne', sans-serif; }
        .modal-glass-card {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 16px;
          padding: 22px;
        }
        @keyframes modalFadeIn {
          from { opacity:0; transform: translateY(24px) scale(0.97); }
          to   { opacity:1; transform: translateY(0) scale(1); }
        }
        @keyframes overlayFadeIn {
          from { opacity:0; }
          to   { opacity:1; }
        }
        .modal-overlay { animation: overlayFadeIn 0.2s ease; }
        .modal-panel { animation: modalFadeIn 0.3s ease both; }
        .modal-tab {
          padding: 10px 16px; font-size: 13px; font-weight: 500;
          background: none; border: none; cursor: pointer;
          border-bottom: 2px solid transparent;
          color: rgba(255,255,255,0.45);
          transition: all 0.2s ease;
          font-family: 'DM Sans', sans-serif;
          white-space: nowrap;
        }
        .modal-tab:hover { color: rgba(255,255,255,0.75); }
        .modal-tab-active {
          color: #fff !important;
          border-bottom-color: #60a5fa !important;
        }
        .modal-scroll::-webkit-scrollbar { width: 4px; }
        .modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .modal-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 99px; }
      `}</style>

      {/* Overlay */}
      <div className="modal-overlay" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }} />

      {/* Panel */}
      <div className="modal-panel modal-gc" style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', pointerEvents: 'none',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          pointerEvents: 'auto',
          width: '100%', maxWidth: 680,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 60%, #1e40af 100%)',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          color: '#fff',
        }}>

          {/* ─── HERO HEADER ─── */}
          <div style={{
            padding: '24px 24px 0',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 100%)',
            flexShrink: 0,
          }}>
            {/* Close button */}
            <button onClick={onClose} style={{
              position: 'absolute', top: 14, right: 14,
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}>
              <X size={16} />
            </button>

            {/* Provider identity */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 22, flexShrink: 0,
                overflow: 'hidden', boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
              }}>
                {p.owner_profile_picture_url
                  ? <img src={p.owner_profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : p.name?.[0]?.toUpperCase() || '?'
                }
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <h2 className="modal-gc-display" style={{ fontWeight: 700, fontSize: 20, margin: 0, lineHeight: 1.2 }}>{p.name}</h2>
                  {p.is_verified && <BadgeCheck size={18} style={{ color: '#60a5fa', flexShrink: 0 }} />}
                  {p.verification_score > 0 && <VerificationScore score={p.verification_score} />}
                </div>
                <p style={{ fontSize: 13, color: '#60a5fa', marginTop: 3, fontWeight: 500 }}>
                  {p.provider_type?.display_name}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  {p.avgRating > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <StarRow rating={p.avgRating} size={13} dark />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{p.avgRating.toFixed(1)}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>({p.reviewCount})</span>
                    </div>
                  )}
                  {primaryShop && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                      <MapPin size={10} />
                      {[primaryShop.town, primaryShop.county, primaryShop.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {p.years_in_operation > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                      <Clock size={10} />
                      {p.years_in_operation} yr{p.years_in_operation !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button onClick={handleChat} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 10,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.85)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
                {isLoggedIn ? <MessageSquare size={14} /> : <LogIn size={14} />}
                {isLoggedIn ? 'Chat with Provider' : 'Login to Chat'}
              </button>
              <button onClick={handleBook} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 10,
                background: 'rgba(96,165,250,0.25)',
                border: '1px solid rgba(96,165,250,0.3)',
                color: '#93c5fd',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.35)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(96,165,250,0.25)'}>
                {isLoggedIn ? <Calendar size={14} /> : <LogIn size={14} />}
                {isLoggedIn ? 'Book Service' : 'Login to Book'}
              </button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`modal-tab ${tab === t.id ? 'modal-tab-active' : ''}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ─── SCROLLABLE CONTENT ─── */}
          <div className="modal-scroll" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

            {/* === OVERVIEW === */}
            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* About */}
                {p.description && (
                  <div className="modal-glass-card">
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>About</h3>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>{p.description}</p>
                  </div>
                )}

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {p.avgRating > 0 && (
                    <div className="modal-glass-card" style={{ textAlign: 'center', padding: 16 }}>
                      <p style={{ fontSize: 28, fontWeight: 700, color: '#facc15' }}>{p.avgRating.toFixed(1)}</p>
                      <StarRow rating={p.avgRating} size={12} dark />
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Rating</p>
                    </div>
                  )}
                  {p.reviewCount > 0 && (
                    <div className="modal-glass-card" style={{ textAlign: 'center', padding: 16 }}>
                      <p style={{ fontSize: 28, fontWeight: 700, color: '#60a5fa' }}>{p.reviewCount}</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Reviews</p>
                    </div>
                  )}
                  {services.length > 0 && (
                    <div className="modal-glass-card" style={{ textAlign: 'center', padding: 16 }}>
                      <p style={{ fontSize: 28, fontWeight: 700, color: '#34d399' }}>{services.length}</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Services</p>
                    </div>
                  )}
                </div>

                {/* Verifications */}
                {(p.is_verified || p.kra_pin_verified || p.registration_verified || p.location_verified || p.verification_score > 0) && (
                  <div className="modal-glass-card">
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Verifications</h3>

                    {p.verification_score > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Trust Score</span>
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: p.verification_score >= 80 ? '#34d399' : p.verification_score >= 50 ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                          }}>{p.verification_score}%</span>
                        </div>
                        <div style={{ width: '100%', height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 99, transition: 'width 0.5s ease',
                            width: `${p.verification_score}%`,
                            background: p.verification_score >= 80 ? '#34d399' : p.verification_score >= 50 ? '#fbbf24' : 'rgba(255,255,255,0.3)',
                          }} />
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {p.is_verified && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.2)' }}>
                          <CheckCircle size={12} /> Platform Verified
                        </span>
                      )}
                      {p.kra_pin_verified && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: 'rgba(96,165,250,0.15)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.2)' }}>
                          <Shield size={12} /> TAX Pin Verified
                        </span>
                      )}
                      {p.registration_verified && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.2)' }}>
                          <Award size={12} /> Registered Business
                        </span>
                      )}
                      {p.location_verified && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: 'rgba(251,146,60,0.15)', color: '#fdba74', border: '1px solid rgba(251,146,60,0.2)' }}>
                          <MapPin size={12} /> Location Verified
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Website */}
                {p.website && (
                  <div className="modal-glass-card">
                    <h3 style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Website</h3>
                    <a href={p.website} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#60a5fa', textDecoration: 'none' }}>
                      <Globe size={13} /> {p.website.replace(/^https?:\/\//, '')} <ExternalLink size={11} />
                    </a>
                  </div>
                )}

                {/* Map */}
                {primaryShop?.latitude && primaryShop?.longitude && (
                  <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)' }}>
                    <iframe
                      title="Location"
                      width="100%" height="200"
                      style={{ border: 0, display: 'block' }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${primaryShop.latitude},${primaryShop.longitude}&z=15&output=embed&hl=en`}
                    />
                    <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      <MapPin size={11} />
                      {[primaryShop.name, primaryShop.town, primaryShop.county].filter(Boolean).join(', ')}
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${primaryShop.latitude},${primaryShop.longitude}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ marginLeft: 'auto', fontSize: 11, color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>
                        Directions →
                      </a>
                    </div>
                  </div>
                )}

                {/* Services preview */}
                {services.length > 0 && (
                  <div className="modal-glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Services</h3>
                      {services.length > 8 && (
                        <button onClick={() => setTab('services')} style={{ background: 'none', border: 'none', fontSize: 11, color: '#60a5fa', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>View all</button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {services.slice(0, 10).map(s => (
                        <span key={s.id} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 8,
                          background: 'rgba(96,165,250,0.12)', color: '#93c5fd',
                          fontSize: 11, fontWeight: 500,
                          border: '1px solid rgba(96,165,250,0.15)',
                        }}>
                          <Wrench size={10} /> {s.name}
                        </span>
                      ))}
                      {services.length > 10 && (
                        <button onClick={() => setTab('services')} style={{
                          padding: '4px 10px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)',
                          fontSize: 11, fontWeight: 500, border: '1px solid rgba(255,255,255,0.08)',
                          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        }}>+{services.length - 10} more</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === SERVICES === */}
            {tab === 'services' && (
              <div>
                {services.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Wrench size={36} style={{ color: 'rgba(255,255,255,0.15)', margin: '0 auto 12px' }} />
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No services listed</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                    {services.map(s => (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: 14,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12,
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(96,165,250,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10,
                          background: 'rgba(96,165,250,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Wrench size={14} style={{ color: '#60a5fa' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === REVIEWS === */}
            {tab === 'reviews' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {loadingReviews ? (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Loader2 size={28} style={{ color: '#60a5fa', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 10 }}>Loading reviews…</p>
                  </div>
                ) : reviews.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Star size={36} style={{ color: 'rgba(255,255,255,0.15)', margin: '0 auto 12px' }} />
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No reviews yet</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="modal-glass-card" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                      <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        <p style={{ fontSize: 40, fontWeight: 700, color: '#fff' }}>{p.avgRating.toFixed(1)}</p>
                        <StarRow rating={p.avgRating} size={16} dark />
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{reviews.length} reviews</p>
                      </div>
                      <div style={{ flex: 1 }}>
                        {dist.map(({ n, count }) => {
                          const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0
                          return (
                            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ width: 10, textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{n}</span>
                              <Star size={9} style={{ color: '#facc15', flexShrink: 0 }} fill="#facc15" />
                              <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 99, background: '#facc15', width: `${pct}%` }} />
                              </div>
                              <span style={{ width: 20, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Individual reviews */}
                    {paginatedReviews.map(r => {
                      const text = r.body || r.review_text || ''
                      return (
                        <div key={r.id} className="modal-glass-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 34, height: 34, borderRadius: 99,
                                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                              }}>C</div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Customer</p>
                                {r.is_verified && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#34d399' }}>
                                    <CheckCircle size={9} /> Verified
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <StarRow rating={r.rating} size={12} dark />
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                                {new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          {r.title && <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{r.title}</p>}
                          {text && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65 }}>{text}</p>}
                          {r.provider_response && (
                            <div style={{
                              marginTop: 12, paddingLeft: 12, borderLeft: '2px solid rgba(96,165,250,0.3)',
                              background: 'rgba(96,165,250,0.06)', borderRadius: '0 10px 10px 0', padding: 12,
                            }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', marginBottom: 4 }}>Provider response</p>
                              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{r.provider_response}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                        <button onClick={() => setReviewPage(p => Math.max(0, p - 1))} disabled={reviewPage === 0}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '8px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                            color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer',
                            opacity: reviewPage === 0 ? 0.3 : 1,
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                          <ChevronLeft size={13} /> Prev
                        </button>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                          Page {reviewPage + 1} of {totalPages}
                        </span>
                        <button onClick={() => setReviewPage(p => Math.min(totalPages - 1, p + 1))} disabled={reviewPage >= totalPages - 1}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '8px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                            color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer',
                            opacity: reviewPage >= totalPages - 1 ? 0.3 : 1,
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                          Next <ChevronRight size={13} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}