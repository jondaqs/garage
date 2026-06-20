'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * useTrialStatus
 *
 * Resolves the current individual user's trial / subscription state
 * by calling the existing `check_trial_eligibility` RPC and checking
 * the `subscriptions` table for an active paid plan.
 *
 * Returns:
 *   loading              – true while data is being fetched
 *   profileId            – user_profiles.id (null until loaded)
 *   hasActiveSubscription – user has a non-expired, active subscription
 *   isOnTrial            – user is within the 3-month Basic trial window
 *   isTrialExpired       – trial window has passed and no subscription exists
 *   trialEndsAt          – Date | null  (end of trial)
 *   trialMessage         – human-readable reason from the RPC
 *   daysRemaining        – integer days left in trial (0 when expired)
 *   isFreeUser           – user is on permanent free tier (within vehicle limit, trial over)
 */
export default function useTrialStatus() {
  const supabase = createClient()

  const [loading, setLoading]                           = useState(true)
  const [profileId, setProfileId]                       = useState(null)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [isOnTrial, setIsOnTrial]                       = useState(false)
  const [isTrialExpired, setIsTrialExpired]             = useState(false)
  const [trialEndsAt, setTrialEndsAt]                   = useState(null)
  const [trialMessage, setTrialMessage]                 = useState('')
  const [daysRemaining, setDaysRemaining]               = useState(0)
  const [isFreeUser, setIsFreeUser]                     = useState(false)

  const resolve = useCallback(async () => {
    try {
      // 1. Get auth user
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) { setLoading(false); return }

      // 2. Get profile
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id, created_at')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (!profile) { setLoading(false); return }
      setProfileId(profile.id)

      // 3. Check for any active paid subscription
      const { data: activeSubs } = await supabase
        .from('subscriptions')
        .select(`
          id,
          expiry_date,
          status:subscription_statuses!inner(code)
        `)
        .eq('user_id', profile.id)
        .eq('subscription_statuses.code', 'active')
        .gte('expiry_date', new Date().toISOString().split('T')[0])
        .limit(1)

      if (activeSubs && activeSubs.length > 0) {
        setHasActiveSubscription(true)
        setIsOnTrial(false)
        setIsTrialExpired(false)
        setLoading(false)
        return
      }

      // 4. No active subscription — call trial eligibility RPC
      const { data: trialRows, error: trialErr } = await supabase
        .rpc('check_trial_eligibility', {
          p_subscriber_type: 'individual',
          p_subscriber_id: profile.id,
        })

      if (trialErr || !trialRows || trialRows.length === 0) {
        // Fallback: calculate from profile created_at + 3 months
        const created = new Date(profile.created_at)
        const trialEnd = new Date(created)
        trialEnd.setMonth(trialEnd.getMonth() + 3)
        const now = new Date()

        if (now <= trialEnd) {
          setIsOnTrial(true)
          setTrialEndsAt(trialEnd)
          const diffDays = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))
          setDaysRemaining(Math.max(0, diffDays))
          setTrialMessage(`Basic trial active — free until ${trialEnd.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`)
        } else {
          setIsTrialExpired(true)
          setDaysRemaining(0)
        }
        setLoading(false)
        return
      }

      const trial = trialRows[0]
      setTrialMessage(trial.reason || '')

      if (trial.trial_expires_at) {
        const trialEnd = new Date(trial.trial_expires_at)
        setTrialEndsAt(trialEnd)

        const now = new Date()
        const diffDays = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))
        setDaysRemaining(Math.max(0, diffDays))
      }

      if (trial.is_eligible) {
        // Eligible and has a trial_expires_at → on time-based trial
        if (trial.trial_expires_at) {
          setIsOnTrial(true)
          setIsTrialExpired(false)
        } else {
          // Eligible via permanent free-tier (vehicle count only, no time limit)
          setIsFreeUser(true)
          setIsOnTrial(false)
          setIsTrialExpired(false)
        }
      } else {
        // Not eligible — trial has expired (or never existed)
        setIsOnTrial(false)
        setIsTrialExpired(true)
        setDaysRemaining(0)
      }
    } catch (err) {
      console.error('useTrialStatus error:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { resolve() }, [resolve])

  return {
    loading,
    profileId,
    hasActiveSubscription,
    isOnTrial,
    isTrialExpired,
    trialEndsAt,
    trialMessage,
    daysRemaining,
    isFreeUser,
    refresh: resolve,
  }
}