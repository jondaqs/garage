// src/components/PublicNav.jsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowRight, Menu, X, Download } from 'lucide-react'
import Image from 'next/image'

const NAV_LINKS = [
  { label: 'About Us', path: '/about' },
  { label: 'Pricing',  path: '/pricing' },
  { label: 'Contact Us', path: '/contact' },
]

export default function PublicNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  // ── PWA install prompt capture ──
  useEffect(() => {
    // Check if already installed (standalone mode)
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

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Prevent body scroll when mobile menu is open
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
          border-bottom: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(8px);
          background: rgba(255,255,255,0.03);
        }
        @media (min-width: 640px) {
          .pn-nav { padding: 20px 48px; }
        }

        .pn-logo {
          display: flex; align-items: center; gap: 10px;
          background: none; border: none; cursor: pointer; padding: 0;
        }
        .pn-logo-icon {
          width: 48px; height: 48px;
          flex-shrink: 0;
        }
        .pn-logo-icon img { width: 100%; height: 100%; object-fit: contain; }
        .pn-logo-text {
          font-size: 20px; font-weight: 800; color: #fff;
          letter-spacing: -0.02em;
        }
        @media (min-width: 640px) {
          .pn-logo-icon { width: 56px; height: 56px; }
          .pn-logo-text { font-size: 22px; }
        }

        /* ── Desktop links ── */
        .pn-desktop-links {
          display: none; align-items: center; gap: 8px;
        }
        @media (min-width: 768px) {
          .pn-desktop-links { display: flex; }
        }
        .pn-link {
          background: transparent; color: rgba(255,255,255,0.75);
          border: none; padding: 10px 16px; border-radius: 8px;
          font-size: 14px; font-weight: 500; cursor: pointer;
          transition: all 0.2s ease;
        }
        .pn-link:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .pn-link-active { background: rgba(255,255,255,0.08); color: #fff; }
        .pn-signin {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255,255,255,0.12); color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          padding: 10px 20px; border-radius: 10px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease; margin-left: 4px;
        }
        .pn-signin:hover { background: rgba(255,255,255,0.18); }

        .pn-install-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(37,99,235,0.2); color: #93c5fd;
          border: 1px solid rgba(59,130,246,0.3);
          padding: 8px 14px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease;
        }
        .pn-install-btn:hover { background: rgba(37,99,235,0.3); color: #bfdbfe; }

        /* ── Hamburger button ── */
        .pn-hamburger {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 10px;
          background: rgba(255,255,255,0.08); border: none;
          cursor: pointer; color: #fff; transition: all 0.2s ease;
        }
        .pn-hamburger:hover { background: rgba(255,255,255,0.14); }
        @media (min-width: 768px) {
          .pn-hamburger { display: none; }
        }

        /* ── Mobile overlay ── */
        .pn-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          opacity: 0; pointer-events: none;
          transition: opacity 0.25s ease;
        }
        .pn-overlay.open { opacity: 1; pointer-events: auto; }

        /* ── Mobile drawer ── */
        .pn-drawer {
          position: fixed; top: 0; right: 0; bottom: 0;
          z-index: 101; width: 280px; max-width: 85vw;
          background: #111; border-left: 1px solid rgba(255,255,255,0.1);
          display: flex; flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .pn-drawer.open { transform: translateX(0); }

        .pn-drawer-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .pn-drawer-close {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 8px;
          background: rgba(255,255,255,0.08); border: none;
          cursor: pointer; color: #fff; transition: all 0.2s ease;
        }
        .pn-drawer-close:hover { background: rgba(255,255,255,0.14); }

        .pn-drawer-links {
          flex: 1; display: flex; flex-direction: column;
          padding: 12px 12px;
        }
        .pn-drawer-link {
          display: flex; align-items: center; gap: 10px;
          background: transparent; color: rgba(255,255,255,0.7);
          border: none; padding: 14px 16px; border-radius: 10px;
          font-size: 16px; font-weight: 500; cursor: pointer;
          transition: all 0.15s ease; text-align: left; width: 100%;
        }
        .pn-drawer-link:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .pn-drawer-link-active {
          background: rgba(255,255,255,0.08); color: #fff; font-weight: 600;
        }

        .pn-drawer-footer {
          padding: 16px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex; flex-direction: column; gap: 10px;
        }
        .pn-drawer-signin {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: rgba(255,255,255,0.12); color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          padding: 14px 0; border-radius: 10px;
          font-size: 15px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease; width: 100%;
        }
        .pn-drawer-signin:hover { background: rgba(255,255,255,0.18); }

        .pn-drawer-install {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: rgba(37,99,235,0.15); color: #93c5fd;
          border: 1px solid rgba(59,130,246,0.25);
          padding: 12px 0; border-radius: 10px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease; width: 100%;
        }
        .pn-drawer-install:hover { background: rgba(37,99,235,0.25); }
      `}</style>

      <nav className="pn-nav">
        {/* Logo */}
        <button className="pn-logo" onClick={() => router.push('/')}>
          <div className="pn-logo-icon">
            <Image src="/logo.png" alt="Carfix-Connect" width={56} height={56} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span className="gc-display pn-logo-text">Carfix-Connect</span>
        </button>

        {/* Desktop links */}
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
          <button onClick={() => router.push('/auth/login')} className="pn-signin">
            Sign In <ArrowRight size={15} />
          </button>
        </div>

        {/* Hamburger (mobile only) */}
        <button className="pn-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </nav>

      {/* Mobile overlay */}
      <div className={`pn-overlay ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)} />

      {/* Mobile drawer */}
      <div className={`pn-drawer ${mobileOpen ? 'open' : ''}`}>
        <div className="pn-drawer-header">
          <button className="pn-logo" onClick={() => router.push('/')} style={{ gap: 8 }}>
            <div className="pn-logo-icon" style={{ width: 44, height: 44 }}>
              <Image src="/logo.png" alt="Carfix-Connect" width={44} height={44} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <span className="gc-display" style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>
              Carfix-Connect
            </span>
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