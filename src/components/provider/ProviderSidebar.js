// → Drop this file at: src/components/provider/ProviderSidebar.js
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import {
  LayoutDashboard, Calendar, Users, Package, FileText,
  BarChart3, Settings, Store, LogOut, Menu, X, MessageSquare,
  Search, Building2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ProviderSidebar({ provider }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const [mobileOpen,    setMobileOpen]    = useState(false)
  const [activeWoCount, setActiveWoCount] = useState(0)
  const [unreadChats,   setUnreadChats]   = useState(0)
  const [unreadPeer,    setUnreadPeer]    = useState(0)

  // Close on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // ── Customer-chat unread (existing behaviour) ──
  // Sum provider_unread_count across this provider's open customer conversations.
  const loadUnreadChats = useCallback(async () => {
    try {
      if (!provider?.id) return
      const { data } = await supabase
        .from('conversations')
        .select('provider_unread_count')
        .eq('service_provider_id', provider.id)
        .eq('status', 'open')
      const total = (data || []).reduce((s, c) => s + (c.provider_unread_count || 0), 0)
      setUnreadChats(total)
    } catch {}
  }, [provider?.id])

  // ── Peer-chat unread ──
  // Two queries — one for conversations where we are the initiator (use
  // initiator_unread_count), one where we are the recipient (use
  // recipient_unread_count). Sum both.
  const loadUnreadPeer = useCallback(async () => {
    try {
      if (!provider?.id) return
      const [{ data: asInit }, { data: asRecip }] = await Promise.all([
        supabase
          .from('peer_conversations')
          .select('initiator_unread_count')
          .eq('initiator_provider_id', provider.id)
          .eq('status', 'open'),
        supabase
          .from('peer_conversations')
          .select('recipient_unread_count')
          .eq('recipient_provider_id', provider.id)
          .eq('status', 'open'),
      ])
      const t1 = (asInit  || []).reduce((s, c) => s + (c.initiator_unread_count || 0), 0)
      const t2 = (asRecip || []).reduce((s, c) => s + (c.recipient_unread_count || 0), 0)
      setUnreadPeer(t1 + t2)
    } catch {}
  }, [provider?.id])

  // ── Initial load + realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!provider?.id) return
    loadActiveWoCount(provider.id)
    loadUnreadChats()
    loadUnreadPeer()

    const convChannel = supabase
      .channel(`prov-sidebar-convs-${provider.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `service_provider_id=eq.${provider.id}`,
      }, () => loadUnreadChats())
      .subscribe()

    const peerInitChannel = supabase
      .channel(`prov-sidebar-peer-init-${provider.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'peer_conversations',
        filter: `initiator_provider_id=eq.${provider.id}`,
      }, () => loadUnreadPeer())
      .subscribe()

    const peerRecipChannel = supabase
      .channel(`prov-sidebar-peer-recip-${provider.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'peer_conversations',
        filter: `recipient_provider_id=eq.${provider.id}`,
      }, () => loadUnreadPeer())
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(peerInitChannel)
      supabase.removeChannel(peerRecipChannel)
    }
  }, [provider?.id, loadUnreadChats, loadUnreadPeer])

  const loadActiveWoCount = async (providerId) => {
    try {
      const { data: statuses } = await supabase
        .from('work_order_statuses').select('id')
        .not('code', 'in', '(completed,cancelled,closed)')
      const ids = statuses?.map(s => s.id) || []
      if (ids.length === 0) return

      const { count } = await supabase
        .from('work_orders').select('id', { count: 'exact', head: true })
        .eq('service_provider_id', providerId)
        .in('status_id', ids)
      setActiveWoCount(count || 0)
    } catch {}
  }

  const navigation = [
    { name: 'Dashboard',        href: '/provider/dashboard',   icon: LayoutDashboard },
    { name: 'Bookings',         href: '/provider/bookings',    icon: Calendar        },
    { name: 'Work Orders',      href: '/provider/work-orders', icon: FileText,
      badge: activeWoCount > 0 ? activeWoCount : null },
    { name: 'Chat',             href: '/provider/chat',        icon: MessageSquare,
      badge: unreadChats > 0 ? unreadChats : null },
    { name: 'Search Providers', href: '/provider/providers',   icon: Search          },
    { name: 'Provider Chats',   href: '/provider/peer-chat',   icon: Building2,
      badge: unreadPeer > 0 ? unreadPeer : null },
    { name: 'My Shops',         href: '/provider/shops',       icon: Store           },
    { name: 'Team Members',     href: '/provider/team',        icon: Users           },
    { name: 'Inventory',        href: '/provider/inventory',   icon: Package         },
    { name: 'Analytics',        href: '/provider/analytics',   icon: BarChart3       },
    { name: 'Settings',         href: '/provider/settings',    icon: Settings        },
  ]

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/')

  // ── Sidebar inner content ──────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-gray-200 overflow-y-auto">

      {/* Logo */}
      <div className="flex items-center flex-shrink-0 px-4 pt-5 pb-4">
        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
          <Store className="text-white" size={22} />
        </div>
        <div className="ml-3 min-w-0">
          <h2 className="text-base font-bold text-gray-900 truncate max-w-[130px]">
            {provider?.name || 'Provider'}
          </h2>
          <p className="text-xs text-gray-500 capitalize">{provider?.status || 'Active'}</p>
        </div>
        <button onClick={() => setMobileOpen(false)}
          className="ml-auto lg:hidden p-1 text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      {/* Status badges */}
      {provider?.status === 'pending_verification' && (
        <div className="mx-4 mb-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800 font-medium">⏳ Verification Pending</p>
          <p className="text-xs text-yellow-700 mt-0.5">Your application is under review</p>
        </div>
      )}
      {provider?.status === 'active' && provider?.is_verified && (
        <div className="mx-4 mb-3 bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full shrink-0" />
          <p className="text-xs text-green-800 font-medium">✓ Verified Provider</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5">
        {navigation.map((item) => {
          const Icon   = item.icon
          const active = isActive(item.href)
          return (
            <button key={item.name}
              onClick={() => { router.push(item.href); setMobileOpen(false) }}
              className={`
                w-full group flex items-center justify-between px-3 py-2.5 text-sm font-medium
                rounded-lg transition-colors
                ${active
                  ? 'bg-green-100 text-green-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <div className="flex items-center">
                <Icon className={`mr-3 flex-shrink-0 h-5 w-5 ${
                  active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-500'
                }`} />
                {item.name}
              </div>
              {item.badge && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-600 rounded-full">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4">
        <button onClick={handleSignOut}
          className="w-full group flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
          <LogOut className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
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

      {/* Sidebar — slides in on mobile, always visible on desktop */}
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