'use client'

import React, { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Building2, User, Calendar, History, Bell, ArrowRight, Shield, Zap } from 'lucide-react'
import PublicNav from '@/components/PublicNav'

export default function LandingPage() {
  const router = useRouter()
  const canvasRef = useRef(null)

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

      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1

      const spacing = 60
      // Vertical lines
      for (let x = (offset % spacing); x < canvas.width; x += spacing) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
      }
      // Horizontal lines
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
      accent: '#3b82f6',
      accentLight: 'rgba(59,130,246,0.12)',
      border: 'rgba(59,130,246,0.3)',
      cta: 'Get Started',
      route: '/auth/signup?type=normal',
      pill: 'Most Popular',
    },
    {
      icon: Building2,
      label: 'Company Fleet',
      sub: 'Business',
      description: 'Centralise fleet maintenance, control budgets, and manage your entire team.',
      accent: '#8b5cf6',
      accentLight: 'rgba(139,92,246,0.12)',
      border: 'rgba(139,92,246,0.3)',
      cta: 'Register Company',
      route: '/auth/company-signup',
      pill: null,
    },
    {
      icon: Wrench,
      label: 'Service Provider',
      sub: 'Garage / Workshop',
      description: 'Grow your workshop, accept online bookings, and build a loyal customer base.',
      accent: '#10b981',
      accentLight: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.3)',
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        .gc-root { font-family: 'DM Sans', sans-serif; }
        .gc-display { font-family: 'Syne', sans-serif; }

        .gc-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 24px; border-radius: 10px;
          font-weight: 500; font-size: 14px; cursor: pointer;
          transition: all 0.2s ease; border: none; outline: none;
        }
        .gc-btn-primary:hover { transform: translateY(-1px); }

        .gc-nav-link:hover {
          background: rgba(255,255,255,0.08) !important;
          color: #fff !important;
        }

        .role-card {
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 20px;
          padding: 32px 28px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .role-card::before {
          content: '';
          position: absolute; inset: 0;
          background: var(--card-accent-light);
          opacity: 0;
          transition: opacity 0.25s ease;
          border-radius: 20px;
        }
        .role-card:hover::before { opacity: 1; }
        .role-card:hover {
          border-color: var(--card-border);
          transform: translateY(-4px);
          box-shadow: 0 24px 64px rgba(0,0,0,0.4);
        }

        .feat-card {
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .feat-card:hover {
          background: rgba(0,0,0,0.3);
          border-color: rgba(255,255,255,0.2);
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
          50%      { transform: translateY(-18px) rotate(-6deg); }
        }
        .float-car { animation: float 6s ease-in-out infinite; }

        .pill {
          display: inline-block;
          padding: 3px 12px;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
      `}</style>

      <div className="gc-root" style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 35%, #2563eb 60%, #4338ca 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Animated grid canvas */}
        <canvas ref={canvasRef} style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Radial glow */}
        <div style={{
          position: 'fixed', top: '-20%', right: '-10%',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'fixed', bottom: '-20%', left: '-10%',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ── NAV ── */}
        <PublicNav />

        {/* ── HERO ── */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '72px 24px 40px' }}>

          {/* Floating car illustration */}
          <div className="float-car" style={{
            position: 'absolute', top: 0, right: '8%',
            opacity: 0.07, pointerEvents: 'none',
          }}>
            <Car size={260} color="#fff" />
          </div>

          <div className="fade-up" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 99, padding: '6px 16px', marginBottom: 28,
          }}>
            <Zap size={13} color="#93c5fd" />
            <span style={{ fontSize: 12, color: '#bfdbfe', fontWeight: 500, letterSpacing: '0.04em' }}>
              Kenya's #1 Vehicle Care Platform
            </span>
          </div>

          <h1 className="gc-display fade-up delay-1" style={{
            fontSize: 'clamp(36px, 5vw, 60px)',
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: 24,
          }}>
            Your Vehicle,<br />
            <span style={{ color: '#bfdbfe' }}>Perfectly Cared For.</span>
          </h1>

          <p className="fade-up delay-2" style={{
            fontSize: 17, color: 'rgba(255,255,255,0.82)',
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
                  style={{
                    '--card-accent-light': role.accentLight,
                    '--card-border': role.border,
                  }}
                  onClick={() => router.push(role.route)}
                >
                  {role.pill && (
                    <div style={{ marginBottom: 16 }}>
                      <span className="pill" style={{ background: role.accentLight, color: role.accent, border: `1px solid ${role.border}` }}>
                        {role.pill}
                      </span>
                    </div>
                  )}

                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: role.accentLight,
                    border: `1px solid ${role.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 18,
                  }}>
                    <Icon size={24} color={role.accent} />
                  </div>

                  <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                    {role.sub}
                  </p>
                  <h3 className="gc-display" style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', marginBottom: 10 }}>
                    {role.label}
                  </h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65, marginBottom: 24 }}>
                    {role.description}
                  </p>

                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: role.accent }}>
                      {role.cta}
                    </span>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: role.accentLight, border: `1px solid ${role.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <ArrowRight size={15} color={role.accent} />
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
            <p className="gc-display" style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
              Why Carfix-Connect
            </p>
            <h2 className="gc-display" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
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
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14,
                  }}>
                    <Icon size={18} color="rgba(255,255,255,0.85)" />
                  </div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: '#ffffff', marginBottom: 6 }}>{f.title}</h4>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>{f.body}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer style={{
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            <button
              onClick={() => router.push('/about')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
            >
              About
            </button>
            <button
               onClick={() => router.push('/pricing')}
               style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
               onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
               onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
             >
               Pricing
             </button>
            <button
              onClick={() => router.push('/contact')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.85)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
            >
              Contact
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            © {new Date().getFullYear()} Carfix-Connect. Built for Kenyan roads.
          </p>
        </footer>
      </div>
    </>
  )
}