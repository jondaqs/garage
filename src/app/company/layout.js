// src/app/company/layout.js
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import CompanySidebar from '@/components/company/CompanySidebar'
import CompanyHeader from '@/components/company/CompanyHeader'

export default function CompanyLayout({ children }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [userRole, setUserRole] = useState(null)

  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  )

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/auth/login')
        return
      }

      setUser(user)

      // Get user profile and company
      const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
          *,
          company:company_profiles(*),
          company_user:company_users!inner(
            is_admin,
            staff_role,
            is_active
          )
        `)
        .eq('auth_user_id', user.id)
        .single()

      if (!profile?.company) {
        // No company - redirect to signup
        router.push('/auth/company-signup')
        return
      }

      // Check if company is active
      if (profile.company.status === 'pending_verification' || !profile.company.is_active) {
        router.push('/company/pending-verification')
        return
      }

      if (profile.company.is_suspended) {
        router.push('/company/suspended')
        return
      }

      setCompany(profile.company)
      setUserRole(profile.company_user[0])
    } catch (error) {
      console.error('Error checking user:', error)
      router.push('/auth/login')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <CompanySidebar company={company} userRole={userRole} />

      {/* Main Content */}
      <div className="lg:ml-64">
        <CompanyHeader user={user} company={company} userRole={userRole} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}