// → Drop this file at: src/components/Sidebar.js
'use client'

import {
  Car, User, Plus, Calendar, CalendarDays, History, Bell,
  Settings, LogOut, Menu, X, Users, Building2,
  Truck, DollarSign, BarChart3, ChevronDown, ChevronRight,
  AlertCircle, Wrench, ClipboardList, Search, MessageSquare
} from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback } from 'react'

export default function Sidebar({ user }) {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  // ── All state declared up front ──────────────────────────────────────────
  // The useEffect blocks below reference some of this state in their dependency
  // arrays. Because const declarations are NOT hoisted (TDZ), they MUST be
  // declared before any useEffect that names them, or the first render will
  // throw a ReferenceError.
  const [remindersCount, setRemindersCount] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [profileId,      setProfileId]      = useState(null)
  const [mobileOpen,      setMobileOpen]      = useState(false)
  const [companyMembership, setCompanyMembership] = useState(null)   // { id, name, status, is_admin, staff_role }
  const [companyNavOpen,  setCompanyNavOpen]  = useState(true)       // expanded by default
  const [membershipLoading, setMembershipLoading] = useState(true)
  const [mechanicMemberships, setMechanicMemberships] = useState([]) // [{ providerId, providerName, role, can_approve_work, can_manage_inventory, can_chat }]
  const [providerNavOpen, setProviderNavOpen] = useState({})         // { [providerId]: bool }
  const [providerUnreadByProviderId, setProviderUnreadByProviderId] = useState({}) // { [providerId]: number } — customer chat unread
  const [providerPeerUnreadByProviderId, setProviderPeerUnreadByProviderId] = useState({}) // { [providerId]: number } — peer chat unread (provider-to-provider)
  const [companyUnread, setCompanyUnread] = useState(0)
  // Phase: per-provider upcoming-bookings count for the Calendar badge.
  // Keyed by providerId: { '<uuid>': <count>, ... }
  const [providerUpcomingByProvider, setProviderUpcomingByProvider] = useState({})

  // ── Resolve profile once on mount; share across loaders ─────────────────
  useEffect(() => {
    const resolve = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', authUser.id).single()
      if (profile) setProfileId(profile.id)
    }
    resolve()
  }, [])

  // ── Loaders (now keyed off profileId) ───────────────────────────────────
  const loadUnreadMessages = useCallback(async () => {
    if (!profileId) return
    try {
      const { data: convs } = await supabase
        .from('conversations')
        .select('user_unread_count')
        .eq('user_id', profileId)
        .is('company_id', null)
        .eq('status', 'open')
      const total = (convs || []).reduce((s, c) => s + (c.user_unread_count || 0), 0)
      setUnreadMessages(total)
    } catch {}
  }, [profileId])

  const loadRemindersCount = useCallback(async () => {
    if (!profileId) return
    try {
      const { count } = await supabase
        .from('reminders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profileId)
        .eq('is_active', true)
      setRemindersCount(count || 0)
    } catch {}
  }, [profileId])

  // ── Reload + realtime: fire when profile id becomes known ───────────────
  useEffect(() => {
    if (!profileId) return
    loadUnreadMessages()
    loadRemindersCount()

    // Subscribe to conversation changes so the message badge updates live.
    // Filter is on user_id (personal chats only — matches loadUnreadMessages
    // scope, which excludes company chats).
    const convChannel = supabase
      .channel(`sidebar-convs-${profileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `user_id=eq.${profileId}`,
      }, () => loadUnreadMessages())
      .subscribe()

    // Reminders change less often, but we still want them fresh — listen on
    // INSERT/UPDATE/DELETE keyed on the user.
    const remindChannel = supabase
      .channel(`sidebar-reminders-${profileId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reminders',
        filter: `user_id=eq.${profileId}`,
      }, () => loadRemindersCount())
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(remindChannel)
    }
  }, [profileId, loadUnreadMessages, loadRemindersCount])

  // ── Per-provider unread chat counts (Service Provider Membership) ───────
  // For each provider this user has can_chat on, sum provider_unread_count
  // across that provider's open conversations and stash by providerId. The
  // sidebar Chat row for each provider then renders its own badge.
  useEffect(() => {
    const chattableProviders = mechanicMemberships.filter(m => m.can_chat)
    if (chattableProviders.length === 0) {
      setProviderUnreadByProviderId({})
      return
    }

    const loadOne = async (providerId) => {
      const { data } = await supabase
        .from('conversations')
        .select('provider_unread_count')
        .eq('service_provider_id', providerId)
        .eq('status', 'open')
      const total = (data || []).reduce((s, c) => s + (c.provider_unread_count || 0), 0)
      setProviderUnreadByProviderId(prev => ({ ...prev, [providerId]: total }))
    }

    // Initial loads
    chattableProviders.forEach(m => loadOne(m.providerId))

    // One realtime channel per provider — postgres-changes filters don't
    // support IN(), so we subscribe per id. The channel triggers the loader
    // for just that provider on any conversation change.
    const channels = chattableProviders.map(m => {
      return supabase
        .channel(`sidebar-spu-convs-${m.providerId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'conversations',
          filter: `service_provider_id=eq.${m.providerId}`,
        }, () => loadOne(m.providerId))
        .subscribe()
    })

    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  // We intentionally only depend on the list of chattable provider IDs (as a
  // stable string), not the entire mechanicMemberships array, so unrelated
  // re-renders don't tear the channels down.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanicMemberships.filter(m => m.can_chat).map(m => m.providerId).sort().join(',')])

  // ── Per-provider PEER unread (Provider Chats — provider-to-provider) ────
  // Each chat-able membership gets its own peer-chat inbox at
  //   /dashboard/my-teams/provider/<providerId>/peer-chat
  // and a matching badge in the sidebar. Two filtered queries per provider —
  // one where we're the initiator, one where we're the recipient — summed
  // into a single counter. Realtime: two channels per provider matching the
  // filtered queries.
  useEffect(() => {
    const chattableProviders = mechanicMemberships.filter(m => m.can_chat)
    if (chattableProviders.length === 0) {
      setProviderPeerUnreadByProviderId({})
      return
    }

    const loadOne = async (providerId) => {
      const [{ data: asInit }, { data: asRecip }] = await Promise.all([
        supabase
          .from('peer_conversations')
          .select('initiator_unread_count')
          .eq('initiator_provider_id', providerId)
          .eq('status', 'open'),
        supabase
          .from('peer_conversations')
          .select('recipient_unread_count')
          .eq('recipient_provider_id', providerId)
          .eq('status', 'open'),
      ])
      const t1 = (asInit  || []).reduce((s, c) => s + (c.initiator_unread_count || 0), 0)
      const t2 = (asRecip || []).reduce((s, c) => s + (c.recipient_unread_count || 0), 0)
      setProviderPeerUnreadByProviderId(prev => ({ ...prev, [providerId]: t1 + t2 }))
    }

    chattableProviders.forEach(m => loadOne(m.providerId))

    const channels = []
    chattableProviders.forEach(m => {
      channels.push(
        supabase
          .channel(`sidebar-peer-init-${m.providerId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'peer_conversations',
            filter: `initiator_provider_id=eq.${m.providerId}`,
          }, () => loadOne(m.providerId))
          .subscribe(),
        supabase
          .channel(`sidebar-peer-recip-${m.providerId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'peer_conversations',
            filter: `recipient_provider_id=eq.${m.providerId}`,
          }, () => loadOne(m.providerId))
          .subscribe()
      )
    })

    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanicMemberships.filter(m => m.can_chat).map(m => m.providerId).sort().join(',')])

  // ── Company unread chat count (My Company section) ──────────────────────
  // Same pattern as the per-provider counts above, but there's only ever one
  // company per user so we keep it as a scalar.
  useEffect(() => {
    const id = companyMembership?.id
    if (!id) { setCompanyUnread(0); return }

    const load = async () => {
      const { data } = await supabase
        .from('conversations')
        .select('company_unread_count')
        .eq('company_id', id)
        .eq('status', 'open')
      const total = (data || []).reduce((s, c) => s + (c.company_unread_count || 0), 0)
      setCompanyUnread(total)
    }
    load()

    const channel = supabase
      .channel(`sidebar-company-convs-${id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `company_id=eq.${id}`,
      }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [companyMembership?.id])

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
          can_approve_estimates, can_approve_checkout, can_approve_payment, can_chat,
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
          can_chat:             !!membership.can_chat,
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
        .select('id, role, service_provider_id, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice, can_chat, service_provider:service_providers(id, name)')
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
          .select('id, role, service_provider_id, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice, can_chat')
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
            // If a mechanic record exists, the user is also on the floor as a mechanic.
            // Surface its role separately when it differs from the SPU role (e.g. SPU=manager, mech=senior_mechanic).
            mechanicRole:        mech?.role || null,
            hasMechanicRecord:   !!mech,
            // Merge SPU + mechanic permissions — either source grants the badge
            can_approve_work:    !!(m.can_approve_work     || mech?.can_approve_work),
            can_manage_inventory:!!(m.can_manage_inventory || mech?.can_manage_inventory),
            can_manage_team:     !!(m.can_manage_team      || mech?.can_manage_team),
            can_send_estimates:  !!(m.can_send_estimates   || mech?.can_send_estimates),
            can_send_invoice:    !!(m.can_send_invoice     || mech?.can_send_invoice),
            can_chat:            !!(m.can_chat             || mech?.can_chat),
          }
        }))

        // ── Per-provider upcoming-bookings counts (next 7 days, non-terminal) ──
        // Drives the badge next to each per-provider "Calendar" entry.
        try {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const in7 = new Date(today)
          in7.setDate(in7.getDate() + 7)
          const todayStr = today.toISOString().slice(0, 10)
          const in7Str   = in7.toISOString().slice(0, 10)
          const { data: liveStatuses } = await supabase
            .from('booking_statuses').select('id, code')
            .in('code', ['pending', 'confirmed', 'in_progress'])
          const liveIds = (liveStatuses || []).map(s => s.id)

          if (liveIds.length > 0 && providerIds.length > 0) {
            // Bookings RLS already permits service_provider_users to read their
            // provider's bookings, so this single query is enough.
            const { data: upBookings } = await supabase
              .from('bookings')
              .select('id, service_provider_id')
              .in('service_provider_id', providerIds)
              .in('status_id', liveIds)
              .gte('booking_date', todayStr)
              .lte('booking_date', in7Str)

            const counts = {}
            ;(upBookings || []).forEach(b => {
              counts[b.service_provider_id] = (counts[b.service_provider_id] || 0) + 1
            })
            setProviderUpcomingByProvider(counts)
          }
        } catch (e) {
          console.error('Sidebar member upcoming-count fetch error:', e)
        }

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
    { icon: User,          label: 'Dashboard',              path: '/dashboard' },
    { icon: Plus,          label: 'Add Vehicle',            path: '/dashboard/vehicles/add' },
    { icon: Search,        label: 'Search Providers',       path: '/dashboard/providers' },
    { icon: Calendar,      label: 'Bookings',               path: '/dashboard/bookings' },
    { icon: ClipboardList, label: 'My Work Orders',         path: '/dashboard/work-orders' },
    { icon: MessageSquare, label: 'Chat',                   path: '/dashboard/chat',
      badge: unreadMessages > 0 ? unreadMessages : null },
    { icon: Bell,          label: 'Reminders',              path: '/dashboard/reminders',
      badge: remindersCount > 0 ? remindersCount : null },
    { icon: CalendarDays,  label: 'Calendar',               path: '/dashboard/calendar' },
    { icon: History,       label: 'History',                path: '/dashboard/history' },
    { icon: Settings,      label: 'Profile',                path: '/dashboard/profile' },
  ]

  // ── Company nav items (gated by role) ─────────────────────────────────────
  const companyNavItems = (membership) => {
    if (!membership) return []
    const base = `/dashboard/company/${membership.id}`
    // can_chat is the gate, but admins always see it as well.
    const canChat = membership.is_admin || membership.can_chat
    const items = [
      { icon: Building2,    label: 'Overview',    path: base,                       everyone: true  },
      { icon: Truck,        label: 'Fleet',       path: `${base}/fleet`,            everyone: true  },
      { icon: Calendar,     label: 'Bookings',    path: `${base}/bookings`,         everyone: true  },
      { icon: ClipboardList,label: 'Work Orders', path: `${base}/work-orders`,      everyone: true  },
      { icon: CalendarDays, label: 'Calendar',    path: `${base}/calendar`,         everyone: true  },
      // Find Providers + Chat — both gated on can_chat (admins see them too).
      // Visually grouped: discover → message.
      ...(canChat ? [
        { icon: Search,        label: 'Find Providers', path: `${base}/providers`, everyone: true },
        { icon: MessageSquare, label: 'Chat',           path: `${base}/chat`,      everyone: true,
          badge: companyUnread > 0 ? companyUnread : null },
      ] : []),
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
  // Pretty label for a role string from service_provider_users.role / mechanics.role
  const roleLabel = (role) => {
    const map = {
      service_provider_owner: 'Owner',
      admin:                  'Admin',
      accountant:             'Accountant',
      manager:                'Manager',
      senior_mechanic:        'Senior Mechanic',
      mechanic:               'Mechanic',
    }
    if (!role) return ''
    return map[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // Color theme per role badge
  const roleBadgeClass = (role) => {
    const map = {
      service_provider_owner: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
      admin:                  'bg-rose-100   text-rose-700   border border-rose-200',
      accountant:             'bg-emerald-100 text-emerald-700 border border-emerald-200',
      manager:                'bg-sky-100    text-sky-700    border border-sky-200',
      senior_mechanic:        'bg-amber-100  text-amber-700  border border-amber-200',
      mechanic:               'bg-slate-100  text-slate-700  border border-slate-200',
    }
    return map[role] || 'bg-gray-100 text-gray-700 border border-gray-200'
  }

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

                      {/* Roles row — Admin + staff_role (free text from company_users.staff_role) */}
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-1">Roles</p>
                      <div className="flex flex-wrap gap-1">
                        {companyMembership.is_admin && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-rose-100 text-rose-700 border border-rose-200"
                            title="Company administrator"
                          >
                            Admin
                          </span>
                        )}
                        {companyMembership.staff_role && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-sky-100 text-sky-700 border border-sky-200 capitalize"
                            title={`Staff role: ${companyMembership.staff_role}`}
                          >
                            {companyMembership.staff_role.replace(/_/g, ' ')}
                          </span>
                        )}
                        {!companyMembership.is_admin && !companyMembership.staff_role && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                            title="Member"
                          >
                            Member
                          </span>
                        )}
                      </div>

                      {/* Permissions row — every truthy can_* flag from company_users */}
                      {(companyMembership.can_approve_work || companyMembership.can_approve_estimates ||
                        companyMembership.can_approve_payment || companyMembership.can_approve_checkout ||
                        companyMembership.can_manage_fleet || companyMembership.can_manage_team ||
                        companyMembership.can_chat) && (
                        <>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-1">Permissions</p>
                          <div className="flex gap-1 flex-wrap">
                            {companyMembership.can_approve_work && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded" title="Can approve work orders">
                                WO access
                              </span>
                            )}
                            {companyMembership.can_approve_estimates && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded" title="Can approve estimates">
                                Estimates
                              </span>
                            )}
                            {companyMembership.can_approve_payment && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded" title="Can approve payments">
                                Payments
                              </span>
                            )}
                            {companyMembership.can_approve_checkout && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded" title="Can approve checkout">
                                Checkout
                              </span>
                            )}
                            {companyMembership.can_manage_fleet && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded" title="Can manage fleet">
                                Fleet
                              </span>
                            )}
                            {companyMembership.can_manage_team && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded" title="Can manage team">
                                Team
                              </span>
                            )}
                            {companyMembership.can_chat && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded" title="Can chat with providers">
                                Chat
                              </span>
                            )}
                          </div>
                        </>
                      )}
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
                      {/* Roles + permissions */}
                      <div className="mx-1 mb-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                        {/* Roles row — primary SPU role + (optional) on-the-floor mechanic role */}
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Roles</p>
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${roleBadgeClass(m.role)}`}
                            title={`Service provider role: ${roleLabel(m.role)}`}
                          >
                            {roleLabel(m.role)}
                          </span>
                          {/* Show the mechanic-table role as a separate badge when it adds info
                              (e.g. SPU role is admin/manager, but the user is also a senior_mechanic on the floor) */}
                          {m.hasMechanicRecord && m.mechanicRole && m.mechanicRole !== m.role && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${roleBadgeClass(m.mechanicRole)}`}
                              title={`Also assigned as ${roleLabel(m.mechanicRole)} in the mechanics roster`}
                            >
                              {roleLabel(m.mechanicRole)}
                            </span>
                          )}
                        </div>

                        {/* Permissions row — every truthy can_* flag from SPU + mechanics */}
                        {(m.can_approve_work || m.can_send_estimates || m.can_send_invoice ||
                          m.can_manage_inventory || m.can_manage_team || m.can_chat) && (
                          <>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-1">Permissions</p>
                            <div className="flex flex-wrap gap-1">
                              {m.can_approve_work && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded" title="Can approve work orders">
                                  WO access
                                </span>
                              )}
                              {m.can_send_estimates && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded" title="Can send estimates">
                                  Estimates
                                </span>
                              )}
                              {m.can_send_invoice && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded" title="Can send invoices">
                                  Invoices
                                </span>
                              )}
                              {m.can_manage_inventory && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded" title="Can manage inventory">
                                  Inventory
                                </span>
                              )}
                              {m.can_manage_team && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded" title="Can manage team">
                                  Team
                                </span>
                              )}
                              {m.can_chat && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded" title="Can chat with customers">
                                  Chat
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Overview is provider-specific */}
                      <NavItem key={`${m.providerId}-overview`} compact item={{
                        icon:  Building2,
                        label: 'Overview',
                        path:  `/dashboard/my-teams/provider/${m.providerId}`,
                      }} />
                      {/* Calendar — provider-specific. Open to all members (read), badge
                          shows upcoming bookings in the next 7 days for THIS provider. */}
                      <NavItem key={`${m.providerId}-calendar`} compact item={{
                        icon:  CalendarDays,
                        label: 'Calendar',
                        path:  `/dashboard/my-teams/provider/${m.providerId}/calendar`,
                        badge: providerUpcomingByProvider[m.providerId] > 0
                          ? providerUpcomingByProvider[m.providerId]
                          : null,
                      }} />
                      {/* Chat for this provider lives below Assigned Work Orders
                          in the shared block — keeps the provider-membership
                          quick-look (Overview only) tight, and groups all chat
                          entry points together when a member belongs to multiple
                          providers. */}
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

              {/* Chat — one row per provider where this member has can_chat.
                  When the user belongs to a single provider, the row label is
                  just "Chat"; when they belong to several, each row is labelled
                  with the provider name so they can pick the right inbox.
                  Each row carries its own unread badge sourced from
                  providerUnreadByProviderId — bumped live by the realtime
                  subscription a few hooks above. */}
              {mechanicMemberships
                .filter(m => m.can_chat)
                .map(m => {
                  const unread     = providerUnreadByProviderId[m.providerId] || 0
                  const peerUnread = providerPeerUnreadByProviderId[m.providerId] || 0
                  const showProviderSuffix = mechanicMemberships.filter(x => x.can_chat).length > 1
                  const suffix = showProviderSuffix ? ` \u00b7 ${m.providerName || 'Provider'}` : ''
                  return (
                    <div key={`${m.providerId}-chat-group`}>
                      {/* Customer chat — existing flow */}
                      <NavItem key={`${m.providerId}-chat`} compact item={{
                        icon:  MessageSquare,
                        label: `Chat${suffix}`,
                        path:  `/dashboard/my-teams/provider/${m.providerId}/chat`,
                        badge: unread > 0 ? unread : null,
                      }} />
                      {/* Search Providers — provider marketplace, scoped to this membership */}
                      <NavItem key={`${m.providerId}-search-providers`} compact item={{
                        icon:  Search,
                        label: `Search Providers${suffix}`,
                        path:  `/dashboard/my-teams/provider/${m.providerId}/providers`,
                      }} />
                      {/* Peer chat — provider-to-provider conversations */}
                      <NavItem key={`${m.providerId}-peer-chat`} compact item={{
                        icon:  Building2,
                        label: `Provider Chats${suffix}`,
                        path:  `/dashboard/my-teams/provider/${m.providerId}/peer-chat`,
                        badge: peerUnread > 0 ? peerUnread : null,
                      }} />
                    </div>
                  )
                })
              }
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