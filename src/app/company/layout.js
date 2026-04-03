'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CompanySidebar from '@/components/company/CompanySidebar'
import CompanyHeader from '@/components/company/CompanyHeader'

export default function CompanyLayout({ children }) {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState(null)
    const [company, setCompany] = useState(null)
    const [userRole, setUserRole] = useState(null)

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

            // Get user profile
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('auth_user_id', user.id)
                .single()

            if (!profile) {
                router.push('/auth/login')
                return
            }

            // Check if user owns a company
            const { data: ownedCompany } = await supabase
                .from('company_profiles')
                .select('*')
                .eq('owner_user_id', profile.id)
                .maybeSingle()

            if (ownedCompany) {
                // User is company owner
                setCompany(ownedCompany)
                setUserRole({ is_admin: true, staff_role: 'owner', is_active: true })
                setLoading(false)
                return
            }

            // Check if user is a company member
            const { data: companyMember } = await supabase
                .from('company_users')
                .select('*, company:company_profiles(*)')
                .eq('user_id', profile.id)
                .eq('is_active', true)
                .maybeSingle()

            if (companyMember && companyMember.company) {
                // User is company member
                setCompany(companyMember.company)
                setUserRole({
                    is_admin: companyMember.is_admin,
                    staff_role: companyMember.staff_role,
                    is_active: companyMember.is_active
                })
                setLoading(false)
                return
            }

            // No company access - redirect to signup
            console.log('No company found for user')
            router.push('/auth/company-signup')

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

    if (!company) {
        return null
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