// src/components/company/CompanyHeader.js
'use client'

import { Search, Menu, Bell } from 'lucide-react'
import { useState } from 'react'

export default function CompanyHeader({ user, company, userRole }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  return (
    <header className="bg-white shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Mobile menu button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
          >
            <Menu size={24} />
          </button>

          {/* Search */}
          <div className="flex-1 flex justify-center px-2 lg:ml-6 lg:justify-start">
            <div className="max-w-lg w-full">
              <label htmlFor="search" className="sr-only">Search</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="search"
                  name="search"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Search vehicles, team members, bookings..."
                  type="search"
                />
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="ml-4 flex items-center md:ml-6 gap-3">
            {/* Budget indicator for admins */}
            {userRole?.is_admin && company?.budget_limit && (
              <div className="hidden md:block">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Monthly Budget</p>
                  <p className="text-sm font-semibold text-gray-900">
                    KES {parseFloat(company.budget_limit).toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            {/* Notifications */}
            <button className="p-2 rounded-full text-gray-400 hover:text-gray-500 hover:bg-gray-100 relative">
              <Bell size={20} />
              <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white"></span>
            </button>

            {/* Profile */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-700">
                    {user?.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {userRole?.staff_role?.replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Approval Required Notice */}
        {company?.approval_required && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <p className="text-xs text-blue-800">
                <strong>Approval Mode:</strong> All bookings require admin approval before confirmation
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-200 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {/* Mobile navigation would go here */}
            <p className="px-3 py-2 text-sm text-gray-500">Mobile menu items</p>
          </div>
        </div>
      )}
    </header>
  )
}