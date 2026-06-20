// src/app/dashboard/subscription/page.js
'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ShieldOff, LifeBuoy } from 'lucide-react'
import Link from 'next/link'
import SubscriptionManager from '@/components/subscription/SubscriptionManager'
import useTrialStatus from '@/hooks/useTrialStatus'

export default function IndividualSubscriptionPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const {
    loading: trialLoading,
    isSuspended,
    suspendedSubNote,
  } = useTrialStatus()

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

  if (loading || trialLoading) return (
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

      {isSuspended && (
        <div className="flex items-start gap-4 p-4 mb-6 rounded-xl border border-red-300 bg-red-50">
          <div className="p-2 rounded-lg bg-red-100">
            <ShieldOff size={20} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">
              Your subscription has been suspended
            </p>
            <p className="text-sm text-red-600 mt-0.5">
              Access to premium features is temporarily unavailable.
              {suspendedSubNote ? ` Reason: ${suspendedSubNote}` : ''}{' '}
              Please contact support if you need assistance restoring your subscription.
            </p>
          </div>
          <Link
            href="/dashboard/support"
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            <LifeBuoy size={14} />
            Contact Support
          </Link>
        </div>
      )}

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