'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Users, Shield, Settings,
  FileText, Bell, LogOut, CheckCircle, Clock,
  MailIcon, Building2, MessageCircle,
  ChevronDown, ChevronRight, Car, Search,
  Calendar, ClipboardList, Wallet, History,
  ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ADMIN_ROLES, PERMISSIONS, ADMIN_ROLE_CODES, getHighestAdminRole } from '@/lib/admin/permissions'

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [pendingProviders, setPendingProviders] = useState(0)
  const [pendingCompanies, setPendingCompanies] = useState(0)
  const [adminRole, setAdminRole]               = useState(null)
  const [userPortalOpen, setUserPortalOpen]     = useState(false) // highest admin role code

  useEffect(() => {
    loadBadgeCounts()
    loadMyRole()
  }, [pathname])

  const loadMyRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id, user_roles(role:user_roles_lookup(code))')
        .eq('auth_user_id', user.id)
        .single()
      const codes = profile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
      setAdminRole(getHighestAdminRole(codes))
    } catch (err) {
      console.error('Error loading admin role:', err)
    }
  }

  const loadBadgeCounts = async () => {
    try {
      const [{ count: providerCount }, { count: companyCount }] = await Promise.all([
        supabase
          .from('service_providers_secure')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_verification'),
        supabase
          .from('company_profiles_secure')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_verification')
      ])
      setPendingProviders(providerCount || 0)
      setPendingCompanies(companyCount || 0)
    } catch (error) {
      console.error('Error loading badge counts:', error)
    }
  }

  // Permission helper
  const can = (perm) => adminRole ? (PERMISSIONS[adminRole]?.[perm] === true) : false

  // Build navigation based on permissions
  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, show: true },
    {
      name: 'Pending Providers', href: '/admin/providers', icon: Clock,
      badge: pendingProviders > 0 ? pendingProviders : null,
      show: can('manage_providers'),
    },
    { name: 'All Providers', href: '/admin/providers/all', icon: CheckCircle, show: can('manage_providers') },
    {
      name: 'Companies', href: '/admin/companies', icon: Building2,
      badge: pendingCompanies > 0 ? pendingCompanies : null,
      show: can('manage_companies'),
    },
    { name: 'Users',            href: '/admin/users',        icon: Users,          show: can('manage_users') },
    { name: 'Email Queue',      href: '/admin/email-queue',  icon: MailIcon,       show: can('view_email_queue') },
    { name: 'Admin Management', href: '/admin/admins',       icon: Shield,         show: can('manage_admins') || adminRole != null },
    { name: 'Reports',          href: '/admin/reports',      icon: FileText,       show: can('view_reports') },
    { name: 'Settings',         href: '/admin/settings',     icon: Settings,       show: can('system_settings') },
  ].filter(item => item.show)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <div className="flex flex-col flex-grow bg-gray-900 pt-5 pb-4 overflow-y-auto">

        {/* Logo */}
        <div className="flex items-center flex-shrink-0 px-4">
          <Shield className="text-blue-400 mr-2" size={32} />
          <div>
            <h2 className="text-lg font-bold text-white">GariCare Admin</h2>
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-8 flex-1 px-2 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <button
                key={item.name}
                onClick={() => router.push(item.href)}
                className={`
                  w-full group flex items-center justify-between px-2 py-2 text-sm font-medium rounded-md transition-colors
                  ${isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }
                `}
              >
                <div className="flex items-center">
                  <Icon
                    className={`mr-3 flex-shrink-0 h-5 w-5 ${
                      isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-300'
                    }`}
                  />
                  {item.name}
                </div>
                {item.badge != null && (
                  <span className="bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* User Portal — collapsible */}
        <div className="px-2 mt-2 border-t border-gray-700 pt-2">
          <button
            onClick={() => setUserPortalOpen(o => !o)}
            className="w-full flex items-center justify-between px-2 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-md hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center">
              <ExternalLink className="mr-3 flex-shrink-0 h-4 w-4 text-gray-500" />
              My Account
            </div>
            {userPortalOpen
              ? <ChevronDown size={14} className="text-gray-500" />
              : <ChevronRight size={14} className="text-gray-500" />
            }
          </button>

          {userPortalOpen && (
            <div className="ml-2 mt-1 space-y-0.5 border-l border-gray-700 pl-3">
              {[
                { icon: Car,           label: 'Dashboard',        path: '/dashboard' },
                { icon: Search,        label: 'Search Providers', path: '/dashboard/providers' },
                { icon: Calendar,      label: 'Bookings',         path: '/dashboard/bookings' },
                { icon: ClipboardList, label: 'Work Orders',      path: '/dashboard/work-orders' },
                { icon: Wallet,        label: 'Budget',           path: '/dashboard/budget' },
                { icon: History,       label: 'History',          path: '/dashboard/history' },
                { icon: Settings,      label: 'Profile',          path: '/dashboard/profile' },
              ].map(item => {
                const Icon = item.icon
                const href = `${item.path}?portal=user`
                return (
                  <button
                    key={item.path}
                    onClick={() => router.push(href)}
                    className="w-full flex items-center px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  >
                    <Icon className="mr-2.5 flex-shrink-0 h-3.5 w-3.5 text-gray-500" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Role badge + Sign Out */}
        <div className="flex-shrink-0 flex flex-col border-t border-gray-700 p-4 space-y-2">
          {adminRole && ADMIN_ROLES[adminRole] && (
            <div className="px-2 py-1.5 bg-gray-800 rounded-md">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Your role</p>
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${ADMIN_ROLES[adminRole].color}`}>
                {ADMIN_ROLES[adminRole].label}
              </span>
            </div>
          )}
          <button
            onClick={() => router.push('/admin/feedback')}
            className="w-full group block"
          >
            <div className="flex items-center">
              <MessageCircle className="inline-block h-5 w-5 text-gray-400 group-hover:text-gray-300" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-300 group-hover:text-white">
                  Feedback
                </p>
              </div>
            </div>
          </button>
          <button onClick={handleSignOut} className="flex-shrink-0 w-full group block">
            <div className="flex items-center">
              <LogOut className="inline-block h-5 w-5 text-gray-400 group-hover:text-gray-300" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-300 group-hover:text-white">
                  Sign Out
                </p>
              </div>
            </div>
          </button>
        </div>

      </div>
    </div>
  )
}