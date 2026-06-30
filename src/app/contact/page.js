// → Drop this file at: src/app/contact/page.js
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Car, ArrowRight, ArrowLeft, Mail, Phone, MapPin, MessageCircle,
  Send, CheckCircle2, AlertCircle
} from 'lucide-react'

// ─── Configure these once your business contact details are confirmed ──────
const SUPPORT_EMAIL = 'info@carfix-connect.com'
const SUPPORT_PHONE = '+254 700 000 000'
const SUPPORT_LOCATION = 'Nairobi, Kenya'
// ───────────────────────────────────────────────────────────────────────────

export default function ContactPage() {
  const router = useRouter()

  // Form
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [topic,   setTopic]   = useState('general')
  const [message, setMessage] = useState('')
  const [error,   setError]   = useState('')
  const [sent,    setSent]    = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim())    { setError('Please enter your name.');    return }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Please enter a valid email address.'); return
    }
    if (!message.trim()) { setError('Please enter a message.'); return }

    // Build a mailto link to open the user's email client with the message
    // pre-filled. Easy fallback while a real backend endpoint isn't wired up.
    const subject = `[Carfix-Connect ${topic}] from ${name.trim()}`
    const body =
      `Name: ${name.trim()}\n` +
      `Email: ${email.trim()}\n` +
      `Topic: ${topic}\n\n` +
      `${message.trim()}\n`

    const url = `mailto:${SUPPORT_EMAIL}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`

    window.location.href = url
    setSent(true)
  }

  const channels = [
    {
      icon: Mail,
      title: 'Email',
      value: SUPPORT_EMAIL,
      href: `mailto:${SUPPORT_EMAIL}`,
      hint: 'Best for detailed questions. We typically reply within one business day.',
    },
    {
      icon: Phone,
      title: 'Phone',
      value: SUPPORT_PHONE,
      href: `tel:${SUPPORT_PHONE.replace(/\s/g, '')}`,
      hint: 'Mon – Fri, 8 AM to 6 PM EAT.',
    },
    {
      icon: MapPin,
      title: 'Where we are',
      value: SUPPORT_LOCATION,
      href: null,
      hint: 'Visits by appointment only.',
    },
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

        .gc-input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .gc-input::placeholder { color: rgba(255,255,255,0.35); }
        .gc-input:focus {
          border-color: rgba(96,165,250,0.6);
          background: rgba(0,0,0,0.35);
        }

        .channel-card {
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 14px;
          padding: 22px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: all 0.25s ease;
        }
        .channel-card:hover {
          border-color: rgba(255,255,255,0.22);
          transform: translateY(-2px);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
      `}</style>

      <div className="gc-root" style={{
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
        <nav style={{
          position: 'relative', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 48px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(8px)',
          background: 'rgba(255,255,255,0.03)',
        }}>
          <button
            onClick={() => router.push('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Car size={20} color="#fff" />
            </div>
            <span className="gc-display" style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
              Carfix-Connect
            </span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => router.push('/about')}
              className="gc-nav-link"
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.75)',
                border: 'none', padding: '10px 16px', borderRadius: 8,
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              About Us
            </button>
            <button
              onClick={() => router.push('/pricing')}
               className="gc-nav-link"
               style={{
                 background: 'transparent',
                 color: 'rgba(255,255,255,0.75)',
                 border: 'none', padding: '10px 16px', borderRadius: 8,
                 fontSize: 14, fontWeight: 500, cursor: 'pointer',
                 transition: 'all 0.2s ease',
               }}
             >
               Pricing
             </button>
            <button
              onClick={() => router.push('/contact')}
              className="gc-nav-link"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: 'none', padding: '10px 16px', borderRadius: 8,
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Contact Us
            </button>
            <button
              onClick={() => router.push('/auth/login')}
              className="gc-btn-primary"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', marginLeft: 4 }}
            >
              Sign In <ArrowRight size={15} />
            </button>
          </div>
        </nav>

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
              display: 'inline-block', padding: '4px 14px', borderRadius: 99,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.18)',
              marginBottom: 24,
            }}>
              Get in touch
            </span>
            <h1 className="gc-display" style={{
              fontSize: 'clamp(36px, 5vw, 56px)',
              fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em',
              marginBottom: 18, color: '#fff',
            }}>
              We're here to <span style={{ color: '#60a5fa' }}>help</span>
            </h1>
            <p style={{
              fontSize: 18, lineHeight: 1.7,
              color: 'rgba(255,255,255,0.78)',
              maxWidth: 640,
            }}>
              Questions about Carfix-Connect? Want to list your garage? Looking for a fleet solution? Drop us a line — we read every message.
            </p>
          </div>
        </div>

        {/* ── BODY: channels + form ── */}
        <div style={{
          position: 'relative', zIndex: 1,
          padding: '20px 48px 60px',
          maxWidth: 1100, margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
          gap: 32,
        }}>
          {/* Channels column */}
          <div className="fade-up delay-1" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 className="gc-display" style={{
              fontSize: 14, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)', marginBottom: 4,
            }}>
              Reach us directly
            </h3>
            {channels.map((c, i) => {
              const Icon = c.icon
              const inner = (
                <>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: 'rgba(96,165,250,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    <Icon size={17} color="#60a5fa" />
                  </div>
                  <div className="gc-display" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 15, color: '#fff', fontWeight: 500, marginBottom: 6, wordBreak: 'break-word' }}>
                    {c.value}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
                    {c.hint}
                  </div>
                </>
              )
              return c.href ? (
                <a key={i} href={c.href} className="channel-card" style={{ textDecoration: 'none', display: 'block' }}>
                  {inner}
                </a>
              ) : (
                <div key={i} className="channel-card">
                  {inner}
                </div>
              )
            })}
          </div>

          {/* Form column */}
          <div className="fade-up delay-2">
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 18,
              padding: 32,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <MessageCircle size={20} color="#60a5fa" />
                <h2 className="gc-display" style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
                  Send us a message
                </h2>
              </div>
              <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
                Fill this in and we'll get back to you on the email you provide.
              </p>

              {sent ? (
                <div style={{
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.35)',
                  borderRadius: 12,
                  padding: 20,
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <CheckCircle2 size={20} color="#4ade80" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                      Your email client should now be open
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                      If it didn't open automatically, you can email us directly at{' '}
                      <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                        {SUPPORT_EMAIL}
                      </a>.
                    </div>
                    <button
                      onClick={() => { setSent(false); setName(''); setEmail(''); setMessage(''); setTopic('general') }}
                      style={{
                        marginTop: 12,
                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)',
                        fontSize: 13, padding: 0, cursor: 'pointer', textDecoration: 'underline',
                      }}
                    >
                      Send another message
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>
                      Your name
                    </label>
                    <input
                      className="gc-input"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      maxLength={80}
                      placeholder="Jane Wanjiku"
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>
                      Email
                    </label>
                    <input
                      className="gc-input"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      maxLength={120}
                      placeholder="you@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>
                      I'm reaching out about
                    </label>
                    <select
                      className="gc-input"
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      style={{ appearance: 'none', cursor: 'pointer' }}
                    >
                      <option value="general"     style={{ background: '#0a1628' }}>General question</option>
                      <option value="driver"      style={{ background: '#0a1628' }}>I'm a driver looking for service</option>
                      <option value="garage"      style={{ background: '#0a1628' }}>I want to list my garage</option>
                      <option value="company"     style={{ background: '#0a1628' }}>Fleet / company enquiry</option>
                      <option value="partnership" style={{ background: '#0a1628' }}>Partnership opportunity</option>
                      <option value="support"     style={{ background: '#0a1628' }}>Account / technical support</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>
                      Message
                    </label>
                    <textarea
                      className="gc-input"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={6}
                      maxLength={2000}
                      placeholder="Tell us how we can help..."
                      style={{ resize: 'vertical' }}
                      required
                    />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'right', marginTop: 4 }}>
                      {message.length}/2000
                    </div>
                  </div>

                  {error && (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: 12,
                      background: 'rgba(239,68,68,0.12)',
                      border: '1px solid rgba(239,68,68,0.35)',
                      borderRadius: 10, fontSize: 13, color: '#fecaca',
                    }}>
                      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="gc-btn-primary"
                    style={{
                      background: '#fff', color: '#0a1628',
                      alignSelf: 'flex-start', marginTop: 4,
                    }}
                  >
                    <Send size={15} />
                    Send message
                  </button>
                </form>
              )}
            </div>
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
            <Car size={16} color="rgba(255,255,255,0.3)" />
            <span className="gc-display" style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>Carfix-Connect</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            <button onClick={() => router.push('/about')}   style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}>About</button>
            <button onClick={() => router.push('/contact')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}>Contact</button>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            © {new Date().getFullYear()} Carfix-Connect. Built for Kenyan roads.
          </p>
        </footer>
      </div>
    </>
  )
}