// src/components/company/CompanySidebar.js
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, Car, Users, Calendar, FileText, 
  BarChart3, Settings, Building2, Bell, LogOut, UserPlus 
} from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useState } from 'react'

export default function CompanySidebar({ company, userRole }) {
  const pathname = usePathname()
  const router = useRouter()
  
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  )

  const isAdmin = userRole?.is_admin

  const navigation = [
    { name: 'Dashboard', href: '/company/dashboard', icon: LayoutDashboard, adminOnly: false },
    { name: 'Fleet', href: '/company/fleet', icon: Car, adminOnly: false },
    { name: 'Team', href: '/company/team', icon: Users, adminOnly: false },
    { name: 'Bookings', href: '/company/bookings', icon: Calendar, adminOnly: false },
    { name: 'Work Orders', href: '/company/work-orders', icon: FileText, adminOnly: false },
    { name: 'Reports', href: '/company/reports', icon: BarChart3, adminOnly: isAdmin },
    { name: 'Notifications', href: '/company/notifications', icon: Bell, adminOnly: false },
    { name: 'Settings', href: '/company/settings', icon: Settings, adminOnly: isAdmin },
  ]

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 pt-5 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Building2 className="text-white" size={24} />
              </div>
              <div className="ml-3">
                <h2 className="text-lg font-bold text-gray-900">
                  {company?.name || 'Company'}
                </h2>
                <p className="text-xs text-gray-500 capitalize">
                  {userRole?.staff_role?.replace('_', ' ') || 'Member'}
                </p>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          {company?.status === 'pending_verification' && (
            <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800 font-medium">
                ⏳ Verification Pending
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Your application is under review
              </p>
            </div>
          )}

          {company?.status === 'active' && company?.is_active && (
            <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <p className="text-xs text-green-800 font-medium">
                ✓ Active Company
              </p>
            </div>
          )}

          {/* Admin Badge */}
          {isAdmin && (
            <div className="mx-4 mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center">
              <p className="text-xs text-blue-800 font-medium">
                👑 Administrator
              </p>
            </div>
          )}

          {/* Quick Actions for Admin */}
          {isAdmin && (
            <div className="mx-4 mt-4 space-y-2">
              <button
                onClick={() => router.push('/company/team/invite')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <UserPlus size={16} />
                Invite Team Member
              </button>
              <button
                onClick={() => router.push('/company/fleet/add')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                <Car size={16} />
                Add Vehicle
              </button>
            </div>
          )}

          {/* Navigation */}
          <nav className="mt-5 flex-1 px-2 space-y-1">
            {navigation.map((item) => {
              // Hide admin-only items for non-admins
              if (item.adminOnly && !isAdmin) return null

              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  className={`
                    w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors
                    ${isActive
                      ? 'bg-blue-100 text-blue-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon
                    className={`mr-3 flex-shrink-0 h-5 w-5 ${
                      isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'
                    }`}
                  />
                  {item.name}
                </button>
              )
            })}
          </nav>

          {/* Sign Out */}
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <button
              onClick={handleSignOut}
              className="flex-shrink-0 w-full group block"
            >
              <div className="flex items-center">
                <LogOut className="inline-block h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                    Sign Out
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}