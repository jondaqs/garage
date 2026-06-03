// FILE LOCATION: src/components/Header.js

'use client'

import { User } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'

export default function Header({ user, avatarUrl }) {
  const userName = user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'User'

  return (
    <header className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4">
      <div className="flex items-center justify-between">
        <div className="lg:hidden" />
        
        <div className="flex items-center space-x-4 ml-auto">
          {/* Notification Bell */}
          <NotificationBell />

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-blue-100 flex-shrink-0">
              {avatarUrl ? (
                <img 
                  src={avatarUrl} 
                  alt={userName} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <User size={20} className="text-blue-600" />
              )}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-800">{userName}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}