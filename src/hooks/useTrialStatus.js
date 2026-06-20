'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * useTrialStatus
 *
 * Resolves the current individual user's trial / subscription state.
 *
 * Priority logic:
 *   1. Active subscription → full access, nothing else matters
 *   2. No active subscription → check for suspended sub (sets flag)
 *      THEN always evaluate trial eligibility (free-tier fallback)
 *   3. The consumer (SubscriptionGate) decides access based on
 *      the combination of isSuspended + trial state
 *
 * On suspension the user falls back to free-tier rules:
 *   • Trial still active   → access with trial banner (+ suspension notice)
 *   • Trial expired        → no access (suspension lock screen)
 */
export default function useTrialStatus() {
  const supabase = createClient()

  const [loading, setLoading]                           = useState(true)
  const [profileId, setProfileId]                       = useState(null)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [isSuspended, setIsSuspended]                   = useState(false)
  const [suspendedSubNote, setSuspendedSubNote]         = useState('')
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

      // 3. Fetch the user's subscriptions in a single query
      //    sorted by expiry_date desc so the most current plan comes first
      const today = new Date().toISOString().split('T')[0]

      const { data: userSubs } = await supabase
        .from('subscriptions')
        .select(`
          id,
          notes,
          expiry_date,
          start_date,
          updated_at,
          subscription_statuses ( code )
        `)
        .eq('user_id', profile.id)
        .order('expiry_date', { ascending: false })

      // Categorise — "current" means the plan period hasn't expired
      const activeSub = (userSubs || []).find(
        s => s.subscription_statuses?.code === 'active'
          && s.expiry_date >= today
      )

      // Only a non-expired suspended subscription counts as "current".
      // If a sub was suspended AND its expiry_date has passed, the plan
      // period is over — it's historical and shouldn't block or banner.
      const suspendedSub = (userSubs || []).find(
        s => s.subscription_statuses?.code === 'suspended'
          && s.expiry_date >= today
      )

      // ── Active subscription → full access, done ─────────────────────────
      if (activeSub) {
        setHasActiveSubscription(true)
        setIsSuspended(false)
        setIsOnTrial(false)
        setIsTrialExpired(false)
        setLoading(false)
        return
      }

      // ── Suspended flag (does NOT short-circuit — trial still evaluated) ─
      if (suspendedSub) {
        setIsSuspended(true)
        setSuspendedSubNote(suspendedSub.notes || '')
      } else {
        setIsSuspended(false)
        setSuspendedSubNote('')
      }

      // ── 4. No active subscription — evaluate trial / free-tier ──────────
      setHasActiveSubscription(false)

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
          setIsTrialExpired(false)
          setTrialEndsAt(trialEnd)
          const diffDays = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))
          setDaysRemaining(Math.max(0, diffDays))
          setTrialMessage(`Basic trial active — free until ${trialEnd.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`)
        } else {
          setIsOnTrial(false)
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
        if (trial.trial_expires_at) {
          // Within time-based trial window
          setIsOnTrial(true)
          setIsTrialExpired(false)
        } else {
          // Permanent free tier (vehicle count only, no time limit)
          setIsFreeUser(true)
          setIsOnTrial(false)
          setIsTrialExpired(false)
        }
      } else {
        // Trial expired or never existed
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
    isSuspended,
    suspendedSubNote,
    isOnTrial,
    isTrialExpired,
    trialEndsAt,
    trialMessage,
    daysRemaining,
    isFreeUser,
    refresh: resolve,
  }
}