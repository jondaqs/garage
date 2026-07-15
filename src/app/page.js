'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Building2, User, Calendar, History, Bell, ArrowRight, Shield, Zap } from 'lucide-react'
import PublicNav from '@/components/PublicNav'

export default function LandingPage() {
  const router = useRouter()
  const canvasRef = useRef(null)
  const [theme, setTheme] = useState('dark')

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
              Your #1 Platform for Connecting Vehicles to Service Providers
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

        {/* ── FOOTER ── */}
        <footer style={{
          position: 'relative', zIndex: 1,
          borderTop: '1px solid var(--border)',
          background: 'linear-gradient(180deg, transparent 0%, var(--surface) 30%)',
          padding: '40px 48px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          {/* Add a teal glow line at the top */}
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
            {['about', 'pricing', 'how-it-works', 'contact'].map(p => (
              <button
                key={p}
                onClick={() => router.push(`/${p}`)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0, textTransform: 'capitalize' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--footer-link)'}
              >
                {p === 'how-it-works' ? 'How It Works' : p.charAt(0).toUpperCase() + p.slice(1)}
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