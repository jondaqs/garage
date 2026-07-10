'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Car, Wrench, Building2, User, Calendar, History, Bell, ArrowRight, Shield, Zap } from 'lucide-react'
import PublicNav from '@/components/PublicNav'

export default function LandingPage() {
  const router = useRouter()

  const roles = [
    {
      icon: User,
      label: 'Vehicle Owner',
      sub: 'Personal',
      description: 'Book services, track maintenance history, and keep your vehicles in top shape.',
      bgGradient: 'from-blue-500/10 to-transparent hover:border-blue-500/40',
      iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
      ctaColor: 'text-blue-400',
      route: '/auth/signup?type=normal',
      pill: 'Most Popular',
    },
    {
      icon: Building2,
      label: 'Company Fleet',
      sub: 'Business',
      description: 'Centralise fleet maintenance, control budgets, and manage your entire team.',
      bgGradient: 'from-purple-500/10 to-transparent hover:border-purple-500/40',
      iconBg: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
      ctaColor: 'text-purple-400',
      route: '/auth/company-signup',
      pill: null,
    },
    {
      icon: Wrench,
      label: 'Service Provider',
      sub: 'Garage / Workshop',
      description: 'Grow your workshop, accept online bookings, and build a loyal customer base.',
      bgGradient: 'from-emerald-500/10 to-transparent hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      ctaColor: 'text-emerald-400',
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
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      
      {/* ── BACKGROUND GRAPHICS ── */}
      {/* High-fidelity CSS Grid Mesh (Replaces Canvas for cleaner performance) */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      
      {/* Ambient Radial Lighting Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-0 h-[600px] w-full max-w-7xl bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 blur-[120px] rounded-full opacity-60" />
      <div className="absolute bottom-12 left-1/4 z-0 h-[350px] w-[350px] bg-blue-500/10 blur-[100px] rounded-full" />

      {/* ── NAV ── */}
      <div className="relative z-10">
        <PublicNav />
      </div>

      {/* ── HERO SECTION ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-20 lg:pt-32 flex flex-col items-center text-center">
        
        {/* Decorative Floating Car Wireframe */}
        <div className="absolute top-12 right-10 lg:right-24 opacity-[0.03] pointer-events-none animate-[pulse_8s_ease-in-out_infinite] hidden md:block">
          <Car size={340} strokeWidth={1} />
        </div>

        {/* Dynamic Micro-Pill Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-2xl animate-fade-in mb-8">
          <Zap size={14} className="text-blue-400 fill-blue-400/20" />
          <span className="text-xs font-medium tracking-wide text-slate-300">
            The modern standard for vehicle ecosystem connections
          </span>
        </div>

        {/* Main Display Typography */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] max-w-4xl mb-6 bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          Your Vehicle. <br />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Perfectly Cared For.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed mb-16">
          Connect effortlessly with vetted workshops, scale team operations via localized fleet tools, and control maintenance pipelines securely.
        </p>

        {/* ── INTERACTIVE ROLE PORTALS ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mb-32">
          {roles.map((role) => {
            const Icon = role.icon
            return (
              <div
                key={role.label}
                onClick={() => router.push(role.route)}
                className={`group relative flex flex-col justify-between text-left p-8 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl hover:bg-gradient-to-b ${role.bgGradient} transition-all duration-300 ease-out cursor-pointer hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]`}
              >
                <div>
                  {/* Card Header & Conditional Pill */}
                  <div className="flex items-center justify-between mb-6">
                    <div className={`p-3 rounded-xl border ${role.iconBg}`}>
                      <Icon size={22} />
                    </div>
                    {role.pill && (
                      <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        {role.pill}
                      </span>
                    )}
                  </div>

                  {/* Subtitle & Title */}
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-slate-500 block mb-1">
                    {role.sub}
                  </span>
                  <h3 className="text-xl font-bold text-white mb-3 tracking-tight group-hover:text-white transition-colors">
                    {role.label}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-8">
                    {role.description}
                  </p>
                </div>

                {/* Simulated Interactive Footer Button */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800/60">
                  <span className={`text-sm font-semibold ${role.ctaColor}`}>
                    {role.cta}
                  </span>
                  <div className={`p-2 rounded-lg border ${role.iconBg} group-hover:translate-x-1 transition-transform duration-200`}>
                    <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── CORE CAPABILITIES GRID ── */}
        <div className="w-full max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-[11px] font-bold tracking-widest uppercase text-blue-500 mb-3">
              Why Carfix-Connect
            </h2>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Engineered for absolute operational clarity
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div 
                  key={f.title} 
                  className="flex flex-col text-left p-6 rounded-xl bg-slate-900/20 border border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/40 backdrop-blur-sm transition-all duration-200 group"
                >
                  <div className="p-2.5 w-fit rounded-lg bg-slate-900 border border-slate-800 text-slate-400 mb-4 group-hover:text-slate-200 transition-colors">
                    <Icon size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-200 mb-2">{f.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-12 lg:px-16 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="w-7 h-7 object-contain opacity-40 mix-blend-screen" />
          <span className="text-sm font-bold tracking-tight text-slate-400">Carfix-Connect</span>
        </div>
        
        <div className="flex items-center gap-8 text-xs font-medium text-slate-500">
          {['About', 'Pricing', 'Docs', 'Contact'].map((item) => (
            <button
              key={item}
              onClick={() => router.push(`/${item.toLowerCase()}`)}
              className="hover:text-slate-200 transition-colors"
            >
              {item}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} Carfix-Connect. Connecting Drivers to Trusted Vehicle Services.
        </p>
      </footer>
    </div>
  )
}