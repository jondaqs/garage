'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import PublicNav from '@/components/PublicNav'
import {
  User, Building2, Wrench, Shield, ChevronDown, ChevronRight,
  Car, Calendar, ClipboardList, MessageSquare, Bell, History,
  DollarSign, BarChart3, Settings, Search, Truck, Users, Package,
  Store, CreditCard, Megaphone, LifeBuoy, ArrowRight, CheckCircle,
  Star, Lock, UserCheck, MapPin, FileText, Zap, ExternalLink
} from 'lucide-react'

/* ─── tiny helpers ─── */
const Section = ({ id, icon: Icon, title, accent, children }) => (
  <section id={id} className="scroll-mt-24 mb-16">
    <div className="flex items-center gap-3 mb-6">
      {Icon && (
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
          <Icon size={20} style={{ color: accent }} />
        </div>
      )}
      <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
    </div>
    <div className="space-y-4 text-[15px] leading-relaxed text-blue-100/80">
      {children}
    </div>
  </section>
)

const Feature = ({ icon: Icon, title, children }) => (
  <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition">
    <div className="flex items-start gap-3">
      {Icon && <Icon size={18} className="text-blue-300 mt-0.5 flex-shrink-0" />}
      <div>
        <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
        <p className="text-sm text-blue-100/70 leading-relaxed">{children}</p>
      </div>
    </div>
  </div>
)

const Accordion = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left bg-white/[0.03] hover:bg-white/[0.06] transition">
        <span className="font-semibold text-white text-[15px]">{title}</span>
        {open ? <ChevronDown size={16} className="text-white/50" /> : <ChevronRight size={16} className="text-white/50" />}
      </button>
      {open && <div className="px-5 py-4 text-sm text-blue-100/75 leading-relaxed border-t border-white/5">{children}</div>}
    </div>
  )
}

const StatusBadge = ({ label, color }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
    style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
    {label}
  </span>
)

const WoStep = ({ step, title, desc }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-300">{step}</div>
      <div className="flex-1 w-px bg-white/10 mt-1" />
    </div>
    <div className="pb-6">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-sm text-blue-100/65 mt-0.5">{desc}</p>
    </div>
  </div>
)

/* ─── Table of contents ─── */
const TOC_ITEMS = [
  { id: 'overview', label: 'Platform Overview' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'individual', label: 'Individual Users' },
  { id: 'company', label: 'Company Fleet' },
  { id: 'provider', label: 'Service Providers' },
  { id: 'work-orders', label: 'Work Orders' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'chat', label: 'Messaging' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'marketplace', label: 'Service Marketplace' },
  { id: 'security', label: 'Security & Privacy' },
  { id: 'support', label: 'Support' },
  { id: 'faq', label: 'FAQ' },
]

export default function DocsPage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) setActiveSection(e.target.id)
      })
    }, { rootMargin: '-20% 0px -70% 0px' })
    TOC_ITEMS.forEach(t => {
      const el = document.getElementById(t.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        .gc-root { font-family: 'DM Sans', sans-serif; }
        .gc-display { font-family: 'Syne', sans-serif; }
      `}</style>

      <div className="gc-root" style={{
        minHeight: '100vh',
        background: 'var(--hero-gradient)',
      }}>
        <PublicNav />

        {/* Hero */}
        <div className="text-center py-16 px-6" style={{ position: 'relative', zIndex: 1 }}>
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6" style={{ background: 'var(--role-teal-bg)', border: '1px solid var(--role-teal-border)' }}>
            <FileText size={13} style={{ color: 'var(--accent-teal)' }} />
            <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>Documentation</span>
          </div>
          <h1 className="gc-display text-4xl md:text-5xl font-extrabold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
            How Carfix-Connect Works
          </h1>
          <p className="text-lg max-w-lg mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Everything you need to know about managing vehicles, bookings, work orders, and teams on the platform.
          </p>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 flex gap-8" style={{ position: 'relative', zIndex: 1 }}>

          {/* Sticky sidebar TOC — desktop */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <nav className="sticky top-24 space-y-0.5">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3 px-3">On this page</p>
              {TOC_ITEMS.map(t => (
                <a key={t.id} href={`#${t.id}`}
                  className={`block px-3 py-1.5 rounded-lg text-[13px] transition ${
                    activeSection === t.id
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                  }`}>
                  {t.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">

            {/* ───────── PLATFORM OVERVIEW ───────── */}
            <Section id="overview" icon={Zap} title="Platform Overview" accent="#60a5fa">
              <p>
                Carfix-Connect is a vehicle service management platform that connects three types of users: <strong className="text-white">individual vehicle owners</strong>, <strong className="text-white">company fleet managers</strong>, and <strong className="text-white">service providers</strong> (garages, workshops, mobile mechanics). The platform handles the complete lifecycle from booking a service appointment through to invoicing and payment, with real-time communication at every step.
              </p>
              <p>
                Every account starts as an individual. From there, you can register a company to manage fleet vehicles, or register as a service provider to accept bookings and manage a workshop. A single person can hold all three roles simultaneously — for example, a garage owner who also has personal cars and manages a company fleet.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                {[
                  { icon: User, label: 'Individual', desc: 'Book services for personal vehicles', color: '#3b82f6' },
                  { icon: Building2, label: 'Company', desc: 'Manage fleet, team, and budgets', color: '#8b5cf6' },
                  { icon: Wrench, label: 'Service Provider', desc: 'Accept work and run your garage', color: '#10b981' },
                ].map(r => (
                  <div key={r.label} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 text-center">
                    <r.icon size={24} className="mx-auto mb-2" style={{ color: r.color }} />
                    <p className="text-sm font-semibold text-white">{r.label}</p>
                    <p className="text-xs text-blue-100/60 mt-1">{r.desc}</p>
                  </div>
                ))}
              </div>
            </Section>


            {/* ───────── GETTING STARTED ───────── */}
            <Section id="getting-started" icon={ArrowRight} title="Getting Started" accent="#34d399">
              <Accordion title="Signing Up as an Individual" defaultOpen>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Visit the home page and select <strong>Vehicle Owner</strong>.</li>
                  <li>Enter your name, email, phone number, and create a password.</li>
                  <li>Verify your email by clicking the confirmation link sent to your inbox.</li>
                  <li>You arrive at your personal dashboard — ready to add vehicles and search for providers.</li>
                </ol>
              </Accordion>

              <Accordion title="Registering a Company">
                <ol className="list-decimal list-inside space-y-2">
                  <li>Select <strong>Company Fleet</strong> on the home page.</li>
                  <li>Complete the multi-step registration: company details (name, registration number, tax ID, address), upload supporting documents, add your initial fleet of vehicles, and invite team members.</li>
                  <li>Your company enters <strong>Pending Verification</strong> status while admins review your submission.</li>
                  <li>If additional information is needed, your status changes to <strong>Info Required</strong> — you can update details from the company dashboard.</li>
                  <li>Once approved, your company is <strong>Active</strong> and all features unlock.</li>
                </ol>
                <div className="flex flex-wrap gap-2 mt-3">
                  <StatusBadge label="Pending Verification" color="#eab308" />
                  <StatusBadge label="Info Required" color="#f97316" />
                  <StatusBadge label="Active" color="#22c55e" />
                  <StatusBadge label="Suspended" color="#6b7280" />
                  <StatusBadge label="Rejected" color="#ef4444" />
                </div>
              </Accordion>

              <Accordion title="Registering as a Service Provider">
                <ol className="list-decimal list-inside space-y-2">
                  <li>Select <strong>Service Provider</strong> on the home page.</li>
                  <li>Complete the guided setup: choose your provider type (garage, mobile mechanic, specialist, etc.), enter business details, set up your shop locations with addresses and contact details, define which services you offer, optionally add initial inventory and mechanics.</li>
                  <li>Upload required documents (business licence, certifications).</li>
                  <li>Add banking/M-Pesa details for receiving payments.</li>
                  <li>Review and submit — your registration enters <strong>Pending Verification</strong>.</li>
                  <li>Once verified, you become searchable and can start accepting bookings.</li>
                </ol>
              </Accordion>

              <Accordion title="Two-Factor Authentication (MFA)">
                <p>
                  For extra security, any user can enable two-factor authentication from their profile settings. Once enabled, you will be prompted for a one-time code from your authenticator app each time you log in. Admins may require MFA for certain roles.
                </p>
              </Accordion>
            </Section>


            {/* ───────── INDIVIDUAL USERS ───────── */}
            <Section id="individual" icon={User} title="Individual Users" accent="#3b82f6">
              <p>
                As an individual vehicle owner, your dashboard is your central hub. Here is what each section does:
              </p>

              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <Feature icon={Car} title="Dashboard & Vehicles">
                  View all your vehicles at a glance, see upcoming bookings, active work orders, and spending summaries. Add new vehicles with Kenyan plate number validation and manage ownership.
                </Feature>
                <Feature icon={Search} title="Search Providers">
                  Find verified garages, workshops, and mobile mechanics. Filter by services offered, location, ratings, and verification status. View provider profiles with shop details, team size, and customer reviews.
                </Feature>
                <Feature icon={Calendar} title="Bookings">
                  Book appointments with service providers. Select a vehicle, choose services needed, pick a date and time slot, and optionally request a specific mechanic. Track booking status from pending through confirmation to completion.
                </Feature>
                <Feature icon={ClipboardList} title="Work Orders">
                  Monitor the progress of all active jobs. Review estimates, approve or reject proposed work, track service stages in real time, and accept checkout when work is complete. A badge shows items needing your attention.
                </Feature>
                <Feature icon={MessageSquare} title="Chat">
                  Communicate directly with service providers about your vehicles. Real-time messaging with unread counts keeps you connected. Conversations are scoped per provider.
                </Feature>
                <Feature icon={Bell} title="Reminders">
                  Receive maintenance reminders based on mileage intervals or calendar dates. Mechanics can also leave recommendations after servicing your vehicle, which appear as reminders.
                </Feature>
                <Feature icon={DollarSign} title="Budget">
                  Set monthly or custom-period budgets across your vehicles. Track spending against budget limits with visual indicators. Payments to service providers automatically update your spend tracking.
                </Feature>
                <Feature icon={History} title="Service History">
                  A complete, chronological log of all services performed on your vehicles — every work order, every part used, every mechanic who worked on your car.
                </Feature>
                <Feature icon={BarChart3} title="Reports">
                  Visual reports on spending by vehicle, by service type, and over time. Understand your total cost of ownership.
                </Feature>
                <Feature icon={Settings} title="Profile & Settings">
                  Update your personal information, change password, enable two-factor authentication, and manage notification preferences.
                </Feature>
                <Feature icon={CreditCard} title="Subscription">
                  View and manage your subscription plan. Individual users get a trial period, after which you can subscribe for continued access.
                </Feature>
                <Feature icon={Megaphone} title="Service Requests">
                  Broadcast a service need to multiple providers at once. Describe the problem and your budget range, and providers in your area can respond with quotes. Compare responses and choose the best offer.
                </Feature>
              </div>

              <div className="mt-6 bg-white/[0.04] border border-white/10 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-white mb-2">Company Membership</h4>
                <p className="text-sm text-blue-100/70">
                  If you join a company (via invitation or during company registration), a <strong className="text-white">My Company</strong> section appears in your sidebar. Depending on your assigned permissions, you can view fleet vehicles, manage bookings, approve work orders, chat with providers on behalf of the company, manage budgets, and more. Each permission (WO access, estimates, payments, checkout, fleet management, team management, and chat) is independently configurable by the company admin.
                </p>
              </div>

              <div className="mt-3 bg-white/[0.04] border border-white/10 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-white mb-2">Service Provider Team Membership</h4>
                <p className="text-sm text-blue-100/70">
                  If you are added to a service provider as a mechanic or team member, a <strong className="text-white">Service Provider Membership</strong> section appears in your sidebar. You can view assigned work orders, manage bookings, handle inventory (if permitted), chat with customers and other providers, and access analytics — all scoped to the provider you belong to. Your role (owner, admin, accountant, manager, senior mechanic, mechanic) and specific permissions are shown as badges.
                </p>
              </div>
            </Section>


            {/* ───────── COMPANY FLEET ───────── */}
            <Section id="company" icon={Building2} title="Company Fleet Management" accent="#8b5cf6">
              <p>
                Company accounts are designed for organisations that manage fleets of vehicles. The company portal gives fleet managers and team members the tools to centralise vehicle care.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <Feature icon={Truck} title="Fleet Management">
                  Add and manage all company vehicles. Each vehicle has full details (plate, make, model, year, colour, VIN) and a complete service history. Request deletion of fleet vehicles with admin approval workflow.
                </Feature>
                <Feature icon={UserCheck} title="Fleet Assignments">
                  Assign vehicles to team members. Track who is responsible for which vehicle, and manage reassignments when staff change.
                </Feature>
                <Feature icon={Users} title="Team Management">
                  Invite team members by email. Assign roles (owner, admin, accountant, manager, staff) and granular permissions: can approve work, can approve estimates, can approve checkout, can approve payment, can manage fleet, can manage team, and can chat with providers.
                </Feature>
                <Feature icon={Calendar} title="Bookings & Calendar">
                  Book services for any fleet vehicle. View all company bookings in a unified calendar. Filter by vehicle, status, or date range.
                </Feature>
                <Feature icon={ClipboardList} title="Work Orders">
                  Track all work orders across the fleet. Approve estimates, monitor progress, and accept checkouts. A badge shows pending approvals.
                </Feature>
                <Feature icon={Search} title="Find Providers & Chat">
                  Search for providers and initiate conversations on behalf of the company. Company chat is separate from personal chat, ensuring business communications stay organised.
                </Feature>
                <Feature icon={Bell} title="Reminders">
                  Fleet-wide maintenance reminders and mechanic recommendations. Stay ahead of scheduled services across all vehicles.
                </Feature>
                <Feature icon={DollarSign} title="Budget">
                  Set company-wide or per-period budgets with currency support (KES, USD, etc.). Budget spending updates automatically when payments are recorded against fleet vehicles. Accessible to admins, accountants, and members with payment approval permissions.
                </Feature>
                <Feature icon={BarChart3} title="Reports">
                  Fleet-wide analytics on spending, service frequency, and vehicle utilisation. Admin-only access.
                </Feature>
                <Feature icon={CreditCard} title="Subscription">
                  Managed by company admins and accountants. Subscription determines access level — when inactive, the company portal enters view-only mode.
                </Feature>
              </div>

              <div className="mt-4 bg-white/[0.04] border border-white/10 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-white mb-2">Verification Workflow</h4>
                <p className="text-sm text-blue-100/70">
                  After registration, a company enters <strong className="text-white">Pending Verification</strong>. Platform admins review the submitted details and documents. If anything is missing, the company is moved to <strong className="text-white">Pending Info</strong> — an "Action Required" alert appears in the sidebar prompting the owner to supply the missing information and resubmit. Once everything checks out, the company is marked <strong className="text-white">Active</strong>.
                </p>
              </div>
            </Section>


            {/* ───────── SERVICE PROVIDERS ───────── */}
            <Section id="provider" icon={Wrench} title="Service Providers" accent="#10b981">
              <p>
                Service providers (garages, workshops, mobile mechanics) have a dedicated portal with everything needed to run a vehicle service business.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <Feature icon={Store} title="Dashboard & Shops">
                  Overview of active work orders, pending bookings, revenue summaries, and low-stock alerts. Manage multiple shop locations with addresses, phone numbers, operating hours, and map coordinates.
                </Feature>
                <Feature icon={Calendar} title="Bookings">
                  View and manage incoming bookings. Confirm, reschedule, or decline appointments. Create bookings on behalf of walk-in customers. Assign mechanics to bookings. A badge shows pending bookings needing confirmation.
                </Feature>
                <Feature icon={ClipboardList} title="Work Orders">
                  The core operational tool. Create work orders from bookings or independently. Add services with cost estimates, request and track parts, assign mechanics, manage the full lifecycle from diagnostics to checkout. A badge shows active work orders.
                </Feature>
                <Feature icon={Users} title="Team Members">
                  Manage mechanics and staff. Assign roles (owner, admin, accountant, manager, senior mechanic, mechanic) with granular permissions: can approve work, can manage inventory, can manage team, can send estimates, can send invoices, and can chat.
                </Feature>
                <Feature icon={Package} title="Inventory">
                  Track spare parts with SKU, brand, category, stock levels, and pricing. Set minimum stock levels for automatic low-stock alerts. Record parts usage per work order.
                </Feature>
                <Feature icon={MessageSquare} title="Customer Chat & Provider Chats">
                  Two separate chat systems: one for communicating with customers about their vehicles, and a peer-to-peer chat for communicating with other service providers (for referrals, parts sourcing, etc.). Both show real-time unread badges.
                </Feature>
                <Feature icon={Search} title="Search Providers">
                  Discover other service providers on the platform for networking, referrals, and collaboration.
                </Feature>
                <Feature icon={BarChart3} title="Analytics">
                  Detailed business metrics: work order volume, service type distribution, mechanic performance, booking trends. Available to owners, admins, and accountants.
                </Feature>
                <Feature icon={DollarSign} title="Revenue">
                  Track invoices, receipts, and payment status. Monitor revenue over time with filtering by period and currency. Available to owners, admins, and accountants.
                </Feature>
                <Feature icon={Megaphone} title="Service Marketplace">
                  View and respond to service broadcasts posted by individuals and companies. Submit quotes and compete for work based on price, reputation, and response quality.
                </Feature>
                <Feature icon={Settings} title="Settings">
                  Update business details, manage services offered, configure booking time slots, and update contact information. Owners can submit updates that trigger re-verification.
                </Feature>
              </div>

              <div className="mt-4 bg-white/[0.04] border border-white/10 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-white mb-2">Provider Verification & Searchability</h4>
                <p className="text-sm text-blue-100/70">
                  Providers must be verified by platform admins before they become searchable. A verified provider with an active subscription (or within their trial period) appears in search results. The verification badge builds customer trust and distinguishes you from unverified listings.
                </p>
              </div>
            </Section>


            {/* ───────── WORK ORDERS ───────── */}
            <Section id="work-orders" icon={ClipboardList} title="Work Order Lifecycle" accent="#f59e0b">
              <p>
                Work orders are the heart of Carfix-Connect. They track a vehicle service job from start to finish. Here is the complete lifecycle:
              </p>

              <div className="mt-4 bg-white/[0.04] border border-white/10 rounded-xl p-6">
                <WoStep step="1" title="Vehicle Check-In" desc="The vehicle arrives at the workshop. The provider creates a work order linked to the vehicle and records initial mileage and the customer's problem description." />
                <WoStep step="2" title="Diagnostics & Service List" desc="The mechanic inspects the vehicle, identifies services needed, checks parts availability, and builds a list of work order services with estimated costs." />
                <WoStep step="3" title="Estimate & Approval" desc="The estimate is sent to the vehicle owner (or company fleet manager). The owner reviews the breakdown of services and parts, then approves, requests changes, or rejects the estimate." />
                <WoStep step="4" title="Work Begins" desc="Once approved, the work order moves to 'in progress'. Mechanics perform the repairs, use reserved parts, and update service statuses as each job is completed." />
                <WoStep step="5" title="Quality Check" desc="After all services are complete, a quality check ensures everything meets standards. If issues are found, the work loops back for rework." />
                <WoStep step="6" title="Invoice & Payment" desc="An invoice is generated showing all services, parts, taxes, and any discounts. The vehicle owner receives it and makes payment. A receipt is created and confirmed by the provider." />
                <WoStep step="7" title="Checkout & Acceptance" desc="The provider submits a checkout form with a road-test checklist and vehicle condition notes. The customer reviews the checkout, then accepts. The work order closes." />
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-400/30 flex items-center justify-center">
                      <CheckCircle size={14} className="text-green-400" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Closed</p>
                    <p className="text-sm text-blue-100/65 mt-0.5">Service records and vehicle history are updated. Maintenance recommendations may be added. The vehicle owner can leave feedback.</p>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-sm">
                <strong className="text-white">Work order statuses:</strong> Draft → Awaiting Approval → Approved → In Progress → Quality Check → Completed → Awaiting Customer Checkout → Closed. If rejected at any stage, a work order can be cancelled.
              </p>
            </Section>


            {/* ───────── BOOKINGS ───────── */}
            <Section id="bookings" icon={Calendar} title="Booking System" accent="#06b6d4">
              <p>
                The booking system lets vehicle owners (individual or company) schedule appointments with service providers.
              </p>
              <div className="space-y-3 mt-2">
                <Accordion title="How to Book a Service" defaultOpen>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Navigate to a provider profile from <strong>Search Providers</strong>.</li>
                    <li>Select a shop location, choose the services you need, and describe the problem.</li>
                    <li>Pick an available date and time slot. Optionally request a specific mechanic.</li>
                    <li>Confirm the booking — the provider receives a notification and the booking appears as <strong>Pending</strong>.</li>
                    <li>The provider confirms, reschedules, or declines the booking.</li>
                    <li>On the booking date, bring your vehicle in. The provider checks you in and may convert the booking to a work order.</li>
                  </ol>
                </Accordion>
                <Accordion title="Booking Statuses">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label="Pending" color="#eab308" />
                    <StatusBadge label="Confirmed" color="#22c55e" />
                    <StatusBadge label="In Progress" color="#3b82f6" />
                    <StatusBadge label="Completed" color="#6b7280" />
                    <StatusBadge label="Cancelled" color="#ef4444" />
                    <StatusBadge label="No Show" color="#f97316" />
                  </div>
                  <p className="mt-2">Bookings can be rescheduled or cancelled by either party before the appointment date.</p>
                </Accordion>
                <Accordion title="Provider-Created Bookings">
                  <p>
                    Service providers can also create bookings for walk-in customers or phone inquiries, selecting the customer from the platform or entering their details directly.
                  </p>
                </Accordion>
                <Accordion title="Calendar View">
                  <p>
                    All user types get a calendar view showing bookings. Providers see all their bookings colour-coded by status. Individual and company users see their personal or fleet bookings. Google Calendar sync is available.
                  </p>
                </Accordion>
              </div>
            </Section>


            {/* ───────── CHAT ───────── */}
            <Section id="chat" icon={MessageSquare} title="Messaging" accent="#8b5cf6">
              <p>
                Carfix-Connect offers three types of real-time messaging:
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mt-2">
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <MessageSquare size={20} className="text-blue-400 mb-2" />
                  <p className="text-sm font-semibold text-white">Customer ↔ Provider</p>
                  <p className="text-xs text-blue-100/60 mt-1">Vehicle owners chat with service providers about their cars. Each conversation is scoped to a provider. Unread counts update in real time.</p>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <Building2 size={20} className="text-purple-400 mb-2" />
                  <p className="text-sm font-semibold text-white">Company ↔ Provider</p>
                  <p className="text-xs text-blue-100/60 mt-1">Company team members with chat permission can message providers on behalf of the company. Company chat is tracked separately from personal conversations.</p>
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <Wrench size={20} className="text-green-400 mb-2" />
                  <p className="text-sm font-semibold text-white">Provider ↔ Provider</p>
                  <p className="text-xs text-blue-100/60 mt-1">Peer chat lets providers communicate with each other for referrals, parts sourcing, or collaboration. Separate from customer-facing chat.</p>
                </div>
              </div>
              <p className="mt-3">
                All message types support real-time delivery via Supabase Realtime, with unread badges updating live in the sidebar.
              </p>
            </Section>


            {/* ───────── SUBSCRIPTIONS ───────── */}
            <Section id="subscriptions" icon={CreditCard} title="Subscriptions & Pricing" accent="#f59e0b">
              <p>
                Carfix-Connect uses a subscription model with separate plans for individuals, companies, and service providers.
              </p>
              <div className="space-y-3 mt-2">
                <Accordion title="How Subscriptions Work" defaultOpen>
                  <p>
                    Every new account starts with a <strong>free trial period</strong>. Once the trial expires, you need an active subscription to continue using write features (creating bookings, work orders, etc.). Without an active subscription, your dashboard enters <strong>view-only mode</strong> — you can still see your data but cannot create or modify records.
                  </p>
                </Accordion>
                <Accordion title="Billing Periods & Discounts">
                  <p>
                    Plans are available in multiple billing periods: monthly, quarterly, semi-annual, annual, and tri-annual. Longer commitments come with percentage discounts automatically applied to the base monthly price.
                  </p>
                </Accordion>
                <Accordion title="Tiered Pricing">
                  <p>
                    For companies and service providers, pricing tiers are based on fleet size (vehicles), team size (staff), and monthly client volume. Each tier has a base price and optional per-extra charges for exceeding the tier&apos;s limits. The platform includes a calculator to help you find the right tier for your needs.
                  </p>
                </Accordion>
                <Accordion title="Custom Plans">
                  <p>
                    Platform admins can create custom pricing plans for specific companies or providers. These are tailored packages with a negotiated price, scoped to a specific entity and visible only to them.
                  </p>
                </Accordion>
                <Accordion title="Support Priority">
                  <p>
                    Your subscription tier determines your support ticket priority. Tri-annual subscribers get P1 (Critical) priority, annual gets P2 (High), quarterly/semi-annual get P3 (Medium), monthly gets P4 (Standard), and free/trial users get P5 (Basic).
                  </p>
                </Accordion>
              </div>
            </Section>


            {/* ───────── MARKETPLACE ───────── */}
            <Section id="marketplace" icon={Megaphone} title="Service Marketplace" accent="#ec4899">
              <p>
                The Service Marketplace is a broadcast-and-respond system that connects people who need vehicle services with providers who can deliver.
              </p>
              <div className="space-y-3 mt-2">
                <Accordion title="Posting a Service Request" defaultOpen>
                  <p>
                    From the <strong>Service Requests</strong> page, create a broadcast describing what you need: select the vehicle, describe the problem, set a budget range, choose urgency level (low, medium, high, urgent), and specify your preferred location. The request goes live and is visible to relevant providers.
                  </p>
                </Accordion>
                <Accordion title="Responding as a Provider">
                  <p>
                    Providers see open broadcasts in the <strong>Service Marketplace</strong> section of their dashboard. They can submit a response with their proposed price, estimated timeline, and a message to the customer. The broadcast poster can then compare all responses and choose the best one.
                  </p>
                </Accordion>
                <Accordion title="Broadcast Statuses">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label="Open" color="#22c55e" />
                    <StatusBadge label="In Review" color="#3b82f6" />
                    <StatusBadge label="Awarded" color="#8b5cf6" />
                    <StatusBadge label="Completed" color="#6b7280" />
                    <StatusBadge label="Cancelled" color="#ef4444" />
                    <StatusBadge label="Expired" color="#eab308" />
                  </div>
                </Accordion>
              </div>
            </Section>


            {/* ───────── SECURITY ───────── */}
            <Section id="security" icon={Shield} title="Security & Privacy" accent="#ef4444">
              <div className="grid sm:grid-cols-2 gap-3">
                <Feature icon={Shield} title="Data Protection">
                  Your personal information is encrypted and stored securely. Only you and people you explicitly authorise can access your records — no exceptions.
                </Feature>
                <Feature icon={Lock} title="Access Control">
                  Every action on the platform is verified against your role and permissions. Whether you're a vehicle owner, team member, or provider staff, you only see and do what you're meant to.
                </Feature>
                <Feature icon={Lock} title="Two-Factor Authentication">
                  Optional TOTP-based MFA adds a second layer of protection. Set it up from your profile page using any standard authenticator app.
                </Feature>
                <Feature icon={Shield} title="Continuous Monitoring">
                  We regularly review and strengthen our security measures to stay ahead of threats. Your trust is the foundation everything else is built on.
                </Feature>
              </div>
            </Section>


            {/* ───────── SUPPORT ───────── */}
            <Section id="support" icon={LifeBuoy} title="Support & Feedback" accent="#06b6d4">
              <p>
                Every user type has access to support and feedback tools from the bottom of their sidebar.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                <Feature icon={LifeBuoy} title="Support Tickets">
                  Submit support tickets from any portal. Tickets are automatically assigned a priority level based on your subscription tier. Describe your issue, select a category, and track the resolution status. Limit of 5 open tickets at a time.
                </Feature>
                <Feature icon={MessageSquare} title="Feedback">
                  Share suggestions, report bugs, or leave general feedback. Feedback is reviewed by the platform team to continuously improve the service.
                </Feature>
              </div>
            </Section>


            {/* ───────── FAQ ───────── */}
            <Section id="faq" icon={Star} title="Frequently Asked Questions" accent="#f59e0b">
              <div className="space-y-3">
                <Accordion title="Can I be a vehicle owner and a service provider at the same time?" defaultOpen>
                  <p>Yes. Every account starts as an individual. You can register a company or a service provider from that same account. Your personal dashboard stays separate from your company and provider portals, but you can switch between them from the sidebar.</p>
                </Accordion>
                <Accordion title="What happens when my trial expires?">
                  <p>Your account enters view-only mode. You can still log in and see all your data, but creating new bookings, work orders, and other write operations are disabled until you subscribe. An "Inactive" badge appears in your sidebar.</p>
                </Accordion>
                <Accordion title="How do I add a vehicle?">
                  <p>From your personal dashboard, click <strong>Add Vehicle</strong>. Enter the plate number (validated for Kenyan format), make, model, year, colour, and optional VIN. The vehicle is linked to your ownership immediately.</p>
                </Accordion>
                <Accordion title="How does the checkout process work?">
                  <p>After a service is completed and paid for, the provider submits a checkout form including a road-test checklist (engine smooth, no unusual noise, brakes responsive, etc.) and vehicle condition notes. You then review and accept the checkout, which closes the work order. If you decline, the provider can address your concerns and resubmit.</p>
                </Accordion>
                <Accordion title="Can company team members have different access levels?">
                  <p>Absolutely. Each team member can be granted or denied specific permissions: approve work orders, approve estimates, approve checkout, approve payment, manage fleet, manage team, and chat with providers. This is controlled by the company admin when inviting or editing a team member.</p>
                </Accordion>
                <Accordion title="How do maintenance reminders work?">
                  <p>There are two sources: you can set your own reminders based on mileage or calendar dates, and mechanics can leave recommendations after servicing your vehicle (e.g. "next oil change at 45,000 km"). Both types appear in your Reminders section and can trigger notifications.</p>
                </Accordion>
                <Accordion title="What currencies are supported?">
                  <p>The platform primarily operates in KES (Kenyan Shillings) but supports multiple currencies for invoicing, budgets, and subscription payments. Exchange rates are tracked within the system.</p>
                </Accordion>
                <Accordion title="Is my data safe?">
                  <p>Yes. All data is protected by row-level security policies, sensitive PII is encrypted at rest, and the platform supports two-factor authentication. Only you and explicitly authorised roles can access your records.</p>
                </Accordion>
                <Accordion title="How do I contact support?">
                  <p>Click the <strong>Support</strong> link at the bottom of your sidebar from any portal. You can also reach us from the <strong>Contact Us</strong> page accessible from the top navigation.</p>
                </Accordion>
              </div>
            </Section>


            {/* Footer CTA */}
            <div className="mt-12 bg-white/[0.06] border border-white/15 rounded-2xl p-8 text-center">
              <h3 className="gc-display text-xl font-bold text-white mb-3">Ready to get started?</h3>
              <p className="text-sm text-blue-100/70 mb-6 max-w-md mx-auto">
                Join Carfix-Connect today and experience a smarter way to manage vehicle services.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => router.push('/auth/signup?type=normal')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-500 text-white hover:bg-blue-400 transition">
                  <User size={16} /> Sign Up Free
                </button>
                <button onClick={() => router.push('/auth/company-signup')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/10 text-white border border-white/20 hover:bg-white/15 transition">
                  <Building2 size={16} /> Register Company
                </button>
                <button onClick={() => router.push('/auth/provider-signup')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/10 text-white border border-white/20 hover:bg-white/15 transition">
                  <Wrench size={16} /> Register as Provider
                </button>
              </div>
            </div>

          </main>
        </div>

        <footer className="gc-pricing-footer" style={{
          position: 'relative', zIndex: 1, borderTop: '1px solid var(--border)',
          padding: '24px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain', opacity: 0.5 }} />
            <span className="gc-display" style={{ fontSize: 14, fontWeight: 700, color: 'var(--footer-name)' }}>Carfix-Connect</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 13, color: 'var(--footer-link)' }}>
            {[{l:'About',p:'/about'},{l:'Pricing',p:'/pricing'},{l:'How It Works',p:'/docs'},{l:'Contact',p:'/contact'}].map(link => (
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