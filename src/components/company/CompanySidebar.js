'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  HomeIcon, 
  TruckIcon, 
  UsersIcon, 
  CalendarIcon,
  ChartBarIcon,
  CogIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline'

export default function CompanySidebar() {
  const pathname = usePathname()

  const navigation = [
    { name: 'Dashboard', href: '/company/dashboard', icon: HomeIcon },
    { name: 'Fleet', href: '/company/fleet', icon: TruckIcon },
    { name: 'Team', href: '/company/team', icon: UsersIcon },
    { name: 'Bookings', href: '/company/bookings', icon: CalendarIcon },
    { name: 'Reports', href: '/company/reports', icon: ChartBarIcon },
    { name: 'Settings', href: '/company/settings', icon: CogIcon },
  ]

  return (
    <div className="w-64 bg-white border-r border-gray-200">
      <div className="flex items-center gap-2 p-6 border-b">
        <BuildingOfficeIcon className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="font-bold text-lg">GariCare</h1>
          <p className="text-xs text-gray-500">Company Portal</p>
        </div>
      </div>

      <nav className="p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}