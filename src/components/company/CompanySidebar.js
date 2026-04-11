'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Home, Truck, Users, Calendar, ClipboardList,
  BarChart3, DollarSign, LogOut, Building2, AlertCircle
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function CompanySidebar({ company, userRole }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)

  useEffect(() => {
    if (company?.id) loadPendingCount(company.id)
  }, [company?.id])

  const loadPendingCount = async (companyId) => {
    try {
      // Get company vehicle ids
      const { data: fleet } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_company_id', companyId)
      const vehicleIds = fleet?.map(f => f.vehicle_id) || []
      if (vehicleIds.length === 0) return

      // Count work orders awaiting approval
      const { data: statuses } = await supabase
        .from('work_order_statuses')
        .select('id')
        .eq('code', 'awaiting_approval')
      const statusId = statuses?.[0]?.id
      if (!statusId) return

      const { count } = await supabase
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .in('vehicle_id', vehicleIds)
        .eq('status_id', statusId)

      setPendingApprovalCount(count || 0)
    } catch {}
  }

  const navigation = [
    { name: 'Dashboard',   href: '/company/dashboard',   icon: Home         },
    { name: 'Fleet',       href: '/company/fleet',        icon: Truck        },
    { name: 'Team',        href: '/company/team',         icon: Users        },
    { name: 'Bookings',    href: '/company/bookings',     icon: Calendar     },
    {
      name:  'Work Orders',
      href:  '/company/work-orders',
      icon:  ClipboardList,
      badge: pendingApprovalCount > 0 ? pendingApprovalCount : null,
    },
    { name: 'Budget',      href: '/company/budget',       icon: DollarSign   },
    { name: 'Reports',     href: '/company/reports',      icon: BarChart3    },
  ]

  const showInfoAlert = company?.status === 'pending_info'

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const statusConfig = {
    active:               { label: 'Active',         dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50  border-green-200'  },
    pending_verification: { label: 'Pending Review', dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
    pending_info:         { label: 'Info Required',  dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
    rejected:             { label: 'Rejected',       dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50    border-red-200'    },
    suspended:            { label: 'Suspended',      dot: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50   border-gray-200'   },
  }
  const statusCfg = company?.status ? statusConfig[company.status] : null

  const isActive = (href) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200 pt-5 pb-4 overflow-y-auto">

          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4 mb-2">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <Building2 className="text-white w-5 h-5" />
            </div>
            <div className="ml-3 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {company?.name || 'GariCare'}
              </p>
              <p className="text-xs text-gray-500">Company Portal</p>
            </div>
          </div>

          {/* Status badge */}
          {statusCfg && company?.status !== 'active' && (
            <div className={`mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {statusCfg.label}
            </div>
          )}

          {statusCfg && company?.status === 'active' && (
            <div className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-xs font-medium text-green-700">Verified & Active</span>
            </div>
          )}

          {/* Role badge for non-owners */}
          {userRole && userRole.staff_role !== 'owner' && (
            <div className="mx-4 mt-1 px-3 py-1">
              <span className="text-xs text-gray-400 capitalize">
                {userRole.staff_role}{userRole.is_admin ? ' · Admin' : ''}
              </span>
            </div>
          )}

          {/* Navigation */}
          <nav className="mt-4 flex-1 px-3 space-y-0.5">
            {/* Pending info action */}
            {showInfoAlert && (
              <button
                onClick={() => router.push('/company/pending-info')}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors mb-1"
              >
                <AlertCircle className="mr-3 h-4 w-4 text-orange-500 shrink-0 animate-pulse" />
                Action Required
              </button>
            )}

            {navigation.map((item) => {
              const Icon   = item.icon
              const active = isActive(item.href)
              return (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  className={`
                    w-full group flex items-center justify-between px-3 py-2.5 text-sm font-medium
                    rounded-lg transition-colors
                    ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                >
                  <div className="flex items-center">
                    <Icon
                      className={`mr-3 flex-shrink-0 w-4.5 h-4.5 ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'}`}
                      size={18}
                    />
                    {item.name}
                  </div>
                  {item.badge && (
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-yellow-500 rounded-full">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Sign out */}
          <div className="flex-shrink-0 border-t border-gray-200 p-4">
            <button
              onClick={handleSignOut}
              className="w-full group flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <LogOut className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  )
}