'use client'

import React, { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Building2, User, Calendar, History, Bell, ArrowRight, Shield, Zap } from 'lucide-react'

export default function LandingPage() {
const router = useRouter()
const canvasRef = useRef(null)

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
},
]

const features = [
{ icon: Calendar, title: 'Instant Booking', body: 'Schedule with verified garages in seconds — no phone calls needed.' },
{ icon: History, title: 'Full Service Log', body: 'Every job, every part, every date — your vehicle history always on hand.' },
{ icon: Bell, title: 'Smart Reminders', body: "We'll ping you before your next service is due so you never fall behind." },
{ icon: Shield, title: 'Verified Providers', body: 'Every workshop is vetted and rated by real customers before listing.' },
{ icon: Zap, title: 'Real-time Updates', body: 'Live status from drop-off to collection.' },
{ icon: Building2,title: 'Fleet Control', body: 'Full visibility across every company vehicle.' },
]

return (
<>
<style>
{`
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

  .gc-root { font-family: 'DM Sans', sans-serif; }
  .gc-display { font-family: 'Syne', sans-serif; }

  .gc-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 22px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.25s ease;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.08);
    backdrop-filter: blur(10px);
  }

  .gc-btn-primary:hover {
    transform: translateY(-2px);
    background: rgba(255,255,255,0.16);
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  }

  .role-card {
    background: linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 22px;
    padding: 30px 26px;
    cursor: pointer;
    transition: all 0.35s cubic-bezier(0.22,1,0.36,1);
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(20px);
  }

  .role-card:hover {
    transform: translateY(-6px) scale(1.015);
    border-color: rgba(255,255,255,0.28);
    box-shadow: 0 30px 80px rgba(0,0,0,0.45);
  }

  .feat-card {
    background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 18px;
    padding: 22px;
    backdrop-filter: blur(14px);
    transition: all 0.25s ease;
  }

  .feat-card:hover {
    transform: translateY(-3px);
    border-color: rgba(255,255,255,0.25);
    box-shadow: 0 20px 50px rgba(0,0,0,0.35);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(32px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .fade-up { animation: fadeUp 0.7s ease both; }
`}
</style>

  <div className="gc-root" style={{
    minHeight: '100vh',
    background: `
      linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 35%, #2563eb 60%, #4338ca 100%),
      radial-gradient(circle at 20% 80%, rgba(255,255,255,0.08), transparent 40%)
    `,
    position: 'relative',
    overflow: 'hidden',
  }}>

    <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

    {/* NAV */}
    <nav style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '20px 48px',
      backdropFilter: 'blur(8px)',
      background: 'rgba(255,255,255,0.03)',
    }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Car size={20} color="#fff" />
        <span className="gc-display" style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
          GariCare
        </span>
      </div>

      <button
        onClick={() => router.push('/auth/login')}
        className="gc-btn-primary"
      >
        Sign In <ArrowRight size={15} />
      </button>
    </nav>

    {/* HERO */}
    <div style={{ textAlign: 'center', padding: '80px 24px' }}>

      <h1 className="gc-display fade-up" style={{
        fontSize: 'clamp(36px, 5vw, 60px)',
        fontWeight: 800,
        color: '#fff',
        marginBottom: 20,
      }}>
        Your Vehicle,<br />
        <span style={{
          background: 'linear-gradient(90deg, #93c5fd, #c4b5fd)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Perfectly Cared For.
        </span>
      </h1>

      <p className="fade-up delay-1" style={{
        color: 'rgba(255,255,255,0.8)',
        maxWidth: 500,
        margin: '0 auto 50px'
      }}>
        Connect with verified garages, manage your fleet, and stay on top of every service.
      </p>

      {/* ROLE CARDS */}
      <div className="fade-up delay-2" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 20,
        maxWidth: 900,
        margin: '0 auto'
      }}>
        {roles.map((role) => {
          const Icon = role.icon
          return (
            <div
              key={role.label}
              className="role-card"
              onClick={() => router.push(role.route)}
              onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseUp={(e) => e.currentTarget.style.transform = ''}
            >
              <Icon size={26} color={role.accent} />

              <h3 style={{ color: '#fff', marginTop: 12 }}>{role.label}</h3>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
                {role.description}
              </p>

              <div style={{
                marginTop: 20,
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span style={{ color: role.accent, fontWeight: 700 }}>
                  {role.cta}
                </span>
                <ArrowRight size={16} color={role.accent} />
              </div>
            </div>
          )
        })}
      </div>
    </div>

    {/* FEATURES */}
    <div style={{ padding: '60px 24px', maxWidth: 1000, margin: '0 auto' }}>
      <h2 style={{ color: '#fff', textAlign: 'center', marginBottom: 40 }}>
        Everything your vehicle needs
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16
      }}>
        {features.map((f) => {
          const Icon = f.icon
          return (
            <div key={f.title} className="feat-card">
              <Icon size={18} color="#fff" />
              <h4 style={{ color: '#fff' }}>{f.title}</h4>
              <p style={{ color: 'rgba(255,255,255,0.7)' }}>{f.body}</p>
            </div>
          )
        })}
      </div>
    </div>

  </div>
</>

)
}