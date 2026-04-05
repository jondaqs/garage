'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserCircle } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'

export default function CompanyHeader({ company: companyProp, user: userProp }) {
  const [company, setCompany] = useState(companyProp || null)
  const [user, setUser] = useState(userProp || null)

  useEffect(() => {
    // If layout already passed company + user as props, skip the fetch
    if (companyProp && userProp) return
    fetchCompanyData()
  }, [companyProp, userProp])

  const fetchCompanyData = async () => {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .single()

    if (!userProfile) return
    setUser(userProfile)

    // Check ownership first, then membership
    const { data: ownedCompany } = await supabase
      .from('company_profiles')
      .select('*')
      .eq('owner_user_id', userProfile.id)
      .maybeSingle()

    if (ownedCompany) {
      setCompany(ownedCompany)
      return
    }

    const { data: companyUser } = await supabase
      .from('company_users')
      .select('company:company_profiles(*)')
      .eq('user_id', userProfile.id)
      .eq('is_active', true)
      .maybeSingle()

    if (companyUser?.company) setCompany(companyUser.company)
  }

  const statusConfig = {
    active:               { label: 'Active',           classes: 'bg-green-100 text-green-800' },
    pending_verification: { label: 'Pending Review',   classes: 'bg-yellow-100 text-yellow-800' },
    pending_info:         { label: 'Info Required',    classes: 'bg-orange-100 text-orange-800' },
    rejected:             { label: 'Rejected',         classes: 'bg-red-100 text-red-800' },
    suspended:            { label: 'Suspended',        classes: 'bg-gray-100 text-gray-700' },
  }

  const statusCfg = company?.status ? statusConfig[company.status] : null

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {company?.name || 'Company Dashboard'}
          </h2>
          {statusCfg && (
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full mt-1 ${statusCfg.classes}`}>
              {statusCfg.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Live notification bell — company users get personal notifications */}
          <NotificationBell />

          <div className="flex items-center gap-2">
            <UserCircle className="w-8 h-8 text-gray-400" />
            <div className="text-sm">
              <p className="font-medium text-gray-900 leading-tight">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-gray-500 text-xs">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}