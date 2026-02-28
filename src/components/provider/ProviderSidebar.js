'use client'

import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, Calendar, Users, Package, FileText, 
  BarChart3, Settings, Store, Bell, LogOut 
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ProviderSidebar({ provider }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const navigation = [
    { name: 'Dashboard', href: '/provider/dashboard', icon: LayoutDashboard },
    { name: 'Bookings', href: '/provider/bookings', icon: Calendar },
    { name: 'My Shops', href: '/provider/shops', icon: Store },
    { name: 'Team Members', href: '/provider/team', icon: Users },
    { name: 'Inventory', href: '/provider/inventory', icon: Package },
    { name: 'Work Orders', href: '/provider/work-orders', icon: FileText },
    { name: 'Analytics', href: '/provider/analytics', icon: BarChart3 },
    { name: 'Notifications', href: '/provider/notifications', icon: Bell },
    { name: 'Settings', href: '/provider/settings', icon: Settings },
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
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Store className="text-white" size={24} />
              </div>
              <div className="ml-3">
                <h2 className="text-lg font-bold text-gray-900">
                  {provider?.name || 'Provider'}
                </h2>
                <p className="text-xs text-gray-500 capitalize">
                  {provider?.status || 'Active'}
                </p>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          {provider?.status === 'pending_verification' && (
            <div className="mx-4 mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800 font-medium">
                ⏳ Verification Pending
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Your application is under review
              </p>
            </div>
          )}

          {provider?.status === 'active' && provider?.is_verified && (
            <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <p className="text-xs text-green-800 font-medium">
                ✓ Verified Provider
              </p>
            </div>
          )}

          {/* Navigation */}
          <nav className="mt-5 flex-1 px-2 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  className={`
                    w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors
                    ${isActive
                      ? 'bg-green-100 text-green-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon
                    className={`mr-3 flex-shrink-0 h-5 w-5 ${
                      isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-500'
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
