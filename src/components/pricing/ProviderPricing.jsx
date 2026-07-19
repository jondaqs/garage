// src/components/pricing/ProviderPricing.jsx
'use client'

import { Wrench, Check, ArrowRight, Sparkles, Users, UserCheck, Store } from 'lucide-react'

const ACCENT = '#10b981'

export default function ProviderPricing({ tiers = [], period, trialConfig, shopTiers = [] }) {
  if (!tiers.length) return <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No plans available</p>

  const popular = tiers.length >= 3 ? tiers[1] : tiers[0]

  return (
    <>
      {trialConfig?.trial_duration_months > 0 && (
        <div style={{
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 12, padding: '14px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <Sparkles size={16} color={ACCENT} />
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
            <strong style={{ color: 'var(--text-primary)' }}>First {trialConfig.trial_duration_months} months free</strong> — grow your workshop with zero upfront cost.
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
          const clientRange = t.max_monthly_clients ? `${t.min_monthly_clients}–${t.max_monthly_clients}` : `${t.min_monthly_clients}+`

          return (
            <div key={t.tier_code} style={{
              position: 'relative',
              background: isPop ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isPop ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
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
                  background: 'rgba(16,185,129,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Wrench size={18} color={ACCENT} />
                </div>
                <h3 className="gc-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {t.tier_name}
                </h3>
              </div>

              {/* Capacity badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
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
                  <UserCheck size={11} /> {clientRange} clients/mo
                </span>
                {t.max_shops_included && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: 'var(--text-secondary)',
                    background: 'var(--border)', padding: '3px 8px', borderRadius: 6,
                  }}>
                    <Store size={11} /> {t.max_shops_included} shop{t.max_shops_included > 1 ? 's' : ''}
                  </span>
                )}
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
                  const maxC = t.max_monthly_clients || t.min_monthly_clients
                  const shops = t.max_shops_included || 1
                  const sym = t.currency_symbol || '$'
                  const parts = []
                  if (maxC > 1) parts.push(`${sym}${(Number(monthly) / maxC).toFixed(2)}/client`)
                  if (shops > 1) parts.push(`${sym}${(Number(monthly) / shops).toFixed(2)}/shop`)
                  if (!parts.length) return null
                  return (
                    <p style={{ fontSize: 11, color: ACCENT, marginTop: 4, fontWeight: 500 }}>
                      ≈ {parts.join(' · ')}/mo
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
                onClick={() => window.location.href = `/provider/subscription?plan=${t.tier_code}&period=${period}`}
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

      {/* Shop add-on note */}
      {shopTiers.length > 0 && (
        <div style={{
          marginTop: 28, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Store size={16} color="rgba(255,255,255,0.5)" />
            <h4 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              Multi-shop add-on
            </h4>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-desc)', marginBottom: 14, lineHeight: 1.5 }}>
            Your first shop is always included. Additional shops are priced modestly since your plan already covers staff and client capacity.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {shopTiers.filter(s => s.is_active).map(s => (
              <div key={s.tier_code} style={{
                background: 'var(--hover-bg)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '10px 14px', minWidth: 100, textAlign: 'center',
              }}>
                <p style={{ fontSize: 11, color: 'var(--text-desc)', margin: '0 0 4px', fontWeight: 500 }}>
                  {s.min_shops <= 1 ? '1 shop' : s.max_shops ? `${s.min_shops}–${s.max_shops}` : `${s.min_shops}+`}
                </p>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {s.is_upper_limit
                    ? `${s.currency_symbol || '$'}${Number(s.flat_monthly_price || 0).toFixed(0)} flat`
                    : Number(s.per_shop_monthly_price) === 0
                      ? 'Free'
                      : `${s.currency_symbol || '$'}${Number(s.per_shop_monthly_price).toFixed(2)}/shop`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}