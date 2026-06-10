// src/app/company/subscription/page.js
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import SubscriptionManager from '@/components/subscription/SubscriptionManager'

export default function CompanySubscriptionPage() {
  const supabase = createClient()
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's profile ID
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) { setAccessError('Profile not found'); setLoading(false); return }

      // Find company where user is owner, admin, or accountant
      const { data: owned } = await supabase
        .from('company_profiles')
        .select('id, name')
        .eq('owner_user_id', profile.id)
        .limit(1)
        .maybeSingle()

      if (owned) { setCompany(owned); setLoading(false); return }

      // Check company_users for admin/accountant role
      const { data: membership } = await supabase
        .from('company_users')
        .select('company_id, company:company_profiles(id, name)')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .or('is_admin.eq.true,staff_role.eq.accountant')
        .limit(1)
        .maybeSingle()

      if (membership?.company) {
        setCompany(membership.company)
      } else {
        setAccessError('You need to be a company owner, admin, or accountant to manage subscriptions.')
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="animate-spin text-purple-600" size={28} />
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
        <h1 className="text-2xl font-bold text-gray-900">Company Subscription</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage subscription for <strong>{company?.name}</strong> — plans, invoices, and payments.
        </p>
      </div>
      <SubscriptionManager
        subscriberType="company"
        subscriberId={company.id}
        subscriberName={company.name}
      />
    </div>
  )
}