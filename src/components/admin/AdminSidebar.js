'use client'

import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, Users, Shield, Settings, 
  FileText, Bell, LogOut, CheckCircle, Clock
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Pending Providers', href: '/admin/providers', icon: Clock, badge: true },
    { name: 'All Providers', href: '/admin/providers/all', icon: CheckCircle },
    { name: 'Users', href: '/admin/users', icon: Users },
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
        <div className="flex items-center flex-shrink-0 px-4">
          <Shield className="text-blue-400 mr-2" size={32} />
          <div>
            <h2 className="text-lg font-bold text-white">GariCare Admin</h2>
            <p className="text-xs text-gray-400">Admin Portal</p>
          </div>
        </div>

        <nav className="mt-8 flex-1 px-2 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            
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
                  <Icon className={`mr-3 flex-shrink-0 h-5 w-5 ${
                    isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-300'
                  }`} />
                  {item.name}
                </div>
                {item.badge && (
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    New
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex-shrink-0 flex border-t border-gray-700 p-4">
          <button onClick={handleSignOut} className="flex-shrink-0 w-full group block">
            <div className="flex items-center">
              <LogOut className="inline-block h-5 w-5 text-gray-400 group-hover:text-gray-300" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-300 group-hover:text-white">Sign Out</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
