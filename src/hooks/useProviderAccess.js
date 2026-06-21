'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import useCompanyAccess from '@/hooks/useCompanyAccess'

/**
 * useProviderAccess()
 *
 * Resolves the current user's service provider and returns
 * subscription/trial access state via check_provider_access RPC.
 *
 * Returns same shape as useCompanyAccess plus:
 *   providerId — the resolved provider ID
 */
export default function useProviderAccess() {
  const supabase = createClient()
  const [providerId, setProviderId] = useState(null)
  const [resolving, setResolving] = useState(true)

  // Access state
  const [state, setState]                           = useState(null)
  const [canWrite, setCanWrite]                     = useState(false)
  const [trialEndsAt, setTrialEndsAt]               = useState(null)
  const [daysRemaining, setDaysRemaining]           = useState(null)
  const [maxStaff, setMaxStaff]                     = useState(null)
  const [maxShops, setMaxShops]                     = useState(null)
  const [currentStaff, setCurrentStaff]             = useState(0)
  const [currentShops, setCurrentShops]             = useState(0)
  const [canAddStaff, setCanAddStaff]               = useState(false)
  const [canAddShop, setCanAddShop]                 = useState(false)
  const [planName, setPlanName]                     = useState(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [reason, setReason]                         = useState('')
  const [loading, setLoading]                       = useState(true)

  useEffect(() => {
    const resolve = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setResolving(false); setLoading(false); return }

        const { data: profile } = await supabase
          .from('user_profiles_secure')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()

        if (!profile) { setResolving(false); setLoading(false); return }

        // Check owner first
        const { data: owned } = await supabase
          .from('service_providers_secure')
          .select('id')
          .eq('owner_user_id', profile.id)
          .maybeSingle()

        let pid = owned?.id || null

        // Fallback: check service_provider_users
        if (!pid) {
          const { data: spu } = await supabase
            .from('service_provider_users')
            .select('service_provider_id')
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .maybeSingle()
          pid = spu?.service_provider_id || null
        }

        // Fallback: check mechanics
        if (!pid) {
          const { data: mech } = await supabase
            .from('mechanics')
            .select('service_provider_id')
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .maybeSingle()
          pid = mech?.service_provider_id || null
        }

        setProviderId(pid)
        setResolving(false)

        if (!pid) { setLoading(false); return }

        // Fetch access state
        const { data, error } = await supabase.rpc('check_provider_access', {
          p_provider_id: pid,
        })

        if (error || !data) {
          console.error('check_provider_access error:', error)
          setCanWrite(false)
          setState(null)
          setReason('Unable to verify provider subscription status.')
          setLoading(false)
          return
        }

        setState(data.state)
        setCanWrite(data.can_write === true)
        setTrialEndsAt(data.trial_ends_at ? new Date(data.trial_ends_at) : null)
        setDaysRemaining(data.days_remaining)
        setMaxStaff(data.max_staff)
        setMaxShops(data.max_shops)
        setCurrentStaff(data.current_staff || 0)
        setCurrentShops(data.current_shops || 0)
        setCanAddStaff(data.can_add_staff === true)
        setCanAddShop(data.can_add_shop === true)
        setPlanName(data.plan_name)
        setSubscriptionStatus(data.subscription_status)
        setReason(data.reason || '')
      } catch (err) {
        console.error('useProviderAccess error:', err)
        setCanWrite(false)
        setState(null)
      } finally {
        setLoading(false)
      }
    }
    resolve()
  }, [supabase])

  return {
    loading,
    providerId,
    state,
    canWrite,
    trialEndsAt,
    daysRemaining,
    maxStaff,
    maxShops,
    currentStaff,
    currentShops,
    canAddStaff,
    canAddShop,
    planName,
    subscriptionStatus,
    reason,
  }
}