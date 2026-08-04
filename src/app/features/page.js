// src/app/features/page.js
'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import PublicNav from '@/components/PublicNav'
import {
  User, Building2, Wrench, Car, Calendar, ClipboardList,
  MessageSquare, Bell, DollarSign, BarChart3, Search, Truck,
  Users, Package, Store, CreditCard, Megaphone, Shield, Lock,
  ArrowRight, CheckCircle, MapPin, Zap, Sparkles, LifeBuoy
} from 'lucide-react'

/* ─── Feature card ─── */
const FeatureCard = ({ icon: Icon, title, desc, accent }) => (
  <div className="rounded-xl p-5 transition-all duration-200 hover:translate-y-[-2px]"
    style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
    <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
      style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}>
      <Icon size={18} style={{ color: accent }} />
    </div>
    <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{title}</h3>
    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
  </div>
)

/* ─── Section heading ─── */
const SectionHeading = ({ icon: Icon, label, title, subtitle, accent }) => (
  <div className="text-center mb-10">
    <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-4"
      style={{ background: `${accent}12`, border: `1px solid ${accent}25` }}>
      <Icon size={13} style={{ color: accent }} />
      <span className="text-xs font-medium tracking-wide" style={{ color: accent }}>{label}</span>
    </div>
    <h2 className="gc-display text-2xl md:text-3xl font-bold tracking-tight mb-3"
      style={{ color: 'var(--text-primary)' }}>{title}</h2>
    {subtitle && (
      <p className="text-sm max-w-lg mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
    )}
  </div>
)

/* ─── Stat pill ─── */
const Stat = ({ value, label }) => (
  <div className="text-center px-5">
    <p className="gc-display text-2xl font-bold" style={{ color: 'var(--accent-teal)' }}>{value}</p>
    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
  </div>
)

export default function FeaturesPage() {
  const router = useRouter()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        .gc-root { font-family: 'DM Sans', sans-serif; }
        .gc-display { font-family: 'Syne', sans-serif; }
      `}</style>

      <div className="gc-root" style={{ minHeight: '100vh', background: 'var(--hero-gradient)' }}>
        <PublicNav />

        {/* ════════ HERO ════════ */}
        <div className="text-center py-20 px-6" style={{ position: 'relative', zIndex: 1 }}>
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6"
            style={{ background: 'var(--role-teal-bg)', border: '1px solid var(--role-teal-border)' }}>
            <Sparkles size={13} style={{ color: 'var(--accent-teal)' }} />
            <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Platform Features</span>
          </div>
          <h1 className="gc-display text-4xl md:text-5xl font-extrabold tracking-tight mb-4"
            style={{ color: 'var(--text-primary)' }}>
            Everything you need to manage vehicle services
          </h1>
          <p className="text-lg max-w-xl mx-auto leading-relaxed mb-8"
            style={{ color: 'var(--text-secondary)' }}>
            Whether you own one car or manage a fleet of hundreds, Carfix-Connect gives you the tools to book, track, and pay for services — all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => router.push('/auth/signup?type=normal')}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 transition"
              style={{ color: 'var(--text-primary)' }}>
              Get Started Free <ArrowRight size={16} />
            </button>
            <button onClick={() => router.push('/how-it-works')}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition"
              style={{ background: 'var(--surface-btn)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              See How It Works
            </button>
          </div>
        </div>

        {/* ════════ CONTENT ════════ */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20" style={{ position: 'relative', zIndex: 1 }}>

          {/* ──── FOR VEHICLE OWNERS ──── */}
          <section className="mb-20">
            <SectionHeading
              icon={User} label="For Vehicle Owners" accent="#3b82f6"
              title="Take control of your car care"
              subtitle="Find trusted garages, book appointments, track every service, and never miss a maintenance reminder."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon={Search} accent="#3b82f6" title="Find Verified Providers"
                desc="Search garages, workshops, and mobile mechanics near you. Filter by services, ratings, and verification status." />
              <FeatureCard icon={Calendar} accent="#3b82f6" title="Easy Booking"
                desc="Pick your vehicle, choose a service, select a date and time — done. Track your booking from confirmation to completion." />
              <FeatureCard icon={ClipboardList} accent="#3b82f6" title="Live Work Order Tracking"
                desc="See exactly what's happening with your car. Review estimates, approve work, and accept checkout when your vehicle is ready." />
              <FeatureCard icon={MessageSquare} accent="#3b82f6" title="Direct Messaging"
                desc="Chat with your service provider in real time. Ask questions, share photos, and stay in the loop on your repair." />
              <FeatureCard icon={Bell} accent="#3b82f6" title="Smart Reminders"
                desc="Get notified when your next service is due — based on mileage, time, or mechanic recommendations from your last visit." />
              <FeatureCard icon={DollarSign} accent="#3b82f6" title="Budget Tracking"
                desc="Set monthly spending limits and track costs across all your vehicles. Know exactly what you're spending on car maintenance." />
              <FeatureCard icon={Megaphone} accent="#3b82f6" title="Service Requests"
                desc="Broadcast what you need and let providers compete for your business. Compare quotes and choose the best offer." />
              <FeatureCard icon={BarChart3} accent="#3b82f6" title="Reports & History"
                desc="Full service history for every vehicle — every job, every part, every cost — plus spending reports over time." />
              <FeatureCard icon={Car} accent="#3b82f6" title="Multi-Vehicle Support"
                desc="Manage all your cars from one dashboard. Add vehicles with plate validation, track each one independently." />
            </div>
          </section>

          {/* ──── FOR COMPANIES ──── */}
          <section className="mb-20">
            <SectionHeading
              icon={Building2} label="For Companies & Fleets" accent="#8b5cf6"
              title="Fleet management made simple"
              subtitle="Centralise vehicle care for your entire organisation. Assign vehicles, control budgets, and keep every team member accountable."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon={Truck} accent="#8b5cf6" title="Fleet Dashboard"
                desc="Add and manage all company vehicles in one place. Full details, service history, and assignment tracking per vehicle." />
              <FeatureCard icon={Users} accent="#8b5cf6" title="Team & Permissions"
                desc="Invite team members and assign granular permissions — who can approve work, manage fleet, handle payments, and chat with providers." />
              <FeatureCard icon={Calendar} accent="#8b5cf6" title="Unified Bookings"
                desc="Book services for any fleet vehicle and view all company bookings in a shared calendar. Filter by vehicle, status, or date." />
              <FeatureCard icon={ClipboardList} accent="#8b5cf6" title="Approval Workflows"
                desc="Estimates, work orders, checkouts, and payments all flow through configurable approval chains. Nothing slips through." />
              <FeatureCard icon={DollarSign} accent="#8b5cf6" title="Fleet Budgets"
                desc="Set company-wide budgets with multi-currency support. Spending updates automatically as payments are recorded." />
              <FeatureCard icon={BarChart3} accent="#8b5cf6" title="Fleet Analytics"
                desc="Spending by vehicle, service frequency, and utilisation reports. Understand your fleet's total cost of ownership." />
            </div>
          </section>

          {/* ──── FOR SERVICE PROVIDERS ──── */}
          <section className="mb-20">
            <SectionHeading
              icon={Wrench} label="For Service Providers" accent="#10b981"
              title="Run your garage, digitally"
              subtitle="Manage bookings, work orders, inventory, staff, and revenue — everything a modern workshop needs to grow."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard icon={Store} accent="#10b981" title="Shop Management"
                desc="Manage multiple locations with addresses, operating hours, and contact details. Get a verified badge that builds customer trust." />
              <FeatureCard icon={Calendar} accent="#10b981" title="Booking Management"
                desc="Confirm, reschedule, or decline appointments. Create bookings for walk-ins. Assign mechanics to each job." />
              <FeatureCard icon={ClipboardList} accent="#10b981" title="Work Order System"
                desc="Full lifecycle management — diagnostics, estimates, parts, mechanic assignment, quality checks, invoicing, and checkout." />
              <FeatureCard icon={Users} accent="#10b981" title="Team Roles"
                desc="Add mechanics and staff with role-based access. Owners, admins, managers, and mechanics each see what they need." />
              <FeatureCard icon={Package} accent="#10b981" title="Inventory Tracking"
                desc="Track parts with SKU, stock levels, and pricing. Low-stock alerts keep you ahead of demand." />
              <FeatureCard icon={DollarSign} accent="#10b981" title="Revenue & Invoicing"
                desc="Generate invoices, track payments, and monitor revenue trends. Filter by period and currency." />
              <FeatureCard icon={MessageSquare} accent="#10b981" title="Customer & Provider Chat"
                desc="Separate chat channels for customers and peer providers. Coordinate referrals, source parts, and stay connected." />
              <FeatureCard icon={Megaphone} accent="#10b981" title="Service Marketplace"
                desc="Respond to service broadcasts from vehicle owners. Submit competitive quotes and win new business." />
              <FeatureCard icon={BarChart3} accent="#10b981" title="Business Analytics"
                desc="Work order volume, service distribution, mechanic performance, and booking trends — all in one place." />
            </div>
          </section>

          {/* ──── PLATFORM-WIDE ──── */}
          <section className="mb-20">
            <SectionHeading
              icon={Shield} label="Built-In" accent="#ef4444"
              title="Security, support, and trust"
              subtitle="Every account is protected by enterprise-grade security, and help is always a few taps away."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FeatureCard icon={Shield} accent="#ef4444" title="Data Encryption"
                desc="Personal information is encrypted at rest. Only you and people you authorise can access your records." />
              <FeatureCard icon={Lock} accent="#ef4444" title="Two-Factor Auth"
                desc="Optional TOTP-based MFA using any standard authenticator app. An extra layer of protection for your account." />
              <FeatureCard icon={LifeBuoy} accent="#06b6d4" title="Support Tickets"
                desc="Submit tickets from any portal. Priority is based on your subscription tier for faster resolution." />
              <FeatureCard icon={CreditCard} accent="#f59e0b" title="Flexible Subscriptions"
                desc="Free trial to start. Monthly, quarterly, or annual plans with discounts for longer commitments." />
            </div>
          </section>

          {/* ──── CTA ──── */}
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
            <h3 className="gc-display text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Ready to get started?</h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Join Carfix-Connect today and experience a smarter way to manage vehicle services.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => router.push('/auth/signup?type=normal')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 transition"
                style={{ color: 'var(--text-primary)' }}>
                <User size={16} /> Sign Up Free
              </button>
              <button onClick={() => router.push('/auth/company-signup')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                style={{ background: 'var(--surface-btn)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <Building2 size={16} /> Register Company
              </button>
              <button onClick={() => router.push('/auth/provider-signup')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                style={{ background: 'var(--surface-btn)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                <Wrench size={16} /> Register as Provider
              </button>
            </div>
          </div>

        </div>

        {/* ════════ FOOTER ════════ */}
        <footer style={{
          position: 'relative', zIndex: 1, borderTop: '1px solid var(--border)',
          padding: '24px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain', opacity: 0.5 }} />
            <span className="gc-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--footer-name)' }}>Carfix-Connect</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: 'var(--footer-link)' }}>
            {[
              { l: 'About', p: '/about' },
              { l: 'Features', p: '/features' },
              { l: 'How It Works', p: '/how-it-works' },
              { l: 'Get Started', p: '/auth/signup' },
              { l: 'Contact', p: '/contact' },
            ].map(link => (
              <button key={link.l} onClick={() => router.push(link.p)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--footer-link)'}
              >{link.l}</button>
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