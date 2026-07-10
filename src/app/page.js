'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Wrench, Building2, User, Calendar, History, Bell, ArrowRight,
  Shield, Zap, MessageSquare, Star, ChevronRight, Search, Clock,
  CheckCircle, Users, Car
} from 'lucide-react'
import PublicNav from '@/components/PublicNav'

export default function LandingPage() {
  const router = useRouter()
  const canvasRef = useRef(null)
  const [activeStep, setActiveStep] = useState(0)

  // Subtle animated dot grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame
    let time = 0

    const draw = () => {
      canvas.width = canvas.offsetWidth * 2
      canvas.height = canvas.offsetHeight * 2
      ctx.scale(2, 2)
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)

      const spacing = 40
      for (let x = 0; x < canvas.offsetWidth; x += spacing) {
        for (let y = 0; y < canvas.offsetHeight; y += spacing) {
          const dist = Math.sqrt(
            Math.pow(x - canvas.offsetWidth * 0.5, 2) +
            Math.pow(y - canvas.offsetHeight * 0.3, 2)
          )
          const pulse = Math.sin(dist * 0.008 - time * 0.015) * 0.5 + 0.5
          ctx.fillStyle = `rgba(255,255,255,${0.015 + pulse * 0.03})`
          ctx.beginPath()
          ctx.arc(x, y, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      time++
      animFrame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animFrame)
  }, [])

  // Auto-rotate steps
  useEffect(() => {
    const t = setInterval(() => setActiveStep(s => (s + 1) % 3), 4000)
    return () => clearInterval(t)
  }, [])

  const roles = [
    {
      icon: User,
      label: 'Vehicle Owner',
      sub: 'Personal',
      description: 'Book services, compare quotes, and track every service your car has ever had.',
      accent: '#3b82f6',
      bg: 'rgba(59,130,246,0.08)',
      border: 'rgba(59,130,246,0.2)',
      cta: 'Get Started Free',
      route: '/auth/signup?type=normal',
      popular: true,
    },
    {
      icon: Building2,
      label: 'Company Fleet',
      sub: 'Business',
      description: 'One dashboard for every vehicle. Control costs, assign drivers, and never miss a service.',
      accent: '#8b5cf6',
      bg: 'rgba(139,92,246,0.08)',
      border: 'rgba(139,92,246,0.2)',
      cta: 'Register Company',
      route: '/auth/company-signup',
    },
    {
      icon: Wrench,
      label: 'Service Provider',
      sub: 'Garage / Workshop',
      description: 'Accept online bookings, receive service requests, manage work orders — grow your business.',
      accent: '#10b981',
      bg: 'rgba(16,185,129,0.08)',
      border: 'rgba(16,185,129,0.2)',
      cta: 'List Your Garage',
      route: '/auth/provider-signup',
    },
  ]

  const steps = [
    {
      icon: Search,
      title: 'Describe what you need',
      body: 'Post a service request with your vehicle details. Be specific or keep it general — our providers handle both.',
    },
    {
      icon: MessageSquare,
      title: 'Get proposals & compare',
      body: 'Verified providers send you quotes with pricing, timelines, and ratings. Choose the one that fits.',
    },
    {
      icon: CheckCircle,
      title: 'Book, track, done',
      body: 'Approve the estimate, follow your vehicle\'s progress live, and pay when you\'re satisfied.',
    },
  ]

  const features = [
    { icon: Calendar,       title: 'Instant Booking',     body: 'Schedule with verified garages in seconds — no phone calls needed.' },
    { icon: History,        title: 'Complete Service Log', body: 'Every job, every part, every date. Your vehicle history, always on hand.' },
    { icon: Bell,           title: 'Smart Reminders',     body: 'Get notified before your next service is due. Never fall behind on maintenance.' },
    { icon: Shield,         title: 'Verified Providers',  body: 'Every workshop is vetted and rated by real customers before listing.' },
    { icon: Zap,            title: 'Real-time Updates',   body: 'Live status from drop-off to collection. Know exactly when your car is ready.' },
    { icon: Building2,      title: 'Fleet Dashboard',     body: 'Full visibility across every company vehicle — mileage, spend, bookings, team.' },
  ]

  const stats = [
    { value: '2,400+', label: 'Vehicle Owners' },
    { value: '180+',   label: 'Verified Providers' },
    { value: '45+',    label: 'Companies' },
    { value: '24/7',   label: 'Availability' },
  ]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        .lp { font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fi { animation: fadeIn 0.6s ease both; }
        .fi-1 { animation-delay: 0.1s; }
        .fi-2 { animation-delay: 0.2s; }
        .fi-3 { animation-delay: 0.3s; }
        .fi-4 { animation-delay: 0.4s; }
        .fi-5 { animation-delay: 0.5s; }
        .fi-6 { animation-delay: 0.6s; }

        .role-c {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 32px 28px 28px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
          position: relative;
          backdrop-filter: blur(20px);
        }
        .role-c:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.16);
          transform: translateY(-6px);
          box-shadow: 0 32px 64px -12px rgba(0,0,0,0.5);
        }

        .feat-c {
          padding: 28px 24px;
          border-radius: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.25s ease;
        }
        .feat-c:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.12);
        }

        .step-ind {
          transition: all 0.4s ease;
        }

        .glow-btn {
          position: relative;
          overflow: hidden;
        }
        .glow-btn::after {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent 60%);
          pointer-events: none;
        }

        @media (max-width: 768px) {
          .role-grid { grid-template-columns: 1fr !important; }
          .feat-grid { grid-template-columns: 1fr !important; }
          .stats-row { grid-template-columns: repeat(2, 1fr) !important; }
          .step-row { flex-direction: column !important; }
        }
      `}</style>

      <div className="lp" style={{
        minHeight: '100vh',
        background: '#0a0e1a',
        position: 'relative',
        overflow: 'hidden',
        color: '#ffffff',
      }}>

        {/* Animated dot grid */}
        <canvas ref={canvasRef} style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Ambient glows */}
        <div style={{ position: 'fixed', top: '-30%', left: '20%', width: 800, height: 800, background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', bottom: '-20%', right: '10%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        {/* ── NAV ── */}
        <PublicNav />

        {/* ═══ HERO ═══ */}
        <section style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '80px 24px 48px', maxWidth: 780, margin: '0 auto' }}>

          <div className="fi" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 99, padding: '7px 18px', marginBottom: 32 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 13, color: '#93c5fd', fontWeight: 500, letterSpacing: '0.02em' }}>
              Kenya&apos;s Vehicle Service Marketplace
            </span>
          </div>

          <h1 className="fi fi-1" style={{
            fontSize: 'clamp(38px, 6vw, 68px)',
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
            marginBottom: 24,
          }}>
            Stop searching.<br />
            <span style={{ background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #34d399 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Start getting proposals.
            </span>
          </h1>

          <p className="fi fi-2" style={{
            fontSize: 18, color: 'rgba(255,255,255,0.6)',
            maxWidth: 520, margin: '0 auto 40px',
            lineHeight: 1.7, fontWeight: 400,
          }}>
            Post what your car needs. Verified mechanics send you quotes.
            Pick the best one. It&apos;s that simple.
          </p>

          <div className="fi fi-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/auth/signup?type=normal')}
              className="glow-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 28px', borderRadius: 12,
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff', fontWeight: 600, fontSize: 15,
                border: 'none', cursor: 'pointer',
                boxShadow: '0 8px 32px rgba(59,130,246,0.3)',
              }}
            >
              Get Started Free <ArrowRight size={16} />
            </button>
            <button
              onClick={() => router.push('/auth/provider-signup')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 28px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontWeight: 500, fontSize: 15,
                cursor: 'pointer',
              }}
            >
              I&apos;m a Provider <Wrench size={15} />
            </button>
          </div>
        </section>

        {/* ═══ STATS BAR ═══ */}
        <section style={{ position: 'relative', zIndex: 1, maxWidth: 700, margin: '0 auto', padding: '0 24px 64px' }}>
          <div className="fi fi-4 stats-row" style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1,
            background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden',
          }}>
            {stats.map((s, i) => (
              <div key={i} style={{ padding: '20px 16px', textAlign: 'center', background: '#0a0e1a' }}>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
              How it works
            </p>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em' }}>
              Three steps. Zero hassle.
            </h2>
          </div>

          <div className="step-row" style={{ display: 'flex', gap: 20 }}>
            {steps.map((step, i) => {
              const Icon = step.icon
              const active = i === activeStep
              return (
                <div
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className="step-ind"
                  style={{
                    flex: 1, padding: '28px 24px', borderRadius: 16, cursor: 'pointer',
                    background: active ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: active ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.3s ease',
                    }}>
                      <Icon size={18} color={active ? '#60a5fa' : 'rgba(255,255,255,0.4)'} />
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: active ? '#60a5fa' : 'rgba(255,255,255,0.25)',
                      letterSpacing: '0.08em',
                    }}>
                      STEP {i + 1}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: active ? '#fff' : 'rgba(255,255,255,0.6)', marginBottom: 8, transition: 'color 0.3s' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 13, color: active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)', lineHeight: 1.65, transition: 'color 0.3s' }}>
                    {step.body}
                  </p>
                  {/* Progress bar */}
                  <div style={{ marginTop: 18, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: active ? '#3b82f6' : 'transparent',
                      width: active ? '100%' : '0%',
                      transition: 'width 4s linear',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ═══ ROLE CARDS ═══ */}
        <section style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#10b981', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
              Choose your path
            </p>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em' }}>
              Built for every side of car care
            </h2>
          </div>

          <div className="role-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {roles.map((role) => {
              const Icon = role.icon
              return (
                <div key={role.label} className="role-c" onClick={() => router.push(role.route)}>
                  {role.popular && (
                    <div style={{ position: 'absolute', top: 16, right: 16 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: role.accent, background: role.bg, border: `1px solid ${role.border}`, padding: '4px 10px', borderRadius: 99, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Popular
                      </span>
                    </div>
                  )}

                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: role.bg, border: `1px solid ${role.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 20,
                  }}>
                    <Icon size={22} color={role.accent} />
                  </div>

                  <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {role.sub}
                  </p>
                  <h3 style={{ fontSize: 21, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.01em' }}>
                    {role.label}
                  </h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 28 }}>
                    {role.description}
                  </p>

                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: role.accent }}>{role.cta}</span>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: role.bg, border: `1px solid ${role.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <ArrowRight size={14} color={role.accent} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ═══ FEATURES ═══ */}
        <section style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
              Features
            </p>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em' }}>
              Everything your vehicle needs
            </h2>
          </div>

          <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="feat-c">
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                  }}>
                    <Icon size={18} color="rgba(255,255,255,0.7)" />
                  </div>
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{f.title}</h4>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>{f.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ═══ CTA ═══ */}
        <section style={{ position: 'relative', zIndex: 1, maxWidth: 700, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.08) 100%)',
            border: '1px solid rgba(59,130,246,0.15)',
            borderRadius: 24, padding: '48px 40px', textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
              Ready to take care of your car?
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>
              Join thousands of vehicle owners and service providers already on the platform.
            </p>
            <button
              onClick={() => router.push('/auth/signup?type=normal')}
              className="glow-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '14px 32px', borderRadius: 12,
                background: '#fff', color: '#0a0e1a',
                fontWeight: 700, fontSize: 15,
                border: 'none', cursor: 'pointer',
              }}
            >
              Create Free Account <ArrowRight size={16} />
            </button>
          </div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer style={{
          position: 'relative', zIndex: 1,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '28px 48px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain', opacity: 0.5 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.02em' }}>Carfix-Connect</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
            {['About', 'Pricing', 'Docs', 'Contact'].map(link => (
              <button
                key={link}
                onClick={() => router.push(`/${link.toLowerCase()}`)}
                style={{
                  background: 'none', border: 'none', color: 'inherit',
                  cursor: 'pointer', fontSize: 13, padding: 0,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
              >
                {link === 'Contact' ? 'Contact Us' : link === 'About' ? 'About Us' : link}
              </button>
            ))}
            <button
              onClick={() => router.push('/terms')}
              style={{
                background: 'none', border: 'none', color: 'inherit',
                cursor: 'pointer', fontSize: 13, padding: 0,
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
            >
              Terms
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
            © {new Date().getFullYear()} Carfix-Connect
          </p>
        </footer>
      </div>
    </>
  )
}