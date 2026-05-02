'use client'

import {
  Car, User, Plus, Calendar, CalendarDays, History, Bell,
  Settings, LogOut, Menu, X, Users, Building2,
  Truck, DollarSign, BarChart3, ChevronDown, ChevronRight,
  AlertCircle, Wrench,
  ClipboardList} from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

export default function Sidebar({ user }) {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [remindersCount, setRemindersCount] = useState(0)

  useEffect(() => {
    loadRemindersCount()
  }, [])

  const loadRemindersCount = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', authUser.id).single()
      if (!profile) return
      const { count } = await supabase
        .from('reminders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_active', true)
      setRemindersCount(count || 0)
    } catch {}
  }

  const [mobileOpen,      setMobileOpen]      = useState(false)
  const [companyMembership, setCompanyMembership] = useState(null)   // { id, name, status, is_admin, staff_role }
  const [companyNavOpen,  setCompanyNavOpen]  = useState(true)       // expanded by default
  const [membershipLoading, setMembershipLoading] = useState(true)
  const [mechanicMemberships, setMechanicMemberships] = useState([]) // [{ providerId, providerName, role, can_approve_work, can_manage_inventory }]
  const [providerNavOpen, setProviderNavOpen] = useState({})         // { [providerId]: bool }

  // ── Fetch company membership once on mount ────────────────────────────────
  useEffect(() => {
    if (!user) return
    fetchMembership()
  }, [user])

  // Re-fetch when invitation is accepted (event dispatched from my-teams page)
  useEffect(() => {
    const handler = () => { if (user) fetchMembership() }
    window.addEventListener('spu-membership-updated', handler)
    return () => window.removeEventListener('spu-membership-updated', handler)
  }, [user])

  const fetchMembership = async () => {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) return

      // Single query: company_users joined with company_profiles
      // Covers members added via invitation (respond-invitation route) or auto-accept trigger
      const { data: membership } = await supabase
        .from('company_users')
        .select(`
          is_admin,
          staff_role,
          is_active,
          can_approve_work, can_manage_team, can_manage_fleet,
          can_approve_estimates, can_approve_checkout, can_approve_payment,
          company:company_profiles(id, name, status)
        `)
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (membership?.company) {
        setCompanyMembership({
          id:                   membership.company.id,
          name:                 membership.company.name,
          status:               membership.company.status,
          is_admin:             membership.is_admin,
          staff_role:           membership.staff_role,
          can_approve_work:     !!membership.can_approve_work,
          can_manage_team:      !!membership.can_manage_team,
          can_manage_fleet:     !!membership.can_manage_fleet,
          can_approve_estimates:!!membership.can_approve_estimates,
          can_approve_checkout: !!membership.can_approve_checkout,
          can_approve_payment:  !!membership.can_approve_payment,
        })
        // Auto-open company section if we're already on a company page
        if (pathname.includes('/dashboard/company/')) {
          setCompanyNavOpen(true)
        }
      }
    } catch (err) {
      console.error('Sidebar membership fetch error:', err)
    } finally {
      setMembershipLoading(false)
    }

    // ── Fetch mechanic (service provider team) memberships ─────────────────
    try {
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      if (!profile) return

      // 1. Fetch service_provider_users (all roles)
      const { data: spuRows, error: spuErr } = await supabase
        .from('service_provider_users')
        .select('id, role, service_provider_id, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice, service_provider:service_providers(id, name)')
        .eq('user_id', profile.id)
        .eq('is_active', true)

      if (spuErr) {
        console.error('SPU fetch error:', spuErr)
      }

      if (spuRows?.length) {
        // 2. Fetch mechanic records for this user separately
        const providerIds = spuRows.map(r => r.service_provider_id)
        const { data: mechRows } = await supabase
          .from('mechanics')
          .select('id, service_provider_id, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .in('service_provider_id', providerIds)

        // Index mechanic rows by provider_id for O(1) lookup
        const mechByProvider = {}
        ;(mechRows || []).forEach(m => { mechByProvider[m.service_provider_id] = m })

        setMechanicMemberships(spuRows.map(m => {
          const mech = mechByProvider[m.service_provider_id] || null
          return {
            spuId:               m.id,
            mechanicId:          mech?.id || null,
            providerId:          m.service_provider?.id || m.service_provider_id,
            providerName:        m.service_provider?.name || 'Unknown Garage',
            role:                m.role || 'mechanic',
            // Merge SPU + mechanic permissions — either source grants the badge
            can_approve_work:    !!(m.can_approve_work    || mech?.can_approve_work),
            can_manage_inventory:!!(m.can_manage_inventory || mech?.can_manage_inventory),
            can_manage_team:     !!(m.can_manage_team     || mech?.can_manage_team),
            can_send_estimates:  !!(m.can_send_estimates  || mech?.can_send_estimates),
            can_send_invoice:    !!(m.can_send_invoice),
          }
        }))

        // Auto-open if already on my-teams path
        if (pathname.includes('/dashboard/my-teams')) {
          const openState = {}
          spuRows.forEach(m => { openState[m.service_provider?.id || m.service_provider_id] = true })
          setProviderNavOpen(openState)
        }
      }
    } catch (err) {
      console.error('Sidebar mechanic fetch error:', err)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  // ── Personal nav items ────────────────────────────────────────────────────
  const personalItems = [
    { icon: User,        label: 'Dashboard',   path: '/dashboard' },
    { icon: Plus,        label: 'Add Vehicle', path: '/dashboard/vehicles/add' },
    { icon: Calendar,    label: 'Bookings',    path: '/dashboard/bookings' },
    { icon: ClipboardList, label: 'My Work Orders',path: '/dashboard/work-orders' },
    { icon: Bell,          label: 'Reminders',    path: '/dashboard/reminders',
      badge: remindersCount > 0 ? remindersCount : null },
    { icon: CalendarDays,label: 'Calendar',    path: '/dashboard/calendar' },
    { icon: History,     label: 'History',     path: '/dashboard/history' },
    { icon: Settings,    label: 'Profile',     path: '/dashboard/profile' },
  ]

  // ── Company nav items (gated by role) ─────────────────────────────────────
  const companyNavItems = (membership) => {
    if (!membership) return []
    const base = `/dashboard/company/${membership.id}`
    const items = [
      { icon: Building2,    label: 'Overview',    path: base,                       everyone: true  },
      { icon: Truck,        label: 'Fleet',       path: `${base}/fleet`,            everyone: true  },
      { icon: Calendar,     label: 'Bookings',    path: `${base}/bookings`,         everyone: true  },
      { icon: ClipboardList,label: 'Work Orders', path: `${base}/work-orders`,      everyone: true  },
      { icon: CalendarDays, label: 'Calendar',    path: `${base}/calendar`,         everyone: true  },
      { icon: Users,        label: 'Team',        path: `${base}/team`,             everyone: true  },
      { icon: DollarSign,   label: 'Budget',      path: `${base}/budget`,           everyone: false }, // admin only
      { icon: BarChart3,    label: 'Reports',     path: `${base}/reports`,          everyone: false }, // admin only
    ]
    // Filter out admin-only items for non-admins
    return items.filter(item => item.everyone || membership.is_admin)
  }

  // ── Provider (mechanic) nav items ────────────────────────────────────────
  const providerNavItems = (m) => [
    { icon: Building2,     label: 'Overview',              path: `/dashboard/my-teams/provider/${m.providerId}`  },
    { icon: Users,         label: 'My Teams',              path: '/dashboard/my-teams'                           },
    { icon: ClipboardList, label: 'Assigned Work Orders',  path: '/dashboard/my-teams/work-orders'               },
  ]

  // ── Status config ─────────────────────────────────────────────────────────
  const statusBadge = (status) => {
    const map = {
      active:               { dot: 'bg-green-500',  text: 'text-green-700',  label: 'Active'        },
      pending_verification: { dot: 'bg-yellow-500', text: 'text-yellow-700', label: 'Pending Review' },
      pending_info:         { dot: 'bg-orange-500', text: 'text-orange-700', label: 'Info Required'  },
      rejected:             { dot: 'bg-red-500',    text: 'text-red-700',    label: 'Rejected'       },
      suspended:            { dot: 'bg-gray-400',   text: 'text-gray-600',   label: 'Suspended'      },
    }
    return map[status] ?? map.suspended
  }

  // ── Nav item component ────────────────────────────────────────────────────
  const NavItem = ({ item, compact = false }) => {
    const Icon = item.icon
    const isActive = pathname === item.path ||
      (item.path !== '/dashboard' && pathname.startsWith(item.path + '/'))

    return (
      <button
        onClick={() => { router.push(item.path); setMobileOpen(false) }}
        className={`w-full flex items-center rounded-lg transition mb-0.5
          ${compact ? 'px-3 py-2 text-sm' : 'px-4 py-3'}
          ${isActive
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
          }`}
      >
        <Icon className="mr-3 flex-shrink-0" size={compact ? 16 : 20} />
        <span className={`flex-1 text-left ${compact ? 'font-medium text-sm' : 'font-medium'}`}>
          {item.label}
        </span>
        {item.badge && (
          <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs font-bold text-white bg-green-500 rounded-full">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </button>
    )
  }

  // ── Sidebar inner content (shared between desktop + mobile) ────────────────
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center">
          <Car className="text-blue-600 mr-2" size={32} />
          <h1 className="text-2xl font-bold text-gray-800">GariCare</h1>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">

        {/* ── Personal section ── */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
          Personal
        </p>
        {personalItems.map(item => (
          <NavItem key={item.path} item={item} compact />
        ))}

        {/* ── Company section — only for members ── */}
        {!membershipLoading && companyMembership && (
          <div className="mt-5">
            {/* Section header — collapsible */}
            <button
              onClick={() => setCompanyNavOpen(o => !o)}
              className="w-full flex items-center justify-between px-1 mb-2 group"
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                My Company
              </p>
              {companyNavOpen
                ? <ChevronDown size={14} className="text-gray-400" />
                : <ChevronRight size={14} className="text-gray-400" />
              }
            </button>

            {companyNavOpen && (
              <>
                {/* Company identity card */}
                <div className="mx-1 mb-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Building2 size={14} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
                        {companyMembership.name}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusBadge(companyMembership.status).dot}`} />
                        <span className={`text-[10px] font-medium ${statusBadge(companyMembership.status).text}`}>
                          {statusBadge(companyMembership.status).label}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 capitalize">
                        {companyMembership.staff_role}
                        {companyMembership.is_admin ? ' · Admin' : ''}
                      </p>
                      {/* Permission badges */}
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {companyMembership.can_approve_work && (
                          <span className="text-[10px] px-1 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold" title="Can approve work orders">WO</span>
                        )}
                        {companyMembership.can_approve_estimates && (
                          <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-700 rounded font-semibold" title="Can approve estimates">EST</span>
                        )}
                        {companyMembership.can_approve_payment && (
                          <span className="text-[10px] px-1 py-0.5 bg-green-100 text-green-700 rounded font-semibold" title="Can approve payments">PAY</span>
                        )}
                        {companyMembership.can_manage_fleet && (
                          <span className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold" title="Can manage fleet">FLEET</span>
                        )}
                        {companyMembership.can_manage_team && (
                          <span className="text-[10px] px-1 py-0.5 bg-orange-100 text-orange-700 rounded font-semibold" title="Can manage team">TEAM</span>
                        )}
                        {companyMembership.can_approve_checkout && (
                          <span className="text-[10px] px-1 py-0.5 bg-teal-100 text-teal-700 rounded font-semibold" title="Can approve checkout">CHKOUT</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status warning for inactive company */}
                {companyMembership.status !== 'active' && (
                  <div className="mx-1 mb-2 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 flex items-start gap-2">
                    <AlertCircle size={13} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-yellow-700 leading-snug">
                      Company access is limited until verified.
                    </p>
                  </div>
                )}

                {/* Company nav items */}
                {companyNavItems(companyMembership).map(item => (
                  <NavItem key={item.path} item={item} compact />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Service Provider Membership — only for mechanics ── */}
        {!membershipLoading && mechanicMemberships.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
              Service Provider Membership
            </p>

            {/* One collapsible block per provider */}
            {mechanicMemberships.map(m => {
              const isOpen = providerNavOpen[m.providerId] ?? false
              return (
                <div key={m.providerId} className="mb-2">
                  {/* Provider toggle */}
                  <button
                    onClick={() => setProviderNavOpen(prev => ({ ...prev, [m.providerId]: !isOpen }))}
                    className="w-full flex items-center justify-between px-1 mb-1 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 bg-green-600 rounded-md flex items-center justify-center flex-shrink-0">
                        <Wrench size={12} className="text-white" />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 truncate leading-tight">
                        {m.providerName}
                      </span>
                    </div>
                    {isOpen
                      ? <ChevronDown  size={13} className="text-gray-400 flex-shrink-0" />
                      : <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />
                    }
                  </button>

                  {isOpen && (
                    <>
                      {/* Role + permissions chip */}
                      <div className="mx-1 mb-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                        <p className="text-[10px] text-gray-500 capitalize">{m.role?.replace(/_/g,' ')}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {m.can_approve_work     && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">WO access</span>}
                          {m.can_send_estimates   && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">Estimates</span>}
                          {m.can_manage_inventory && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Inventory</span>}
                          {m.can_manage_team      && <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">Team</span>}
                        </div>
                      </div>

                      {/* Overview is provider-specific */}
                      <NavItem key={`${m.providerId}-overview`} compact item={{
                        icon:  Building2,
                        label: 'Overview',
                        path:  `/dashboard/my-teams/provider/${m.providerId}`,
                      }} />
                    </>
                  )}
                </div>
              )
            })}

            {/* Shared pages — shown once regardless of how many providers */}
            <div className="mt-1 border-t border-gray-100 pt-2">
              <NavItem compact item={{
                icon:  Users,
                label: 'My Teams',
                path:  '/dashboard/my-teams',
              }} />
              <NavItem compact item={{
                icon:  ClipboardList,
                label: 'Assigned Work Orders',
                path:  '/dashboard/my-teams/work-orders',
              }} />
            </div>
          </div>
        )}
      </nav>

      {/* Logout */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition"
        >
          <LogOut className="mr-3" size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-lg"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 w-64 h-screen bg-white border-r border-gray-200 z-40
        flex flex-col
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  )
}