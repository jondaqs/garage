// src/app/dashboard/subscription/page.js
'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import SubscriptionManager from '@/components/subscription/SubscriptionManager'

console.log('[subscription/page] module loaded')

export default function IndividualSubscriptionPage() {
  console.log('[subscription/page] rendering')
  const supabase = createClient()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    console.log('[subscription/page] useEffect firing')
    ;(async () => {
      try {
        console.log('[subscription/page] fetching auth user...')
        const { data: { user }, error: authErr } = await supabase.auth.getUser()
        console.log('[subscription/page] auth result:', { userId: user?.id, authErr })
        if (!user) { setLoading(false); return }

        console.log('[subscription/page] fetching profile...')
        const { data, error: profileErr } = await supabase
          .from('user_profiles')
          .select('id, first_name, last_name, username')
          .eq('auth_user_id', user.id)
          .single()
        console.log('[subscription/page] profile result:', { profileId: data?.id, profileErr })

        setProfile(data)
      } catch (e) {
        console.error('[subscription/page] CRASH in useEffect:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  console.log('[subscription/page] render state:', { loading, hasProfile: !!profile, error })

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 m-4">
      <h3 className="text-red-800 font-bold text-sm mb-2">Page Error</h3>
      <pre className="text-red-600 text-xs whitespace-pre-wrap">{error}</pre>
    </div>
  )

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="animate-spin text-blue-600" size={28} />
    </div>
  )

  if (!profile) return <p className="text-center text-gray-500 py-10">Profile not found.</p>

  console.log('[subscription/page] rendering SubscriptionManager with:', {
    subscriberType: 'individual',
    subscriberId: profile.id,
    subscriberName: profile.first_name || profile.username,
  })

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