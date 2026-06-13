// src/app/provider/subscription/page.js
'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import SubscriptionManager from '@/components/subscription/SubscriptionManager'

export default function ProviderSubscriptionPage() {
  const supabase = createClient()
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) { setAccessError('Profile not found'); setLoading(false); return }

      // Find provider where user is owner
      const { data: owned } = await supabase
        .from('service_providers')
        .select('id, name')
        .eq('owner_user_id', profile.id)
        .limit(1)
        .maybeSingle()

      if (owned) { setProvider(owned); setLoading(false); return }

      // Check service_provider_users for admin/accountant role
      const { data: membership } = await supabase
        .from('service_provider_users')
        .select('service_provider_id, provider:service_providers(id, name)')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .in('role', ['service_provider_owner', 'admin', 'accountant'])
        .limit(1)
        .maybeSingle()

      if (membership?.provider) {
        setProvider(membership.provider)
      } else {
        setAccessError('You need to be a provider owner, admin, or accountant to manage subscriptions.')
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="animate-spin text-emerald-600" size={28} />
    </div>
  )

  if (accessError) return (
    <div className="max-w-md mx-auto text-center py-10">
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4">{accessError}</p>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Provider Subscription</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage subscription for <strong>{provider?.name}</strong> — plans, invoices, and payments.
        </p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" size={24} /></div>}>
        <SubscriptionManager
          subscriberType="service_provider"
          subscriberId={provider.id}
          subscriberName={provider.name}
        />
      </Suspense>
    </div>
  )
}