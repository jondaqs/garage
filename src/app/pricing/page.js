// src/app/pricing/page.js
'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Car, ArrowRight, User, Building2, Wrench, Loader2, Globe, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { detectCurrencyFromBrowser, matchCurrencyInList } from '@/lib/currency/detectCurrency'
import IndividualPricing from '@/components/pricing/IndividualPricing'
import CompanyPricing from '@/components/pricing/CompanyPricing'
import ProviderPricing from '@/components/pricing/ProviderPricing'

const PERIODS = [
  { code: 'monthly',     label: 'Monthly' },
  { code: 'quarterly',   label: 'Quarterly', badge: '5% off' },
  { code: 'semi_annual', label: 'Semi-annual', badge: '10% off' },
  { code: 'annual',      label: 'Annual', badge: '15% off' },
  { code: 'tri_annual',  label: 'Tri-annual', badge: '25% off' },
]

const TABS = [
  { code: 'individual',       label: 'Individual',       icon: User,     accent: '#3b82f6', desc: 'Personal vehicle owners' },
  { code: 'company',          label: 'Company',          icon: Building2, accent: '#8b5cf6', desc: 'Fleet management teams' },
  { code: 'service_provider', label: 'Service Provider', icon: Wrench,   accent: '#10b981', desc: 'Garages & workshops' },
]

// Price fields in subscription_pricing_overview that need conversion
const PRICE_FIELDS = [
  'base_monthly_price', 'monthly_price', 'quarterly_price', 'semi_annual_price',
  'annual_price', 'tri_annual_price', 'quarterly_savings', 'annual_savings', 'tri_annual_savings',
  'per_extra_vehicle_price', 'per_extra_staff_price', 'per_extra_client_price',
]

export default function PricingPage() {
  const router = useRouter()
  const supabase = createClient()
  const canvasRef = useRef(null)

  const [tab, setTab] = useState('individual')
  const [period, setPeriod] = useState('monthly')
  const [tiers, setTiers] = useState([])
  const [trialConfigs, setTrialConfigs] = useState({})
  const [shopTiers, setShopTiers] = useState([])
  const [loading, setLoading] = useState(true)

  // Currency conversion
  const [currencies, setCurrencies] = useState([])
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const [conversionRate, setConversionRate] = useState(1)
  const [convSymbol, setConvSymbol] = useState('$')
  const [marginPct, setMarginPct] = useState(0)
  const [rateLoading, setRateLoading] = useState(true)
  const [rateSource, setRateSource] = useState('identity')
  const [showCurrDropdown, setShowCurrDropdown] = useState(false)
  const [currencyReady, setCurrencyReady] = useState(false)

  // Animated grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame, offset = 0
    const draw = () => {
      canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
      const sp = 60
      for (let x = (offset % sp); x < canvas.width; x += sp) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
      for (let y = 0; y < canvas.height; y += sp) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }
      offset += 0.3; animFrame = requestAnimationFrame(draw)
    }
    draw(); return () => cancelAnimationFrame(animFrame)
  }, [])

  // Fetch pricing data + currencies
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [{ data: tierData }, { data: trialData }, { data: shopData }, { data: currData }] = await Promise.all([
          supabase.from('subscription_pricing_overview').select('*').eq('is_active', true).eq('is_custom', false),
          supabase.from('subscription_trial_overview').select('*'),
          supabase.from('subscription_shop_tiers_overview').select('*').eq('is_active', true).order('sort_order'),
          supabase.from('currencies').select('id, code, symbol, display_name').eq('is_active', true).order('code'),
        ])
        setTiers(tierData || [])
        setShopTiers(shopData || [])
        setCurrencies(currData || [])
        const configs = {}
        ;(trialData || []).forEach(c => { configs[c.subscription_type] = c })
        setTrialConfigs(configs)

        // Auto-detect currency from browser timezone
        const { currencyCode: detected } = detectCurrencyFromBrowser()
        let resolvedCurrency = 'USD'
        if (detected && detected !== 'USD' && currData?.length) {
          const match = matchCurrencyInList(detected, currData)
          if (match) resolvedCurrency = match.code
        }
        setSelectedCurrency(resolvedCurrency)

        // Fetch exchange rate inline (before showing content)
        if (resolvedCurrency !== 'USD') {
          try {
            const resp = await fetch(`/api/pricing/exchange-rate?currency_code=${resolvedCurrency}`)
            if (resp.ok) {
              const rateData = await resp.json()
              setConversionRate(rateData.margined_rate)
              setConvSymbol(rateData.currency_symbol || resolvedCurrency)
              setMarginPct(rateData.margin_pct)
              setRateSource(rateData.source)
            }
          } catch (e) {
            console.error('Initial rate fetch error:', e)
          }
        }
        setRateLoading(false)
        setCurrencyReady(true)
      } catch (e) {
        console.error('Pricing load error:', e)
        setRateLoading(false)
        setCurrencyReady(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const initialRateDone = useRef(false)

  // Fetch exchange rate when user manually changes currency via dropdown
  useEffect(() => {
    if (!currencyReady) return
    // Skip the first trigger — the data load already fetched the rate inline
    if (!initialRateDone.current) { initialRateDone.current = true; return }
    if (selectedCurrency === 'USD') {
      setConversionRate(1); setConvSymbol('$'); setMarginPct(0); setRateSource('identity')
      setRateLoading(false)
      return
    }
    const fetchRate = async () => {
      setRateLoading(true)
      try {
        const resp = await fetch(`/api/pricing/exchange-rate?currency_code=${selectedCurrency}`)
        if (!resp.ok) throw new Error('Rate unavailable')
        const data = await resp.json()
        setConversionRate(data.margined_rate)
        setConvSymbol(data.currency_symbol || selectedCurrency)
        setMarginPct(data.margin_pct)
        setRateSource(data.source)
      } catch (e) {
        console.error('Rate fetch error:', e)
        setConversionRate(1); setConvSymbol('$'); setMarginPct(0)
      } finally {
        setRateLoading(false)
      }
    }
    fetchRate()
  }, [selectedCurrency])

  // Convert tiers to selected currency
  const convertedTiers = tiers.map(t => {
    if (conversionRate === 1) return { ...t, currency_symbol: '$' }
    const converted = { ...t, currency_symbol: convSymbol }
    PRICE_FIELDS.forEach(f => {
      if (converted[f] != null) converted[f] = Math.ceil(Number(converted[f]) * conversionRate)
    })
    return converted
  })

  // Convert shop tiers
  const convertedShopTiers = shopTiers.map(s => {
    if (conversionRate === 1) return s
    return {
      ...s,
      per_shop_monthly_price: Math.ceil(Number(s.per_shop_monthly_price || 0) * conversionRate),
      flat_monthly_price: Math.ceil(Number(s.flat_monthly_price || 0) * conversionRate),
      currency_symbol: convSymbol,
    }
  })

  const currentTiers = convertedTiers.filter(t => t.subscription_type === tab)
  const currentTab = TABS.find(t => t.code === tab)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        .gc-root { font-family: 'DM Sans', sans-serif; }
        .gc-display { font-family: 'Syne', sans-serif; }
        .gc-btn-primary {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 10px 20px; border-radius: 10px; border: none;
          font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
        }
        .gc-nav-link:hover { background: rgba(255,255,255,0.08) !important; color: #fff !important; }
        @media (max-width: 640px) {
          .gc-hero-title { font-size: 28px !important; }
          .gc-hero-sub { font-size: 14px !important; }
          .gc-pricing-nav-links { display: none !important; }
          .gc-pricing-tab-desc { display: none; }
          .gc-pricing-footer { padding: 20px 16px !important; flex-direction: column !important; text-align: center; }
        }
      `}</style>

      <div className="gc-root" style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #0a0a0a 0%, #141414 50%, #0d0d0d 100%)',
        color: '#fff', overflowX: 'hidden',
      }}>
        <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.6 }} />

        {/* ── NAV ── */}
        <nav style={{
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 48px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.03)',
        }}>
          <button onClick={() => router.push('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={20} color="#fff" />
            </div>
            <span className="gc-display" style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>GariCare</span>
          </button>
          <div className="gc-pricing-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {[
              { label: 'About Us', path: '/about', active: false },
              { label: 'Pricing',  path: '/pricing', active: true },
              { label: 'Contact',  path: '/contact', active: false },
            ].map(n => (
              <button key={n.path} onClick={() => router.push(n.path)} className="gc-nav-link" style={{
                background: n.active ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: n.active ? '#fff' : 'rgba(255,255,255,0.75)',
                border: 'none', padding: '10px 16px', borderRadius: 8,
                fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease',
              }}>{n.label}</button>
            ))}
            <button onClick={() => router.push('/auth/login')} className="gc-btn-primary"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', marginLeft: 4 }}>
              Sign In <ArrowRight size={15} />
            </button>
          </div>
        </nav>

        {/* ── HERO ── */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '64px 24px 20px', maxWidth: 720, margin: '0 auto' }}>
          <h1 className="gc-display gc-hero-title" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.025em', margin: '0 0 16px' }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
            Start free and scale as you grow. No hidden fees, no surprises.
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

          {/* ── CURRENCY SELECTOR ── */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowCurrDropdown(!showCurrDropdown)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '8px 16px', cursor: 'pointer',
                color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500,
                transition: 'all 0.2s ease',
              }}>
                <Globe size={14} />
                <span style={{ fontWeight: 600, color: '#fff' }}>{selectedCurrency}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{convSymbol !== '$' || selectedCurrency === 'USD' ? convSymbol : ''}</span>
                {rateLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ChevronDown size={14} />}
              </button>

              {showCurrDropdown && (
                <>
                  <div onClick={() => setShowCurrDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                  <div style={{
                    position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)',
                    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12, padding: 6, zIndex: 30, minWidth: 200,
                    maxHeight: 280, overflowY: 'auto',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}>
                    {currencies.map(c => (
                      <button key={c.code} onClick={() => { setSelectedCurrency(c.code); setShowCurrDropdown(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '8px 12px', borderRadius: 8,
                          background: c.code === selectedCurrency ? 'rgba(255,255,255,0.08)' : 'transparent',
                          border: 'none', cursor: 'pointer', fontSize: 13,
                          color: c.code === selectedCurrency ? '#fff' : 'rgba(255,255,255,0.6)',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = c.code === selectedCurrency ? 'rgba(255,255,255,0.08)' : 'transparent'}
                      >
                        <span>{c.symbol} {c.code}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{c.display_name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {selectedCurrency !== 'USD' && conversionRate > 1 && !rateLoading && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12,
                fontSize: 11, color: 'rgba(255,255,255,0.35)',
              }}>
                <span>1 USD = {convSymbol}{conversionRate.toFixed(2)}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span>incl. {marginPct}% forex margin</span>
              </div>
            )}
          </div>

          {/* ── TAB SELECTOR ── */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 6,
            background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 6,
            marginBottom: 32, maxWidth: 560, margin: '0 auto 32px',
            flexWrap: 'wrap',
          }}>
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.code
              return (
                <button key={t.code} onClick={() => setTab(t.code)} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: active ? `${t.accent}22` : 'transparent',
                  color: active ? t.accent : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.2s ease',
                  outline: active ? `1px solid ${t.accent}44` : 'none',
                }}>
                  <Icon size={18} />
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{t.label}</span>
                  <span className="gc-pricing-tab-desc" style={{ fontSize: 10, color: active ? `${t.accent}99` : 'rgba(255,255,255,0.3)' }}>{t.desc}</span>
                </button>
              )
            })}
          </div>

          {/* ── PERIOD SWITCHER ── */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 40, flexWrap: 'wrap' }}>
            {PERIODS.map(p => {
              const active = period === p.code
              return (
                <button key={p.code} onClick={() => setPeriod(p.code)} style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.2s ease',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {p.label}
                  {p.badge && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: active ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.1)',
                      color: '#10b981', padding: '2px 6px', borderRadius: 4,
                    }}>{p.badge}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── PRICING CARDS ── */}
          <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
            {(loading || !currencyReady) ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: currentTab?.accent || '#fff' }} />
              </div>
            ) : (
              <>
                {tab === 'individual' && (
                  <IndividualPricing tiers={currentTiers} period={period} trialConfig={trialConfigs.individual} />
                )}
                {tab === 'company' && (
                  <CompanyPricing tiers={currentTiers} period={period} trialConfig={trialConfigs.company} />
                )}
                {tab === 'service_provider' && (
                  <ProviderPricing tiers={currentTiers} period={period} trialConfig={trialConfigs.service_provider} shopTiers={convertedShopTiers} />
                )}
              </>
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer className="gc-pricing-footer" style={{
          position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '24px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Car size={16} color="rgba(255,255,255,0.3)" />
            <span className="gc-display" style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>GariCare</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            {['About', 'Pricing', 'Contact'].map(link => (
              <button key={link} onClick={() => router.push(`/${link.toLowerCase()}`)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
              >{link}</button>
            ))}
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            © {new Date().getFullYear()} GariCare. Built for Kenyan roads.
          </p>
        </footer>
      </div>
    </>
  )
}