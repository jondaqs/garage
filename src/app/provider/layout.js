'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ProviderSidebar from '@/components/provider/ProviderSidebar'
import ProviderHeader from '@/components/provider/ProviderHeader'

export default function ProviderLayout({ children }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [provider, setProvider] = useState(null)

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

      // Get user profile and check if they're a service provider
      const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
          *,
          user_roles(
            role:user_roles_lookup(code)
          )
        `)
        .eq('auth_user_id', user.id)
        .single()

      const isProvider = profile?.user_roles?.some(
        ur => ur.role?.code === 'service_provider_owner'
      )

      if (!isProvider) {
        router.push('/dashboard')
        return
      }

      // Get provider details
      const { data: providerData } = await supabase
        .from('service_providers')
        .select('*')
        .eq('owner_user_id', profile.id)
        .single()

      if (!providerData) {
        // No provider record - redirect to registration
        router.push('/auth/provider-signup')
        return
      }

      setProvider(providerData)
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <ProviderSidebar provider={provider} />

      {/* Main Content */}
      <div className="lg:ml-64">
        <ProviderHeader user={user} provider={provider} />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
