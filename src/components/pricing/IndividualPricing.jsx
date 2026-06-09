// src/components/pricing/IndividualPricing.jsx
'use client'

import { Car, Check, ArrowRight, Sparkles } from 'lucide-react'

const ACCENT = '#3b82f6'

export default function IndividualPricing({ tiers = [], period, trialConfig }) {
  if (!tiers.length) return <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>No plans available</p>

  const popular = tiers.length >= 2 ? tiers[1] : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tiers.length, 4)}, 1fr)`, gap: 20, alignItems: 'stretch' }}>
      {tiers.map((t, i) => {
        const isPop = popular && t.tier_code === popular.tier_code
        const price = t[`${period}_price`] ?? t.monthly_price ?? t.base_monthly_price
        const monthly = t.base_monthly_price
        const isFree = Number(monthly) === 0
        const features = (() => { try { return typeof t.features === 'string' ? JSON.parse(t.features) : (t.features || []) } catch { return [] } })()

        return (
          <div key={t.tier_code} style={{
            position: 'relative',
            background: isPop ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isPop ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 16,
            padding: '32px 24px 28px',
            display: 'flex', flexDirection: 'column',
            transition: 'all 0.25s ease',
          }}>
            {isPop && (
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                background: ACCENT, color: '#fff', fontSize: 11, fontWeight: 700,
                padding: '4px 14px', borderRadius: 20, letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Sparkles size={12} /> MOST POPULAR
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: isFree ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Car size={18} color={isFree ? '#10b981' : ACCENT} />
              </div>
              <div>
                <h3 className="gc-display" style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>
                  {t.tier_name}
                </h3>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px', lineHeight: 1.5 }}>
              {t.tier_description || t.description || `${t.min_vehicles}${t.max_vehicles ? '–' + t.max_vehicles : '+'} vehicles`}
            </p>

            <div style={{ marginBottom: 20 }}>
              {isFree ? (
                <div>
                  <span className="gc-display" style={{ fontSize: 36, fontWeight: 800, color: '#10b981' }}>Free</span>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                    {trialConfig?.free_vehicle_count || 1} vehicle included
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{t.currency_symbol || '$'}</span>
                    <span className="gc-display" style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>
                      {Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {period === 'monthly' ? '/month' : `for ${period.replace('_', '-')}`}
                    {period !== 'monthly' && Number(t[`${period.replace('-', '_')}_savings`] || 0) > 0 && (
                      <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 600 }}>
                        Save {t.currency_symbol || '$'}{Number(t[`${period}_savings`] || t.annual_savings || 0).toFixed(2)}
                      </span>
                    )}
                  </p>
                  {period !== 'monthly' && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      ≈ {t.currency_symbol || '$'}{Number(monthly).toFixed(2)}/mo equivalent
                    </p>
                  )}
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                What's included
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {features.map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                    <Check size={14} style={{ color: isFree ? '#10b981' : ACCENT, marginTop: 2, flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => window.location.href = `/dashboard/subscription?plan=${t.tier_code}&period=${period}`}
              style={{
                marginTop: 24, width: '100%', padding: '12px 0',
                borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: isFree ? 'rgba(16,185,129,0.15)' : (isPop ? ACCENT : 'rgba(255,255,255,0.1)'),
                color: isFree ? '#10b981' : '#fff',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1' }}
            >
              {isFree ? 'Get Started Free' : 'Subscribe'} <ArrowRight size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}