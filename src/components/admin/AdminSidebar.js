'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Users, Shield, Settings,
  FileText, Bell, LogOut, CheckCircle, Clock,
  MailIcon, Building2, MessageCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [pendingProviders, setPendingProviders] = useState(0)
  const [pendingCompanies, setPendingCompanies] = useState(0)

  useEffect(() => {
    loadBadgeCounts()
  }, [])

  const loadBadgeCounts = async () => {
    try {
      const [{ count: providerCount }, { count: companyCount }] = await Promise.all([
        supabase
          .from('service_providers')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_verification'),
        supabase
          .from('company_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_verification')
      ])
      setPendingProviders(providerCount || 0)
      setPendingCompanies(companyCount || 0)
    } catch (error) {
      console.error('Error loading badge counts:', error)
    }
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    {
      name: 'Pending Providers',
      href: '/admin/providers',
      icon: Clock,
      badge: pendingProviders > 0 ? pendingProviders : null
    },
    { name: 'All Providers', href: '/admin/providers/all', icon: CheckCircle },
    {
      name: 'Companies',
      href: '/admin/companies',
      icon: Building2,
      badge: pendingCompanies > 0 ? pendingCompanies : null
    },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Email Queue', href: '/admin/email-queue', icon: MailIcon },
    { name: 'Admin Management', href: '/admin/admins', icon: Shield },
    { name: 'Reports', href: '/admin/reports', icon: FileText },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ]

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
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

        {/* Sign Out */}
        <div className="flex-shrink-0 flex flex-col border-t border-gray-700 p-4 space-y-1">
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