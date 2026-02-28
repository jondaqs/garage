'use client'

import { Car, User, Plus, Calendar, History, Settings, LogOut, Menu, X } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function Sidebar({ user }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const menuItems = [
    { icon: User, label: 'Dashboard', path: '/dashboard' },
    { icon: Plus, label: 'Add Vehicle', path: '/dashboard/vehicles/add' },
    { icon: Calendar, label: 'Bookings', path: '/dashboard/bookings' },
    { icon: History, label: 'History', path: '/dashboard/history' },
    { icon: Settings, label: 'Profile', path: '/dashboard/profile' },
  ]

  const NavItem = ({ item }) => {
    const Icon = item.icon
    const isActive = pathname === item.path
    
    return (
      <button
        onClick={() => {
          router.push(item.path)
          setMobileOpen(false)
        }}
        className={`w-full flex items-center px-4 py-3 rounded-lg mb-2 transition ${
          isActive 
            ? 'bg-blue-50 text-blue-600' 
            : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Icon className="mr-3" size={20} />
        <span className="font-medium">{item.label}</span>
      </button>
    )
  }

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-lg"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 w-64 h-screen bg-white border-r border-gray-200 z-40
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center">
            <Car className="text-blue-600 mr-2" size={32} />
            <h1 className="text-2xl font-bold text-gray-800">GariCare</h1>
          </div>
        </div>

        <nav className="p-4">
          {menuItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}

          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition mt-4"
          >
            <LogOut className="mr-3" size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </nav>
      </aside>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  )
}