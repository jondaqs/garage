// src/app/garages/page.js
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Search, MapPin, Star, BadgeCheck, X, ChevronRight,
  Loader2, Wrench, MessageSquare, Building2,
  LogIn, Calendar, SlidersHorizontal, ArrowLeft, Globe,
} from 'lucide-react'
import PublicNav from '@/components/PublicNav'
import VerificationScore from '@/components/VerificationScore'

const ITEMS_PER_PAGE = 12

export default function PublicGaragesPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [providers,   setProviders]   = useState([])
  const [types,       setTypes]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [page,        setPage]        = useState(0)
  const [total,       setTotal]       = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [session,     setSession]     = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  // Filters
  const [search,      setSearch]      = useState('')
  const [descSearch,  setDescSearch]  = useState('')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [verifiedOnly,   setVerifiedOnly]   = useState(false)

  // Check auth once
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session || null)
      setAuthChecked(true)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('search_providers_public', {
        p_search:           search       || null,
        p_description:      descSearch   || null,
        p_provider_type_id: typeFilter   || null,
        p_location:         locationFilter || null,
        p_country:          countryFilter || null,
        p_verified_only:    verifiedOnly,
        p_limit:            ITEMS_PER_PAGE,
        p_offset:           page * ITEMS_PER_PAGE,
      })

      if (error) throw error

      const results = (data || []).map(p => ({
        ...p,
        shops:       typeof p.shops === 'string' ? JSON.parse(p.shops) : (p.shops || []),
        services:    typeof p.services === 'string' ? JSON.parse(p.services) : (p.services || []),
        provider_type: typeof p.provider_type === 'string' ? JSON.parse(p.provider_type) : p.provider_type,
        avgRating:   Number(p.avg_rating) || 0,
        reviewCount: Number(p.review_count) || 0,
        owner_profile_picture_url: p.owner_profile_picture_url,
      }))

      setProviders(results)
      setTotal(results[0]?.total_count || 0)
    } catch (e) {
      console.error('Failed to load providers:', e)
    } finally {
      setLoading(false)
    }
  }, [search, descSearch, typeFilter, locationFilter, countryFilter, verifiedOnly, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('service_provider_types')
      .select('id, display_name, code')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setTypes(data || []))
  }, [])

  useEffect(() => { setPage(0) }, [search, descSearch, typeFilter, locationFilter, countryFilter, verifiedOnly])

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  const handleProviderClick = (provider) => {
    if (session) {
      router.push(`/dashboard/providers/${provider.id}`)
    } else {
      router.push(`/auth/login?redirect=/dashboard/providers/${provider.id}`)
    }
  }

  const handleChat = (e, provider) => {
    e.stopPropagation()
    if (session) {
      router.push(`/dashboard/chat?provider=${provider.id}`)
    } else {
      router.push(`/auth/login?redirect=/dashboard/chat?provider=${provider.id}`)
    }
  }

  const handleBook = (e, provider) => {
    e.stopPropagation()
    if (session) {
      router.push(`/dashboard/bookings/new?provider=${provider.id}`)
    } else {
      router.push(`/auth/login?redirect=/dashboard/bookings/new?provider=${provider.id}`)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        .gc-root { font-family: 'DM Sans', sans-serif; }
        .gc-display { font-family: 'Syne', sans-serif; }

        .garage-card {
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 16px;
          overflow: hidden;
          cursor: pointer;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: all 0.25s ease;
        }
        .garage-card:hover {
          border-color: rgba(255,255,255,0.22);
          transform: translateY(-3px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        }

        .search-input {
          width: 100%;
          padding: 12px 14px 12px 40px;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 12px;
          font-size: 14px;
          background: rgba(0,0,0,0.25);
          color: #fff;
          outline: none;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: border-color 0.2s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .search-input::placeholder { color: rgba(255,255,255,0.4); }
        .search-input:focus { border-color: rgba(96,165,250,0.5); }

        .filter-select {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.15);
          font-size: 13px;
          background: rgba(0,0,0,0.3);
          color: #fff;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
        }
        .filter-select option {
          background: #1e293b;
          color: #fff;
        }

        .filter-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 12px 18px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(0,0,0,0.25);
          color: rgba(255,255,255,0.7);
          font-size: 13px; font-weight: 500; cursor: pointer;
          backdrop-filter: blur(8px);
          transition: all 0.2s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .filter-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
        .filter-btn-active {
          background: rgba(96,165,250,0.2) !important;
          border-color: rgba(96,165,250,0.4) !important;
          color: #60a5fa !important;
        }

        .page-btn {
          padding: 10px 20px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.2);
          color: rgba(255,255,255,0.7);
          font-size: 13px; font-weight: 500; cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .page-btn:hover:not(:disabled) { border-color: rgba(255,255,255,0.3); color: #fff; }
        .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .svc-tag {
          padding: 3px 10px;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.7);
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          border: 1px solid rgba(255,255,255,0.06);
        }

        .cta-chat {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px;
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.8);
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 12px; font-weight: 500; cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .cta-chat:hover { background: rgba(255,255,255,0.14); color: #fff; }

        .cta-book {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px;
          background: rgba(96,165,250,0.2);
          color: #93c5fd;
          border: 1px solid rgba(96,165,250,0.25);
          font-size: 12px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .cta-book:hover { background: rgba(96,165,250,0.3); color: #bfdbfe; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 640px) {
          .garages-hero { padding: 56px 20px 0 !important; }
          .garages-search { padding: 0 20px !important; }
          .garages-results { padding: 12px 20px 40px !important; }
          .garages-footer { padding: 20px !important; flex-direction: column; text-align: center; }
          .garages-footer-links { flex-wrap: wrap; justify-content: center; }
        }
      `}</style>

      <div className="gc-root" style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 60%, #1e40af 100%)',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glows */}
        <div style={{
          position: 'absolute', top: '-200px', right: '-100px',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', bottom: '-150px', left: '-80px',
          width: '400px', height: '400px',
          background: 'radial-gradient(circle, rgba(96,165,250,0.15) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Nav */}
        <PublicNav />

        {/* Hero */}
        <div className="garages-hero" style={{ position: 'relative', zIndex: 1, padding: '72px 48px 0', maxWidth: 1100, margin: '0 auto' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
              fontSize: 13, cursor: 'pointer', marginBottom: 24, padding: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
          >
            <ArrowLeft size={14} />
            Back to home
          </button>

          <div className="fade-up">
            <span style={{
              display: 'inline-block',
              padding: '4px 14px', borderRadius: 99,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.18)',
              marginBottom: 24,
            }}>
              <Wrench size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 6 }} />
              Service Providers
            </span>

            <h1 className="gc-display" style={{
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              marginBottom: 16,
              color: '#fff',
            }}>
              Find a garage <span style={{ color: '#60a5fa' }}>near you</span>
            </h1>
            <p style={{
              fontSize: 17, lineHeight: 1.7,
              color: 'rgba(255,255,255,0.7)',
              maxWidth: 620,
              marginBottom: 8,
            }}>
              Browse verified garages and mechanics across the globe.
              Book a service or chat directly with a provider.
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 32 }}>
              {total} provider{total !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="garages-search" style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '0 48px' }}>
          <div className="fade-up delay-1" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="search-input"
              />
            </div>
            <div style={{ flex: '1 1 220px', position: 'relative' }}>
              <MapPin size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
              <input
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                placeholder="Location (town, county)…"
                className="search-input"
              />
            </div>
            <div style={{ flex: '1 1 180px', position: 'relative' }}>
              <Globe size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
              <input
                value={countryFilter}
                onChange={e => setCountryFilter(e.target.value)}
                placeholder="Country…"
                className="search-input"
              />
            </div>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`filter-btn ${filtersOpen ? 'filter-btn-active' : ''}`}
            >
              <SlidersHorizontal size={14} /> Filters
            </button>
          </div>

          {filtersOpen && (
            <div className="fade-up" style={{
              display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
              padding: 18, marginBottom: 20,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              backdropFilter: 'blur(8px)',
            }}>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="filter-select"
              >
                <option value="">All types</option>
                {types.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
              <div style={{ position: 'relative', flex: '1 1 180px' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input
                  value={descSearch}
                  onChange={e => setDescSearch(e.target.value)}
                  placeholder="Search by description…"
                  className="search-input"
                  style={{ padding: '10px 12px 10px 34px', fontSize: 13 }}
                />
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={e => setVerifiedOnly(e.target.checked)}
                  style={{ accentColor: '#60a5fa' }}
                />
                Verified only
              </label>
              <button onClick={() => {
                setSearch(''); setDescSearch(''); setTypeFilter(''); setLocationFilter(''); setCountryFilter(''); setVerifiedOnly(false)
              }} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 14px', borderRadius: 8,
                border: 'none', background: 'transparent',
                color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                <X size={12} /> Clear all
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="garages-results" style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '12px 48px 40px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0' }}>
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#60a5fa' }} />
              <p style={{ marginTop: 14, fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Loading providers…</p>
            </div>
          ) : providers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{
                width: 72, height: 72, borderRadius: 18,
                background: 'rgba(255,255,255,0.06)', margin: '0 auto 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Building2 size={32} style={{ color: 'rgba(255,255,255,0.25)' }} />
              </div>
              <p className="gc-display" style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontSize: 18 }}>No providers found</p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>Try adjusting your search or filters</p>
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 18,
              }}>
                {providers.map((p, i) => (
                  <PublicProviderCard
                    key={p.id}
                    provider={p}
                    isLoggedIn={!!session}
                    onClick={() => handleProviderClick(p)}
                    onChat={e => handleChat(e, p)}
                    onBook={e => handleBook(e, p)}
                    index={i}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 40 }}>
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="page-btn"
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '0 8px' }}>
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="page-btn"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — matches About page */}
        <footer className="garages-footer" style={{
          position: 'relative', zIndex: 1,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '24px 48px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain', opacity: 0.5 }} />
            <span className="gc-display" style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>Carfix-Connect</span>
          </div>
          <div className="garages-footer-links" style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            <button onClick={() => router.push('/about')}        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>About</button>
            <button onClick={() => router.push('/features')}     style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>Features</button>
            <button onClick={() => router.push('/how-it-works')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>How It Works</button>
            <button onClick={() => router.push('/auth/signup')}  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>Get Started</button>
            <button onClick={() => router.push('/contact')}      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>Contact</button>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            &copy; {new Date().getFullYear()} Carfix-Connect. Connecting Drivers to Trusted Vehicle Services.
          </p>
        </footer>
      </div>
    </>
  )
}


/* ── Provider Card ── */
function PublicProviderCard({ provider: p, isLoggedIn, onClick, onChat, onBook, index }) {
  const [expanded, setExpanded] = useState(false)
  const primaryShop = p.shops?.[0]
  const shownServices = expanded ? p.services : p.services?.slice(0, 4)

  return (
    <div
      onClick={onClick}
      className="garage-card fade-up"
      style={{ animationDelay: `${Math.min(index * 0.05, 0.4)}s` }}
    >
      {/* Accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #2563eb, #60a5fa)' }} />

      <div style={{ padding: 22 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, color: '#fff', fontWeight: 700, fontSize: 18,
            overflow: 'hidden',
          }}>
            {p.owner_profile_picture_url ? (
              <img src={p.owner_profile_picture_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              p.name?.[0]?.toUpperCase() || '?'
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h3 className="gc-display" style={{ fontWeight: 700, color: '#fff', fontSize: 15, lineHeight: 1.3, margin: 0 }}>{p.name}</h3>
              {p.is_verified && <BadgeCheck size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />}
              {p.verification_score > 0 && <VerificationScore score={p.verification_score} />}
            </div>
            <p style={{ fontSize: 12, color: '#60a5fa', marginTop: 3, fontWeight: 500 }}>
              {p.provider_type?.display_name}
            </p>
          </div>
          <ChevronRight size={16} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0, marginTop: 4 }} />
        </div>

        {/* Rating */}
        {p.avgRating > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {[1,2,3,4,5].map(n => (
                <Star key={n} size={12}
                  style={{ color: n <= Math.round(p.avgRating) ? '#facc15' : 'rgba(255,255,255,0.15)' }}
                  fill={n <= Math.round(p.avgRating) ? '#facc15' : 'rgba(255,255,255,0.15)'} />
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{p.avgRating.toFixed(1)}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>({p.reviewCount})</span>
          </div>
        )}

        {/* Description */}
        {p.description && (
          <p style={{
            fontSize: 13, color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.6, marginBottom: 12,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{p.description}</p>
        )}

        {/* Location */}
        {primaryShop && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            {[primaryShop.town, primaryShop.county].filter(Boolean).join(', ')}
          </div>
        )}

        {/* Services */}
        {p.services?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {shownServices.map(s => (
                <span key={s.id} className="svc-tag">{s.name}</span>
              ))}
              {p.services.length > 4 && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                  style={{
                    padding: '3px 10px',
                    background: 'rgba(96,165,250,0.15)',
                    color: '#93c5fd',
                    borderRadius: 6, fontSize: 11, fontWeight: 500,
                    border: '1px solid rgba(96,165,250,0.2)',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {expanded ? 'Less' : `+${p.services.length - 4}`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* CTA row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button onClick={onChat} className="cta-chat">
            {isLoggedIn ? <MessageSquare size={12} /> : <LogIn size={12} />}
            Chat
          </button>
          <button onClick={onBook} className="cta-book">
            {isLoggedIn ? <Calendar size={12} /> : <LogIn size={12} />}
            Book Service
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 500 }}>View details →</span>
        </div>
      </div>
    </div>
  )
}