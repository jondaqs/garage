'use client'

import { Menu } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'

export default function AdminHeader({ user, avatarUrl, onToggleSidebar }) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
          >
            <Menu size={24} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <NotificationBell isAdmin={true} />

            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm overflow-hidden flex-shrink-0">
                {avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt="Admin" 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  user?.email?.charAt(0).toUpperCase()
                )}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden md:block">Admin</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}