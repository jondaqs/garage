'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, UserCircle } from 'lucide-react'

export default function CompanyHeader() {
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetchCompanyData()
  }, [])

  const fetchCompanyData = async () => {
    const supabase = createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (userProfile) {
      setUser(userProfile)

      const { data: companyUser } = await supabase
        .from('company_users')
        .select('*, company:company_profiles(*)')
        .eq('user_id', userProfile.id)
        .single()

      if (companyUser) {
        setCompany(companyUser.company)
      }
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {company?.name || 'Company Dashboard'}
          </h2>
          {company?.status && (
            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
              company.status === 'active' 
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {company.status === 'active' ? 'Active' : 'Pending Verification'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-gray-100 rounded-lg relative">
            <Bell className="w-6 h-6 text-gray-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          <div className="flex items-center gap-2">
            <UserCircle className="w-8 h-8 text-gray-600" />
            <div className="text-sm">
              <p className="font-medium">
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