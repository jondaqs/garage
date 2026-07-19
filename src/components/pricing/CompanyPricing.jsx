// src/components/pricing/CompanyPricing.jsx
'use client'

import { Building2, Check, ArrowRight, Sparkles, Users, Car } from 'lucide-react'

const ACCENT = '#8b5cf6'

export default function CompanyPricing({ tiers = [], period, trialConfig }) {
  if (!tiers.length) return <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No plans available</p>

  const popular = tiers.length >= 3 ? tiers[1] : tiers[0]

  return (
    <>
      {trialConfig?.trial_duration_months > 0 && (
        <div style={{
          background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 12, padding: '14px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <Sparkles size={16} color={ACCENT} />
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>First {trialConfig.trial_duration_months} months free</strong> — start managing your fleet today, no card required.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, alignItems: 'stretch' }}>
        {tiers.map(t => {
          const isPop = t.tier_code === popular?.tier_code
          const price = t[`${period}_price`] ?? t.monthly_price ?? t.base_monthly_price
          const monthly = t.base_monthly_price
          const features = (() => { try { return typeof t.features === 'string' ? JSON.parse(t.features) : (t.features || []) } catch { return [] } })()
          const staffRange = t.max_staff ? `${t.min_staff}–${t.max_staff}` : `${t.min_staff}+`
          const vehicleRange = t.max_vehicles ? `${t.min_vehicles}–${t.max_vehicles}` : `${t.min_vehicles}+`

          return (
            <div key={t.tier_code} style={{
              position: 'relative',
              background: isPop ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isPop ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
              borderRadius: 16, padding: '32px 24px 28px',
              display: 'flex', flexDirection: 'column',
              transition: 'all 0.25s ease',
            }}>
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(139,92,246,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Building2 size={18} color={ACCENT} />
                </div>
                <h3 className="gc-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {t.tier_name}
                </h3>
              </div>

              {/* Capacity badges */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: 'var(--text-secondary)',
                  background: 'var(--border)', padding: '3px 8px', borderRadius: 6,
                }}>
                  <Users size={11} /> {staffRange} staff
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: 'var(--text-secondary)',
                  background: 'var(--border)', padding: '3px 8px', borderRadius: 6,
                }}>
                  <Car size={11} /> {vehicleRange} vehicles
                </span>
              </div>

              {/* Price */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-desc)' }}>{t.currency_symbol || '$'}</span>
                  <span className="gc-display" style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {period === 'monthly' ? '/month' : `for ${period.replace('_', '-')}`}
                  {period !== 'monthly' && Number(t[`${period}_savings`] || 0) > 0 && (
                    <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 600 }}>
                      Save {t.currency_symbol || '$'}{Number(t[`${period}_savings`] || 0).toFixed(2)}
                    </span>
                  )}
                </p>
                {period !== 'monthly' && (
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    ≈ {t.currency_symbol || '$'}{Number(monthly).toFixed(2)}/mo equivalent
                  </p>
                )}
                {(() => {
                  if (Number(monthly) <= 0 || t.is_upper_limit) return null
                  const maxV = t.max_vehicles || t.min_vehicles
                  if (!maxV || maxV <= 1) return null
                  const sym = t.currency_symbol || '$'
                  return (
                    <p style={{ fontSize: 11, color: ACCENT, marginTop: 4, fontWeight: 500 }}>
                      ≈ {sym}{(Number(monthly) / maxV).toFixed(2)}/vehicle/mo
                    </p>
                  )
                })()}
              </div>

              {/* Features */}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  What's included
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {features.map((f, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-feature)', marginBottom: 8 }}>
                      <Check size={14} style={{ color: ACCENT, marginTop: 2, flexShrink: 0 }} /> {f}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => window.location.href = `/company/subscription?plan=${t.tier_code}&period=${period}`}
                style={{
                  marginTop: 24, width: '100%', padding: '12px 0',
                  borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: isPop ? ACCENT : 'var(--border)',
                  color: 'var(--text-primary)', transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1' }}
              >
                Subscribe <ArrowRight size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}