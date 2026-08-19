// src/app/garages/page.js
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Search, MapPin, Star, BadgeCheck, Filter, X, ChevronRight,
  Loader2, Wrench, MessageSquare, Building2, ChevronDown, ChevronUp,
  LogIn, Calendar, SlidersHorizontal,
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
  }, [search, descSearch, typeFilter, locationFilter, verifiedOnly, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('service_provider_types')
      .select('id, display_name, code')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setTypes(data || []))
  }, [])

  useEffect(() => { setPage(0) }, [search, descSearch, typeFilter, locationFilter, verifiedOnly])

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
      <PublicNav />

      <div style={{ background: 'var(--background, #f9fafb)', minHeight: '100vh' }}>
        {/* Hero header */}
        <div style={{
          background: 'linear-gradient(135deg, var(--surface, #111827) 0%, var(--card-bg, #1e293b) 100%)',
          borderBottom: '1px solid var(--border, #1f2937)',
          padding: '48px 24px 32px',
          textAlign: 'center',
        }}>
          <h1 className="gc-display" style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 800,
            color: 'var(--text-primary, #f9fafb)',
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}>
            Find a Garage Near You
          </h1>
          <p style={{
            fontSize: 15,
            color: 'var(--text-secondary, #9ca3af)',
            maxWidth: 500,
            margin: '0 auto 24px',
            lineHeight: 1.6,
          }}>
            Browse verified garages and mechanics across Kenya. Book a service or chat directly with a provider.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)' }}>
            {total} provider{total !== 1 ? 's' : ''} available
          </p>
        </div>

        {/* Search & Filters */}
        <div style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '20px 16px 0',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name…"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px',
                  border: '1px solid var(--border, #e5e7eb)', borderRadius: 12,
                  fontSize: 14, background: 'var(--card-bg, #fff)',
                  color: 'var(--text-primary, #111827)',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <MapPin size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              <input
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                placeholder="Location (town, county)…"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px',
                  border: '1px solid var(--border, #e5e7eb)', borderRadius: 12,
                  fontSize: 14, background: 'var(--card-bg, #fff)',
                  color: 'var(--text-primary, #111827)',
                  outline: 'none',
                }}
              />
            </div>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 12,
                border: '1px solid var(--border, #e5e7eb)',
                background: filtersOpen ? 'var(--accent-teal, #00F5D4)' : 'var(--card-bg, #fff)',
                color: filtersOpen ? '#000' : 'var(--text-secondary, #6b7280)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <SlidersHorizontal size={14} /> Filters
            </button>
          </div>

          {filtersOpen && (
            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap',
              padding: 16, marginBottom: 16,
              background: 'var(--surface, #f9fafb)',
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: 12,
            }}>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border, #e5e7eb)',
                  fontSize: 13, background: 'var(--card-bg, #fff)',
                  color: 'var(--text-primary, #111827)',
                }}
              >
                <option value="">All types</option>
                {types.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
              <div style={{ position: 'relative', flex: '1 1 180px' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  value={descSearch}
                  onChange={e => setDescSearch(e.target.value)}
                  placeholder="Search by description…"
                  style={{
                    width: '100%', padding: '8px 10px 8px 32px',
                    border: '1px solid var(--border, #e5e7eb)', borderRadius: 8,
                    fontSize: 13, background: 'var(--card-bg, #fff)',
                    color: 'var(--text-primary, #111827)',
                  }}
                />
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: 'var(--text-secondary, #6b7280)',
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={e => setVerifiedOnly(e.target.checked)}
                  style={{ accentColor: 'var(--accent-teal, #00F5D4)' }}
                />
                Verified only
              </label>
              <button onClick={() => {
                setSearch(''); setDescSearch(''); setTypeFilter(''); setLocationFilter(''); setVerifiedOnly(false)
              }} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 12px', borderRadius: 8,
                border: 'none', background: 'transparent',
                color: 'var(--text-muted, #9ca3af)', fontSize: 12, cursor: 'pointer',
              }}>
                <X size={12} /> Clear
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 16px 60px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0' }}>
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-teal, #2563eb)' }} />
              <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text-muted, #9ca3af)' }}>Loading providers…</p>
            </div>
          ) : providers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <Building2 size={48} style={{ color: 'var(--text-muted, #d1d5db)', margin: '0 auto 16px' }} />
              <p style={{ fontWeight: 500, color: 'var(--text-secondary, #6b7280)' }}>No providers found</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted, #9ca3af)', marginTop: 4 }}>Try adjusting your search or filters</p>
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 16,
              }}>
                {providers.map(p => (
                  <PublicProviderCard
                    key={p.id}
                    provider={p}
                    isLoggedIn={!!session}
                    onClick={() => handleProviderClick(p)}
                    onChat={e => handleChat(e, p)}
                    onBook={e => handleBook(e, p)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32 }}>
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    style={{
                      padding: '8px 16px', borderRadius: 10,
                      border: '1px solid var(--border, #e5e7eb)',
                      background: 'var(--card-bg, #fff)',
                      color: 'var(--text-secondary, #6b7280)',
                      fontSize: 13, fontWeight: 500, cursor: page === 0 ? 'not-allowed' : 'pointer',
                      opacity: page === 0 ? 0.4 : 1,
                    }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text-muted, #9ca3af)' }}>
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    style={{
                      padding: '8px 16px', borderRadius: 10,
                      border: '1px solid var(--border, #e5e7eb)',
                      background: 'var(--card-bg, #fff)',
                      color: 'var(--text-secondary, #6b7280)',
                      fontSize: 13, fontWeight: 500, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                      opacity: page >= totalPages - 1 ? 0.4 : 1,
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}


function PublicProviderCard({ provider: p, isLoggedIn, onClick, onChat, onBook }) {
  const [expanded, setExpanded] = useState(false)
  const primaryShop = p.shops?.[0]
  const shownServices = expanded ? p.services : p.services?.slice(0, 4)

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card-bg, #fff)',
        border: '1px solid var(--card-border, #e5e7eb)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-teal, #2563eb)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border, #e5e7eb)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {/* Accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent-teal, #2563eb), var(--accent-purple, #7c3aed))' }} />

      <div style={{ padding: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
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
              <h3 style={{ fontWeight: 600, color: 'var(--text-primary, #111827)', fontSize: 14, lineHeight: 1.3 }}>{p.name}</h3>
              {p.is_verified && <BadgeCheck size={14} style={{ color: '#2563eb', flexShrink: 0 }} />}
              {p.verification_score > 0 && <VerificationScore score={p.verification_score} />}
            </div>
            <p style={{ fontSize: 12, color: 'var(--accent-teal, #2563eb)', marginTop: 2, fontWeight: 500 }}>
              {p.provider_type?.display_name}
            </p>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--text-muted, #d1d5db)', flexShrink: 0, marginTop: 4 }} />
        </div>

        {/* Rating */}
        {p.avgRating > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {[1,2,3,4,5].map(n => (
                <Star key={n} size={11}
                  style={{ color: n <= Math.round(p.avgRating) ? '#facc15' : '#d1d5db' }}
                  fill={n <= Math.round(p.avgRating) ? '#facc15' : '#d1d5db'} />
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #374151)' }}>{p.avgRating.toFixed(1)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>({p.reviewCount})</span>
          </div>
        )}

        {/* Description */}
        {p.description && (
          <p style={{
            fontSize: 12, color: 'var(--text-secondary, #6b7280)',
            lineHeight: 1.6, marginBottom: 10,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{p.description}</p>
        )}

        {/* Location */}
        {primaryShop && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted, #9ca3af)', marginBottom: 10 }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            {[primaryShop.town, primaryShop.county].filter(Boolean).join(', ')}
          </div>
        )}

        {/* Services */}
        {p.services?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {shownServices.map(s => (
                <span key={s.id} style={{
                  padding: '2px 8px', background: 'var(--feat-bg, #f3f4f6)',
                  color: 'var(--text-secondary, #6b7280)',
                  borderRadius: 6, fontSize: 11, fontWeight: 500,
                }}>{s.name}</span>
              ))}
              {p.services.length > 4 && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                  style={{
                    padding: '2px 8px', background: 'rgba(37,99,235,0.1)',
                    color: '#2563eb', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    border: 'none', cursor: 'pointer',
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
          paddingTop: 12, borderTop: '1px solid var(--border, #f3f4f6)',
        }}>
          <button
            onClick={onChat}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: 'var(--feat-bg, #f3f4f6)',
              color: 'var(--text-secondary, #6b7280)',
              border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {isLoggedIn ? <MessageSquare size={12} /> : <LogIn size={12} />}
            Chat
          </button>
          <button
            onClick={onBook}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: 'var(--accent-teal, #00F5D4)',
              color: 'var(--brand-dark, #0a0a0a)',
              border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {isLoggedIn ? <Calendar size={12} /> : <LogIn size={12} />}
            Book Service
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--accent-teal, #2563eb)', fontWeight: 500 }}>View details →</span>
        </div>
      </div>
    </div>
  )
}