// src/app/dashboard/subscription/page.js
'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import SubscriptionManager from '@/components/subscription/SubscriptionManager'

export default function IndividualSubscriptionPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, username')
        .eq('auth_user_id', user.id)
        .single()
      setProfile(data)
      setLoading(false)
    })()
  }, [])

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="animate-spin text-blue-600" size={28} />
    </div>
  )

  if (!profile) return <p className="text-center text-gray-500 py-10">Profile not found.</p>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Subscription</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage your personal vehicle subscription plan, invoices, and payments.
        </p>
      </div>
      <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" size={24} /></div>}>
        <SubscriptionManager
          subscriberType="individual"
          subscriberId={profile.id}
          subscriberName={profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : profile.username}
        />
      </Suspense>
    </div>
  )
}