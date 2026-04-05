'use client'

import { Search, Menu } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'

export default function AdminHeader({ user }) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <button className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100">
            <Menu size={24} />
          </button>

          <div className="flex-1 flex justify-center px-2 lg:ml-6 lg:justify-start">
            <div className="max-w-lg w-full">
              <label htmlFor="admin-search" className="sr-only">Search</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="admin-search"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Search providers, users..."
                  type="search"
                />
              </div>
            </div>
          </div>

          <div className="ml-4 flex items-center gap-3">
            {/* Live notification bell — isAdmin fetches broadcast admin notifications */}
            <NotificationBell isAdmin={true} />

            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden md:block">Admin</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}