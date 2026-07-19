// src/components/pricing/IndividualPricing.jsx
'use client'

import { Car, Check, ArrowRight, Sparkles, Star, Zap } from 'lucide-react'

const ACCENT = '#3b82f6'

// ── Support level labels per tier (appended for display only) ──
const SUPPORT_LEVELS = {
  ind_basic_plus: 'Basic support',
  ind_starter:    'Standard support',
  ind_growth:     'Elevated support',
  ind_family:     'Professional support',
  ind_fleet:      'Dedicated support',
}

export default function IndividualPricing({ tiers = [], period, trialConfig }) {
  if (!tiers.length) return <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No plans available</p>

  // Identify special tiers
  const freeTier = tiers.find(t => Number(t.base_monthly_price) === 0)
  const basicPlusTier = tiers.find(t => t.tier_code === 'ind_basic_plus')
  const popularCode = basicPlusTier?.tier_code || (tiers.length >= 2 ? tiers[1]?.tier_code : null)

  // Parse features for each tier
  const parseFeatures = (tier) => {
    try {
      return typeof tier.features === 'string' ? JSON.parse(tier.features) : (tier.features || [])
    } catch { return [] }
  }

  // Build display features: use DB features as-is,
  // only normalize support labels
  const buildFeatures = (tier) => {
    const dbFeatures = parseFeatures(tier)

    // Remove any support-level strings from the DB list (we append the correct one)
    const allSupportValues = new Set(Object.values(SUPPORT_LEVELS).map(s => s.toLowerCase()))
    let filtered = dbFeatures.filter(f => !allSupportValues.has(f.toLowerCase().trim()))

    // Append this tier's support level at the end
    const support = SUPPORT_LEVELS[tier.tier_code]
    if (support) filtered.push(support)

    return filtered
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, alignItems: 'stretch' }}>
      {tiers.map((t, i) => {
        const isPop = t.tier_code === popularCode
        const price = t[`${period}_price`] ?? t.monthly_price ?? t.base_monthly_price
        const monthly = t.base_monthly_price
        const isFree = Number(monthly) === 0
        const isBasicPlus = t.tier_code === 'ind_basic_plus'
        const features = buildFeatures(t)

        // Determine what premium features are missing from the free tier
        const premiumFeatures = ['Budget tracking', 'Expense reports', 'Maintenance history', 'Service reminders']

        return (
          <div key={t.tier_code} style={{
            position: 'relative',
            background: isPop ? 'rgba(59,130,246,0.08)' : isFree ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isPop ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
            borderRadius: 16,
            padding: '32px 24px 28px',
            display: 'flex', flexDirection: 'column',
            transition: 'all 0.25s ease',
          }}>
            {/* Badges */}
            {isPop && (
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                background: ACCENT, color: 'var(--text-primary)', fontSize: 11, fontWeight: 700,
                padding: '4px 14px', borderRadius: 20, letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Sparkles size={12} /> RECOMMENDED
              </div>
            )}

            {t.is_upper_limit && (
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                background: '#f59e0b', color: '#000', fontSize: 11, fontWeight: 700,
                padding: '4px 14px', borderRadius: 20, letterSpacing: '0.04em',
              }}>
                BEST VALUE
              </div>
            )}

            {/* Tier icon + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: isFree ? 'rgba(16,185,129,0.15)' : isBasicPlus ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isFree ? <Car size={18} color="#10b981" /> : isBasicPlus ? <Zap size={18} color={ACCENT} /> : <Star size={18} color="#a855f7" />}
              </div>
              <div>
                <h3 className="gc-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {t.tier_name}
                </h3>
              </div>
            </div>

            {/* Description */}
            <p style={{ fontSize: 13, color: 'var(--text-desc)', margin: '0 0 20px', lineHeight: 1.5 }}>
              {t.tier_description || t.description || `${t.min_vehicles}${t.max_vehicles ? '–' + t.max_vehicles : '+'} vehicles`}
            </p>

            {/* Pricing */}
            <div style={{ marginBottom: 20 }}>
              {isFree ? (
                <div>
                  <span className="gc-display" style={{ fontSize: 36, fontWeight: 800, color: '#10b981' }}>Free</span>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {trialConfig?.free_vehicle_count || 1} vehicle included
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-desc)' }}>{t.currency_symbol || '$'}</span>
                    <span className="gc-display" style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {period === 'monthly' ? '/month' : `for ${period.replace('_', '-')}`}
                    {period !== 'monthly' && Number(t[`${period.replace('-', '_')}_savings`] || 0) > 0 && (
                      <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 600 }}>
                        Save {t.currency_symbol || '$'}{Number(t[`${period}_savings`] || t.annual_savings || 0).toFixed(2)}
                      </span>
                    )}
                  </p>
                  {period !== 'monthly' && (
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      ≈ {t.currency_symbol || '$'}{Number(monthly).toFixed(2)}/mo equivalent
                    </p>
                  )}
                  {(() => {
                    const maxCars = t.max_vehicles || t.min_vehicles
                    if (!maxCars || maxCars <= 1 || Number(monthly) <= 0) return null
                    const perCar = (Number(monthly) / maxCars).toFixed(2)
                    return (
                      <p style={{ fontSize: 11, color: '#10b981', marginTop: 4, fontWeight: 500 }}>
                        ≈ {t.currency_symbol || '$'}{perCar}/car/month
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Upgrade nudge for free tier */}
            {isFree && basicPlusTier && (
              <div style={{
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.15)',
                borderRadius: 10, padding: '10px 12px', marginBottom: 16,
                fontSize: 11, color: 'var(--text-desc)', lineHeight: 1.5,
              }}>
                <span style={{ color: ACCENT, fontWeight: 600 }}>Want more?</span>{' '}
                Upgrade to Basic Plus for budgets, reports, reminders & full history — just {basicPlusTier.currency_symbol || '$'}{Number(basicPlusTier.base_monthly_price).toFixed(2)}/mo
              </div>
            )}

            {/* Features list */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                What's included
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {features.map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-feature)', marginBottom: 8 }}>
                    <Check size={14} style={{ color: isFree ? '#10b981' : isBasicPlus ? ACCENT : '#a855f7', marginTop: 2, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Show what's NOT included in free tier */}
              {isFree && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Available with Basic Plus
                  </p>
                  {premiumFeatures.map((f, j) => (
                    <p key={j} style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                      color: 'var(--text-faint)', marginBottom: 6,
                    }}>
                      <Zap size={12} style={{ color: 'rgba(59,130,246,0.4)', flexShrink: 0 }} />
                      {f}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* CTA button */}
            <button
              onClick={() => window.location.href = `/dashboard/subscription?plan=${t.tier_code}&period=${period}`}
              style={{
                marginTop: 24, width: '100%', padding: '12px 0',
                borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: isFree ? 'rgba(16,185,129,0.15)' : (isPop ? ACCENT : 'var(--border)'),
                color: isFree ? '#10b981' : '#fff',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1' }}
            >
              {isFree ? 'Get Started Free' : isBasicPlus ? 'Unlock Basic Plus' : 'Subscribe'} <ArrowRight size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}