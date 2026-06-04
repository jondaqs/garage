'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, LogOut, Settings } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'

export default function CompanyHeader({ company, user: authUser, userRole }) {
  const router = useRouter()
  const supabase = createClient()
  const [userProfile, setUserProfile] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    fetchProfile()
  }, [authUser])

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchProfile = async () => {
    if (!authUser) return
    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('id, first_name, last_name, email, profile_picture_url')
      .eq('auth_user_id', authUser.id)
      .single()
    if (profile) setUserProfile(profile)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const statusConfig = {
    active:               { label: 'Active',         classes: 'bg-green-100 text-green-800'   },
    pending_verification: { label: 'Pending Review', classes: 'bg-yellow-100 text-yellow-800' },
    pending_info:         { label: 'Info Required',  classes: 'bg-orange-100 text-orange-800' },
    rejected:             { label: 'Rejected',       classes: 'bg-red-100 text-red-800'       },
    suspended:            { label: 'Suspended',      classes: 'bg-gray-100 text-gray-700'     },
  }
  const statusCfg = company?.status ? statusConfig[company.status] : null

  const initials = userProfile
    ? `${userProfile.first_name?.[0] || ''}${userProfile.last_name?.[0] || ''}`.toUpperCase()
    : authUser?.email?.[0]?.toUpperCase() || '?'

  const displayName = userProfile
    ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
    : authUser?.email || 'User'

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3.5">
      <div className="flex items-center justify-between">

        {/* Left — company name + status */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 leading-tight">
            {company?.name || 'Company Dashboard'}
          </h2>
          {statusCfg && (
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full mt-0.5 ${statusCfg.classes}`}>
              {statusCfg.label}
            </span>
          )}
        </div>

        {/* Right — notification bell + user dropdown */}
        <div className="flex items-center gap-2">

          {/*
            NotificationBell — updated version (Phase 2):
            - Queries both recipient_user_id and user_id for personal notifications
            - isAdmin=false so no broadcast admin alerts (company users are not admins)
            - Mark as read / delete work via the updated RLS policies
          */}
          <NotificationBell isCompany={true} />

          {/* User dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0 overflow-hidden">
                {userProfile?.profile_picture_url ? (
                  <img 
                    src={userProfile.profile_picture_url} 
                    alt={displayName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-gray-900 leading-tight">{displayName}</p>
                <p className="text-xs text-gray-500 capitalize leading-tight">
                  {userRole?.staff_role || 'member'}
                  {userRole?.is_admin ? ' · Admin' : ''}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-1 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{userProfile?.email || authUser?.email}</p>
                </div>
                <button
                  onClick={() => { setDropdownOpen(false); router.push('/company/settings') }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-gray-400" />
                  Settings
                </button>
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}