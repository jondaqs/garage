'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Building2, User, Calendar, History, Bell, ArrowRight, Shield, Zap, Download } from 'lucide-react'
import PublicNav from '@/components/PublicNav'
import { createClient } from '@/lib/supabase/client'

export default function LandingPage() {
  const router = useRouter()
  const canvasRef = useRef(null)
  const [theme, setTheme] = useState('dark')
  const [social, setSocial] = useState({})

  // Fetch social links
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', 'social_links')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.setting_value) {
          setSocial(typeof data.setting_value === 'string' ? JSON.parse(data.setting_value) : data.setting_value)
        }
      })
  }, [])

  // Sync with theme set by PublicNav
  useEffect(() => {
    const saved = localStorage.getItem('gc-theme')
    if (saved) setTheme(saved)

    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme')
      if (t) setTheme(t)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Subtle animated grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame
    let offset = 0

    const draw = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'
      ctx.lineWidth = 1

      const spacing = 60
      for (let x = (offset % spacing); x < canvas.width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
      }

      offset += 0.3
      animFrame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animFrame)
  }, [])

  const roles = [
    {
      icon: User,
      label: 'Vehicle Owner',
      sub: 'Personal',
      description: 'Book services, track maintenance history, and keep your vehicles in top shape.',
      accent: 'var(--accent-teal)',
      accentRaw: '#00F5D4',
      accentLight: 'var(--role-teal-bg)',
      border: 'var(--role-teal-border)',
      cta: 'Get Started',
      route: '/auth/signup?type=normal',
      pill: 'Most Popular',
    },
    {
      icon: Building2,
      label: 'Company Fleet',
      sub: 'Business',
      description: 'Centralise fleet maintenance, control budgets, and manage your entire team.',
      accent: 'var(--accent-purple)',
      accentRaw: '#7B2CBF',
      accentLight: 'var(--role-purple-bg)',
      border: 'var(--role-purple-border)',
      cta: 'Register Company',
      route: '/auth/company-signup',
      pill: null,
    },
    {
      icon: Wrench,
      label: 'Service Provider',
      sub: 'Garage / Workshop',
      description: 'Grow your workshop, accept online bookings, and build a loyal customer base.',
      accent: 'var(--accent-teal)',
      accentRaw: '#00F5D4',
      accentLight: 'var(--role-teal-bg)',
      border: 'var(--role-teal-border)',
      cta: 'Register Business',
      route: '/auth/provider-signup',
      pill: null,
    },
  ]

  const features = [
    { icon: Calendar, title: 'Instant Booking', body: 'Schedule with verified garages in seconds — no phone calls needed.' },
    { icon: History,  title: 'Full Service Log',  body: 'Every job, every part, every date — your vehicle history always on hand.' },
    { icon: Bell,     title: 'Smart Reminders', body: "We'll ping you before your next service is due so you never fall behind." },
    { icon: Shield,   title: 'Verified Providers', body: 'Every workshop is vetted and rated by real customers before listing.' },
    { icon: Zap,      title: 'Real-time Updates', body: 'Live status from drop-off to collection. Know exactly when your car is ready.' },
    { icon: Building2,title: 'Fleet Control',  body: 'Full visibility across every company vehicle — mileage, spend, bookings.' },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        .gc-root { font-family: 'DM Sans', sans-serif; }
        .gc-display { font-family: 'Syne', sans-serif; }

        .gc-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 24px; border-radius: 10px;
          font-weight: 600; font-size: 14px; cursor: pointer;
          transition: all 0.2s ease; border: none; outline: none;
        }
        .gc-btn-primary:hover { transform: translateY(-1px); }

        .role-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 32px 28px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .role-card:hover {
          border-color: var(--card-hover-border, var(--card-border));
          transform: translateY(-4px);
          box-shadow: 0 24px 64px rgba(0,0,0,0.15);
        }

        .feat-card {
          background: var(--feat-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .feat-card:hover {
          border-color: var(--accent-teal);
          transform: translateY(-2px);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
        .delay-4 { animation-delay: 0.4s; }
        .delay-5 { animation-delay: 0.5s; }

        @keyframes float {
          0%,100% { transform: translateY(0px) rotate(-6deg); }
          50%     { transform: translateY(-18px) rotate(-6deg); }
        }
        .float-car { animation: float 6s ease-in-out infinite; }

        .pill {
          display: inline-block; padding: 3px 12px;
          border-radius: 99px; font-size: 11px;
          font-weight: 600; letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* Hide duplicate mobile controls on desktop */
        @media (min-width: 768px) {
          .md-hidden-flex { display: none !important; }
        }
      `}</style>

      <div className="gc-root" style={{
        minHeight: '100vh',
        background: 'var(--hero-gradient)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'background 0.3s ease',
      }}>
        {/* Animated grid canvas */}
        <canvas ref={canvasRef} style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Glow orbs */}
        <div style={{
          position: 'fixed', top: '-20%', right: '-10%',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, var(--glow-purple) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'fixed', bottom: '-10%', left: '-5%',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, var(--glow-teal) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <PublicNav />

        {/* ── HERO ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: 1000, margin: '0 auto',
          padding: '80px 24px 40px',
          textAlign: 'center',
        }}>
          <div className="float-car" style={{
            position: 'absolute', top: 0, right: '8%',
            opacity: 0.05, pointerEvents: 'none',
          }}>
            <Car size={260} color="var(--text-primary)" />
          </div>

          <div className="fade-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 99, padding: '6px 16px', marginBottom: 28,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent-teal)',
              display: 'inline-block', animation: 'pulse 2s ease infinite',
            }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
              Your #1 Kenya Platform for Connecting Vehicles to Service Providers
            </span>
          </div>

          <h1 className="gc-display fade-up delay-1" style={{
            fontSize: 'clamp(36px, 5vw, 60px)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: 24,
          }}>
            Your Vehicle,<br />
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-teal), var(--accent-purple))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Seamlessly Connected to Expert Care.</span>
          </h1>

          <p className="fade-up delay-2" style={{
            fontSize: 17, color: 'var(--text-secondary)',
            maxWidth: 500, margin: '0 auto 56px',
            lineHeight: 1.75, fontWeight: 400,
          }}>
            Connect with verified garages, manage your fleet, and stay on top of every service — all in one place.
          </p>

          {/* ── ROLE CARDS ── */}
          <div className="fade-up delay-3" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20, maxWidth: 900, margin: '0 auto 80px',
          }}>
            {roles.map((role) => {
              const Icon = role.icon
              return (
                <div
                  key={role.label}
                  className="role-card"
                  style={{ '--card-hover-border': role.border }}
                  onClick={() => router.push(role.route)}
                >
                  {role.pill && (
                    <div style={{ marginBottom: 16 }}>
                      <span className="pill" style={{
                        background: role.accentLight,
                        color: role.accent,
                        border: `1px solid ${role.accentRaw}33`,
                      }}>
                        {role.pill}
                      </span>
                    </div>
                  )}

                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: role.accentLight,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 18,
                  }}>
                    <Icon size={24} color={role.accentRaw} />
                  </div>

                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {role.sub}
                  </p>
                  <h3 className="gc-display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                    {role.label}
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24 }}>
                    {role.description}
                  </p>

                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: 20, borderTop: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: role.accentRaw }}>
                      {role.cta}
                    </span>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: role.accentLight,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <ArrowRight size={15} color={role.accentRaw} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── FEATURES ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: 1000, margin: '0 auto',
          padding: '0 24px 80px',
        }}>
          <div className="fade-up delay-4" style={{ textAlign: 'center', marginBottom: 40 }}>
            <p className="gc-display" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
              Why Carfix-Connect
            </p>
            <h2 className="gc-display" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Everything your vehicle needs
            </h2>
          </div>

          <div className="fade-up delay-5" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="feat-card">
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'var(--icon-feat-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14,
                  }}>
                    <Icon size={18} color="var(--accent-teal)" />
                  </div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{f.title}</h4>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{f.body}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── CTA BANNER ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center',
          padding: '60px 24px',
        }}>
          <p className="gc-display" style={{
            fontSize: 'clamp(10px, 3vw, 16px)',
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '-0.01em',
            fontStyle: 'italic',
          }}>
            Bridging the Gap Between Your Car and Expert Care.
          </p>
        </div>

        {/* ── SOCIAL & QR SECTION (above footer) ── */}
        {(social.whatsapp || social.facebook || social.instagram || social.qr_url) && (
          <div style={{
            position: 'relative', zIndex: 1,
            maxWidth: 800, margin: '0 auto',
            padding: '0 24px 60px',
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 40,
          }}>
            {/* Social icons */}
            {(social.whatsapp || social.facebook || social.instagram) && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Follow Us
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                  {social.whatsapp && (
                    <a href={social.whatsapp} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                      style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--feat-bg)', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s, border-color 0.2s', textDecoration: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#25D366' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--card-border)' }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.66 0-3.203-.507-4.484-1.375l-.32-.192-2.876.855.855-2.876-.192-.32A7.963 7.963 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" fill="#25D366"/></svg>
                    </a>
                  )}
                  {social.facebook && (
                    <a href={social.facebook} target="_blank" rel="noopener noreferrer" title="Facebook"
                      style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--feat-bg)', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s, border-color 0.2s', textDecoration: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#1877F2' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--card-border)' }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </a>
                  )}
                  {social.instagram && (
                    <a href={social.instagram} target="_blank" rel="noopener noreferrer" title="Instagram"
                      style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--feat-bg)', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s, border-color 0.2s', textDecoration: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = '#E4405F' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--card-border)' }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" fill="url(#ig)"/><defs><linearGradient id="ig" x1="0" y1="24" x2="24" y2="0"><stop stopColor="#FFDC80"/><stop offset=".5" stopColor="#E4405F"/><stop offset="1" stopColor="#833AB4"/></linearGradient></defs></svg>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* QR Code */}
            {social.qr_url && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Scan & Share
                </span>
                <img src={social.qr_url} alt="QR Code" style={{
                  width: 100, height: 100, borderRadius: 12,
                  border: '1px solid var(--card-border)',
                  background: '#fff', padding: 4, objectFit: 'contain',
                }} />
                <a href={social.qr_url} download="Carfix-Connect-QR.png"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: 'var(--footer-link)', textDecoration: 'none',
                    padding: '4px 10px', borderRadius: 6,
                    border: '1px solid var(--card-border)',
                    background: 'var(--feat-bg)',
                    cursor: 'pointer', transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-teal)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-border)'}
                >
                  <Download size={12} /> Download QR
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── FOOTER (uniform across pages) ── */}
        <footer style={{
          position: 'relative', zIndex: 1,
          borderTop: '1px solid var(--border)',
          background: 'linear-gradient(180deg, transparent 0%, var(--surface) 30%)',
          padding: '40px 48px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
            background: 'linear-gradient(90deg, transparent, var(--accent-teal), var(--accent-purple), transparent)',
            opacity: 0.4,
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain', opacity: 0.5 }} />
            <span className="gc-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--footer-name)' }}>Carfix-Connect</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: 'var(--footer-link)' }}>
            {[
              { label: 'About', href: '/about' },
              { label: 'Features', href: '/features' },
              { label: 'How It Works', href: '/how-it-works' },
              { label: 'Get Started', href: '/auth/signup' },
              { label: 'Contact', href: '/contact' },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--footer-link)'}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 13, color: 'var(--footer-copy)' }}>
            © {new Date().getFullYear()} Carfix-Connect. Connecting Drivers to Trusted Vehicle Services.
          </p>
        </footer>
      </div>
    </>
  )
}