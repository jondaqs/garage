// src/components/PublicNav.jsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowRight, Menu, X, Download, Sun, Moon } from 'lucide-react'
import Image from 'next/image'

const NAV_LINKS = [
  { label: 'About Us', path: '/about' },
  { label: 'Pricing',  path: '/pricing' },
  { label: 'How It Works',     path: '/how-it-works' },
  { label: 'Contact Us', path: '/contact' },
]

export default function PublicNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [theme, setTheme] = useState('dark')

  // ── Theme initialization ──
  useEffect(() => {
    const saved = localStorage.getItem('gc-theme')
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    } else {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('gc-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  // ── PWA install prompt capture ──
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    setIsStandalone(standalone)

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstallable(false)
      setDeferredPrompt(null)
    }
  }

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const isActive = (path) => pathname === path

  return (
    <>
      <style>{`
        .pn-nav {
          position: relative; z-index: 50;
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border);
          backdrop-filter: blur(12px);
          background: var(--nav-bg);
        }
        @media (min-width: 640px) {
          .pn-nav { padding: 20px 48px; }
        }

        .pn-logo {
          display: flex; align-items: center; gap: 10px;
          background: none; border: none; cursor: pointer; padding: 0;
        }
        .pn-logo-icon { width: 48px; height: 48px; flex-shrink: 0; }
        .pn-logo-icon img { width: 100%; height: 100%; object-fit: contain; }
        .pn-logo-text {
          font-size: 20px; font-weight: 800; color: var(--text-primary);
          letter-spacing: -0.02em;
        }
        @media (min-width: 640px) {
          .pn-logo-icon { width: 56px; height: 56px; }
          .pn-logo-text { font-size: 22px; }
        }

        .pn-desktop-links { display: none; align-items: center; gap: 8px; }
        @media (min-width: 768px) { .pn-desktop-links { display: flex; } }

        .pn-link {
          background: transparent; color: var(--text-secondary);
          border: none; padding: 10px 16px; border-radius: 8px;
          font-size: 14px; font-weight: 500; cursor: pointer;
          transition: all 0.2s ease;
        }
        .pn-link:hover { background: var(--hover-bg); color: var(--text-primary); }
        .pn-link-active { background: var(--hover-bg); color: var(--text-primary); }

        .pn-signin {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--accent-teal); color: var(--brand-dark);
          border: none;
          padding: 10px 20px; border-radius: 10px;
          font-size: 14px; font-weight: 700; cursor: pointer;
          transition: all 0.2s ease; margin-left: 4px;
          box-shadow: 0 0 20px var(--accent-teal-glow);
        }
        .pn-signin:hover { opacity: 0.9; transform: translateY(-1px); }

        .pn-install-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--accent-purple-bg); color: var(--accent-purple);
          border: 1px solid var(--accent-purple-border);
          padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease;
        }
        .pn-install-btn:hover { opacity: 0.85; }

        /* ── Theme toggle ── */
        .pn-theme-toggle {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 10px;
          background: var(--surface); border: 1px solid var(--border);
          cursor: pointer; color: var(--text-secondary);
          transition: all 0.2s ease;
        }
        .pn-theme-toggle:hover {
          background: var(--hover-bg); color: var(--accent-teal);
          border-color: var(--accent-teal);
        }

        /* ── Hamburger ── */
        .pn-hamburger {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 10px;
          background: var(--surface); border: 1px solid var(--border);
          cursor: pointer; color: var(--text-primary); transition: all 0.2s ease;
        }
        .pn-hamburger:hover { background: var(--hover-bg); }
        @media (min-width: 768px) { .pn-hamburger { display: none; } }

        /* ── Mobile overlay ── */
        .pn-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
        }
        .pn-overlay.open { opacity: 1; pointer-events: auto; }

        /* ── Mobile drawer ── */
        .pn-drawer {
          position: fixed; top: 0; right: 0; bottom: 0;
          z-index: 101; width: 280px; max-width: 85vw;
          background: var(--brand-dark); border-left: 1px solid var(--border);
          display: flex; flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .pn-drawer.open { transform: translateX(0); }

        .pn-drawer-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border-bottom: 1px solid var(--border);
        }
        .pn-drawer-close {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 8px;
          background: var(--surface); border: none;
          cursor: pointer; color: var(--text-primary); transition: all 0.2s ease;
        }
        .pn-drawer-close:hover { background: var(--hover-bg); }

        .pn-drawer-links {
          flex: 1; display: flex; flex-direction: column; padding: 12px;
        }
        .pn-drawer-link {
          display: flex; align-items: center; gap: 10px;
          background: transparent; color: var(--text-secondary);
          border: none; padding: 14px 16px; border-radius: 10px;
          font-size: 16px; font-weight: 500; cursor: pointer;
          transition: all 0.15s ease; text-align: left; width: 100%;
        }
        .pn-drawer-link:hover { background: var(--hover-bg); color: var(--text-primary); }
        .pn-drawer-link-active { background: var(--hover-bg); color: var(--text-primary); font-weight: 600; }

        .pn-drawer-footer {
          padding: 16px; border-top: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 10px;
        }
        .pn-drawer-signin {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: var(--accent-teal); color: var(--brand-dark);
          border: none;
          padding: 14px 0; border-radius: 10px;
          font-size: 15px; font-weight: 700; cursor: pointer;
          transition: all 0.2s ease; width: 100%;
        }
        .pn-drawer-signin:hover { opacity: 0.9; }

        .pn-drawer-install {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: var(--accent-purple-bg); color: var(--accent-purple);
          border: 1px solid var(--accent-purple-border);
          padding: 12px 0; border-radius: 10px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease; width: 100%;
        }
        .pn-drawer-install:hover { opacity: 0.85; }

        .pn-drawer-theme {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: var(--surface); color: var(--text-secondary);
          border: 1px solid var(--border);
          padding: 12px 0; border-radius: 10px;
          font-size: 14px; font-weight: 500; cursor: pointer;
          transition: all 0.2s ease; width: 100%;
        }
        .pn-drawer-theme:hover { color: var(--accent-teal); border-color: var(--accent-teal); }
      `}</style>

      <nav className="pn-nav">
        <button className="pn-logo" onClick={() => router.push('/')}>
          <div className="pn-logo-icon">
            <Image src="/logo.png" alt="Carfix-Connect" width={56} height={56} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="gc-display pn-logo-text">Carfix-Connect</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.04em', marginTop: -2 }}>
              Drive Confident. Stay Connected to Expert Care.
            </span>
          </div>
        </button>

        <div className="pn-desktop-links">
          {NAV_LINKS.map(n => (
            <button
              key={n.path}
              onClick={() => router.push(n.path)}
              className={`pn-link ${isActive(n.path) ? 'pn-link-active' : ''}`}
            >
              {n.label}
            </button>
          ))}
          {isInstallable && !isStandalone && (
            <button onClick={handleInstall} className="pn-install-btn">
              <Download size={14} /> Install App
            </button>
          )}
          <button onClick={toggleTheme} className="pn-theme-toggle" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button onClick={() => router.push('/auth/login')} className="pn-signin">
            Sign In <ArrowRight size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="md-hidden-flex">
          <button onClick={toggleTheme} className="pn-theme-toggle" style={{ display: 'flex' }}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="pn-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
        </div>
      </nav>

      <div className={`pn-overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />

      <div className={`pn-drawer ${mobileOpen ? 'open' : ''}`}>
        <div className="pn-drawer-header">
          <button className="pn-logo" onClick={() => router.push('/')} style={{ gap: 8 }}>
            <div className="pn-logo-icon" style={{ width: 44, height: 44 }}>
              <Image src="/logo.png" alt="Carfix-Connect" width={44} height={44} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="gc-display" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>Carfix-Connect</span>
              <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.04em', marginTop: -1 }}>
                Drive Confident. Stay Connected to Expert Care.
              </span>
            </div>
          </button>
          <button className="pn-drawer-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <div className="pn-drawer-links">
          <button
            onClick={() => router.push('/')}
            className={`pn-drawer-link ${pathname === '/' ? 'pn-drawer-link-active' : ''}`}
          >
            Home
          </button>
          {NAV_LINKS.map(n => (
            <button
              key={n.path}
              onClick={() => router.push(n.path)}
              className={`pn-drawer-link ${isActive(n.path) ? 'pn-drawer-link-active' : ''}`}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="pn-drawer-footer">
          <button onClick={toggleTheme} className="pn-drawer-theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          {isInstallable && !isStandalone && (
            <button onClick={handleInstall} className="pn-drawer-install">
              <Download size={16} /> Install App
            </button>
          )}
          <button onClick={() => router.push('/auth/login')} className="pn-drawer-signin">
            Sign In <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  )
}