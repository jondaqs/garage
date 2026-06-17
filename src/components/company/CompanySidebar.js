// → Drop this file at: src/components/company/CompanySidebar.js
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Home, Truck, Users, Calendar, CalendarDays, ClipboardList,
  BarChart3, DollarSign, LogOut, Building2, AlertCircle,
  Bell, Menu, X, Search, MessageSquare, MessageCircle, UserCheck, CreditCard, LifeBuoy, Megaphone
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function CompanySidebar({ company, userRole }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const [mobileOpen,           setMobileOpen]           = useState(false)
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  const [recommendationsCount, setRecommendationsCount] = useState(0)
  const [unreadMessages,       setUnreadMessages]       = useState(0)

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const loadUnreadMessages = useCallback(async () => {
    try {
      if (!company?.id) return
      // /company/chat is the company-scoped chat surface for the owner —
      // it filters conversations by company_id and tracks company_unread_count.
      // The sidebar badge must mirror that, otherwise the counts diverge.
      const { data: convs } = await supabase
        .from('conversations')
        .select('company_unread_count')
        .eq('company_id', company.id)
        .eq('status', 'open')
      const total = (convs || []).reduce((s, c) => s + (c.company_unread_count || 0), 0)
      setUnreadMessages(total)
    } catch {}
  }, [company?.id])

  // ── Initial load + realtime ──────────────────────────────────────────────
  // Without realtime here, the badge stayed stale until the page was reloaded;
  // a new message would arrive, the page state would update, but the sidebar
  // counter would still show the old number from mount time.
  useEffect(() => {
    if (!company?.id) return
    loadPendingCount(company.id)
    loadRecommendationsCount(company.id)
    loadUnreadMessages()

    const convChannel = supabase
      .channel(`co-sidebar-convs-${company.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `company_id=eq.${company.id}`,
      }, () => loadUnreadMessages())
      .subscribe()

    return () => { supabase.removeChannel(convChannel) }
  }, [company?.id, loadUnreadMessages])

  const loadPendingCount = async (companyId) => {
    try {
      const { data: fleet } = await supabase
        .from('vehicle_ownership').select('vehicle_id').eq('owner_company_id', companyId)
      const vehicleIds = fleet?.map(f => f.vehicle_id) || []
      if (vehicleIds.length === 0) return

      const { data: statuses } = await supabase
        .from('work_order_statuses').select('id').eq('code', 'awaiting_approval')
      const statusId = statuses?.[0]?.id
      if (!statusId) return

      const { count } = await supabase
        .from('work_orders_secure').select('id', { count: 'exact', head: true })
        .in('vehicle_id', vehicleIds).eq('status_id', statusId)
      setPendingApprovalCount(count || 0)
    } catch {}
  }

  const loadRecommendationsCount = async (companyId) => {
    try {
      const { data: fleet } = await supabase
        .from('vehicle_ownership').select('vehicle_id').eq('owner_company_id', companyId)
      const vehicleIds = fleet?.map(f => f.vehicle_id) || []
      if (vehicleIds.length === 0) return

      const { count } = await supabase
        .from('maintenance_recommendations').select('id', { count: 'exact', head: true })
        .in('vehicle_id', vehicleIds).eq('is_acknowledged', false)
      setRecommendationsCount(count || 0)
    } catch {}
  }

  const navigation = [
    { name: 'Dashboard',         href: '/company/dashboard',   icon: Home         },
    { name: 'Fleet',             href: '/company/fleet',              icon: Truck        },
    { name: 'Fleet Assignments', href: '/company/fleet-assignments',  icon: UserCheck    },
    { name: 'Team',              href: '/company/team',               icon: Users        },
    { name: 'Bookings',          href: '/company/bookings',     icon: Calendar     },
    { name: 'Calendar',          href: '/company/calendar',     icon: CalendarDays },
    { name: 'Work Orders',       href: '/company/work-orders',  icon: ClipboardList,
      badge: pendingApprovalCount > 0 ? pendingApprovalCount : null },
    { name: 'Search Providers',  href: '/company/providers',    icon: Search       },
    { name: 'Chat',              href: '/company/chat',         icon: MessageSquare,
      badge: unreadMessages > 0 ? unreadMessages : null },
    { name: 'Reminders',         href: '/company/reminders',   icon: Bell,
      badge: recommendationsCount > 0 ? recommendationsCount : null },
    { name: 'Budget',            href: '/company/budget',       icon: DollarSign   },
    { name: 'Reports',           href: '/company/reports',      icon: BarChart3    },
    { name: 'Subscription', href: '/company/subscription', icon: CreditCard },
  ]

  const showInfoAlert = company?.status === 'pending_info'

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const statusConfig = {
    active:               { label: 'Active',         dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50  border-green-200'  },
    pending_verification: { label: 'Pending Review', dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
    pending_info:         { label: 'Info Required',  dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
    rejected:             { label: 'Rejected',       dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50    border-red-200'    },
    suspended:            { label: 'Suspended',      dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50   border-gray-200'   },
  }
  const statusCfg = company?.status ? statusConfig[company.status] : null
  const isActive  = (href) => pathname === href || pathname.startsWith(href + '/')
  const activeItemRef = useRef(null)

  // Scroll the active nav item into view when the route changes
  useEffect(() => {
    const t = setTimeout(() => {
      activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(t)
  }, [pathname])

  // ── Sidebar inner content ──────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 overflow-y-auto">

      {/* Logo */}
      <div className="flex items-center flex-shrink-0 px-4 pt-5 pb-2">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <Building2 className="text-white w-5 h-5" />
        </div>
        <div className="ml-3 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{company?.name || 'GariCare'}</p>
          <p className="text-xs text-gray-500">Company Portal</p>
        </div>
        {/* Close button (mobile only) */}
        <button onClick={() => setMobileOpen(false)}
          className="ml-auto lg:hidden p-1 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      {/* Status badge */}
      {statusCfg && company?.status !== 'active' && (
        <div className={`mx-4 mt-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{statusCfg.label}
        </div>
      )}
      {statusCfg && company?.status === 'active' && (
        <div className="mx-4 mt-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="text-xs font-medium text-green-700">Verified &amp; Active</span>
        </div>
      )}

      {/* Role badge */}
      {userRole && userRole.staff_role !== 'owner' && (
        <div className="mx-4 mt-1 px-3 py-1">
          <span className="text-xs text-gray-400 capitalize">
            {userRole.staff_role}{userRole.is_admin ? ' · Admin' : ''}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="mt-4 flex-1 px-3 space-y-0.5">
        {showInfoAlert && (
          <button onClick={() => { router.push('/company/pending-info'); setMobileOpen(false) }}
            className="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors mb-1">
            <AlertCircle className="mr-3 h-4 w-4 text-orange-500 shrink-0 animate-pulse" />
            Action Required
          </button>
        )}
        {navigation.map((item) => {
          const Icon   = item.icon
          const active = isActive(item.href)
          return (
            <button key={item.name}
              ref={active ? activeItemRef : null}
              onClick={() => { router.push(item.href); setMobileOpen(false) }}
              className={`
                w-full group flex items-center justify-between px-3 py-2.5 text-sm font-medium
                rounded-lg transition-colors
                ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
              `}
            >
              <div className="flex items-center">
                <Icon className={`mr-3 flex-shrink-0 h-4.5 w-4.5 ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'}`} size={18} />
                {item.name}
              </div>
              {item.badge && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-yellow-500 rounded-full">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4">
        <button
          onClick={() => { router.push('/company/feedback'); setMobileOpen(false) }}
          className="w-full group flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors mb-1">
          <MessageCircle className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
          Feedback
        </button>
        <button
          onClick={() => { router.push('/company/support'); setMobileOpen(false) }}
          className="w-full group flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors mb-1">
          <LifeBuoy className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
          Support
        </button>
        <button
          onClick={() => { router.push('/company/service-requests'); setMobileOpen(false) }}
          className="w-full group flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors mb-1">
          <Megaphone className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
          Service Requests
        </button>
        <button onClick={handleSignOut}
          className="w-full group flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
          <LogOut className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3.5 left-4 z-50 bg-white p-2 rounded-lg shadow-md border border-gray-200"
        aria-label="Open menu"
      >
        <Menu size={20} className="text-gray-600" />
      </button>

      {/* Sidebar — slides in on mobile, fixed on desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64
        transform transition-transform duration-300 ease-in-out
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