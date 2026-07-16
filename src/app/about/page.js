// → Drop this file at: src/app/about/page.js
'use client'

import { useRouter } from 'next/navigation'
import {
  ArrowRight, ArrowLeft, Target, Heart, Users, Zap, Shield, MapPin
} from 'lucide-react'
import PublicNav from '@/components/PublicNav'

export default function AboutPage() {
  const router = useRouter()

  const values = [
    {
      icon: Shield,
      title: 'Trust First',
      body: "Every service provider on Carfix-Connect is vetted before they're listed. No flaky garages, no surprise charges, no guesswork."
    },
    {
      icon: Zap,
      title: 'Built for Speed',
      body: "Booking a service should take less time than waiting on hold. We obsess over removing every unnecessary tap."
    },
    {
      icon: Heart,
      title: 'Local Focus',
      body: "We're Connecting Drivers to Trusted Vehicle Services. Local context, local prices."
    },
    {
      icon: Users,
      title: 'For Everyone',
      body: 'Whether you own one car or run a hundred-vehicle fleet, you get the same clean tools — just sized to your needs.'
    },
  ]

  const stats = [
    { value: 'Drivers',   label: 'Find verified workshops' },
    { value: 'Vehicle Service Providers',   label: 'Grow your customer base' },
    { value: 'Vehicle Service Providers',   label: 'Grow your visibility' },
    { value: 'Companies', label: 'Manage fleets with ease' },
    { value: 'One App',   label: 'Built around you' },
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

        .value-card {
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px;
          padding: 28px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: all 0.25s ease;
        }
        .value-card:hover {
          border-color: rgba(255,255,255,0.22);
          transform: translateY(-3px);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
      `}</style>

      <div className="gc-root blue-theme" style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 60%, #1e40af 100%)',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: '-200px', right: '-100px',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(37,99,235,0.3) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ── NAV ── */}
        <PublicNav />

        {/* ── HERO ── */}
        <div style={{ position: 'relative', zIndex: 1, padding: '72px 48px 40px', maxWidth: 1100, margin: '0 auto' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
              fontSize: 13, cursor: 'pointer', marginBottom: 24, padding: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
          >
            <ArrowLeft size={14} />
            Back to home
          </button>

          <div className="fade-up">
            <span className="pill" style={{
              display: 'inline-block',
              padding: '4px 14px', borderRadius: 99,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.18)',
              marginBottom: 24,
            }}>
              About Us
            </span>
            <h1 className="gc-display" style={{
              fontSize: 'clamp(36px, 5vw, 56px)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              marginBottom: 24,
              color: '#fff',
            }}>
              Car care, <span style={{ color: '#60a5fa' }}>without the headaches</span>
            </h1>
            <p style={{
              fontSize: 18, lineHeight: 1.7,
              color: 'rgba(255,255,255,0.78)',
              maxWidth: 720,
            }}>
              Carfix-Connect connects drivers, garages, and fleet operators on one straightforward platform. We started because servicing a vehicle can be harder than it should be — too many phone calls, too much uncertainty, too many missing records. So we built the tool we wished existed.
            </p>
          </div>
        </div>

        {/* ── MISSION ── */}
        <div style={{ position: 'relative', zIndex: 1, padding: '40px 48px 60px', maxWidth: 1100, margin: '0 auto' }}>
          <div className="value-card fade-up delay-1" style={{ padding: 40, marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(96,165,250,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Target size={20} color="#60a5fa" />
              </div>
              <h2 className="gc-display" style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
                Our mission
              </h2>
            </div>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: 'rgba(255,255,255,0.75)' }}>
              To make every car service feel as simple as ordering a ride. That means tracking work order progress, transparent pricing, verified providers, full service history at your fingertips, and reminders before things break — not after. For drivers, that's peace of mind. For garages, it's a steady book of trusted customers. For companies, it's complete visibility across every vehicle in the fleet.
            </p>
          </div>

          {/* Stats / who-we-serve */}
          <h3 className="gc-display fade-up delay-2" style={{
            fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)', marginBottom: 20,
          }}>
            Who we serve
          </h3>
          <div className="fade-up delay-2" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 64,
          }}>
            {stats.map((s, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '20px 22px',
              }}>
                <div className="gc-display" style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Values */}
          <h3 className="gc-display fade-up delay-3" style={{
            fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)', marginBottom: 20,
          }}>
            What we believe
          </h3>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18,
          }}>
            {values.map((v, i) => {
              const Icon = v.icon
              return (
                <div key={i} className={`value-card fade-up delay-${Math.min(i + 1, 3)}`}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                  }}>
                    <Icon size={18} color="rgba(255,255,255,0.9)" />
                  </div>
                  <h4 className="gc-display" style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                    {v.title}
                  </h4>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.7)' }}>
                    {v.body}
                  </p>
                </div>
              )
            })}
          </div>

          {/* CTA */}
          <div className="fade-up" style={{
            marginTop: 72, textAlign: 'center', padding: '40px 24px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20,
          }}>
            <h3 className="gc-display" style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 10 }}>
              Want to chat?
            </h3>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', marginBottom: 22 }}>
              We'd love to hear from drivers, garage owners, and fleet managers alike.
            </p>
            <button
              onClick={() => router.push('/contact')}
              className="gc-btn-primary"
              style={{ background: '#fff', color: '#0a1628' }}
            >
              Get in touch <ArrowRight size={15} />
            </button>
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
            <button onClick={() => router.push('/about')}        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}>About</button>
            <button onClick={() => router.push('/pricing')}      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}>Pricing</button>
            <button onClick={() => router.push('/how-it-works')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}>How It Works</button>
            <button onClick={() => router.push('/contact')}      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}>Contact</button>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            © {new Date().getFullYear()} Carfix-Connect. Connecting Drivers to Trusted Vehicle Services.
          </p>
        </footer>
      </div>
    </>
  )
}