'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * useTrialStatus
 *
 * Deny-by-default approach: canAccessPremium is false until
 * explicitly set true by one of two conditions:
 *   1. Active non-expired subscription exists
 *   2. check_trial_eligibility returns eligible WITH a future expiry date
 *
 * Free-tier (eligible by vehicle count, no time limit) does NOT
 * grant premium access — canAccessPremium stays false.
 */
export default function useTrialStatus() {
  const supabase = createClient()

  const [loading, setLoading]                             = useState(true)
  const [profileId, setProfileId]                         = useState(null)
  // ── Access decision (deny by default) ──
  const [canAccessPremium, setCanAccessPremium]           = useState(false)
  // ── Reason flags (informational, not gatekeeping) ──
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  const [isSuspended, setIsSuspended]                     = useState(false)
  const [suspendedSubNote, setSuspendedSubNote]           = useState('')
  const [isOnTrial, setIsOnTrial]                         = useState(false)
  const [isTrialExpired, setIsTrialExpired]               = useState(false)
  const [trialEndsAt, setTrialEndsAt]                     = useState(null)
  const [trialMessage, setTrialMessage]                   = useState('')
  const [daysRemaining, setDaysRemaining]                 = useState(0)
  const [isFreeUser, setIsFreeUser]                       = useState(false)

  const resolve = useCallback(async () => {
    // Reset to deny-by-default on each evaluation
    let access = false

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

      // 3. Fetch all user subscriptions in one query
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

      const activeSub = (userSubs || []).find(
        s => s.subscription_statuses?.code === 'active'
          && s.expiry_date >= today
      )
      const suspendedSub = (userSubs || []).find(
        s => s.subscription_statuses?.code === 'suspended'
          && s.expiry_date >= today
      )

      // ── Active subscription → premium access granted ───────────────────
      if (activeSub) {
        setHasActiveSubscription(true)
        setIsSuspended(false)
        setIsOnTrial(false)
        setIsTrialExpired(false)
        setIsFreeUser(false)
        access = true
        return // finally block sets canAccessPremium + loading
      }

      // ── No active subscription ─────────────────────────────────────────
      setHasActiveSubscription(false)

      // Set suspended flag (informational — doesn't grant/deny by itself)
      if (suspendedSub) {
        setIsSuspended(true)
        setSuspendedSubNote(suspendedSub.notes || '')
      } else {
        setIsSuspended(false)
        setSuspendedSubNote('')
      }

      // ── 4. Evaluate trial eligibility ──────────────────────────────────
      const { data: trialRows, error: trialErr } = await supabase
        .rpc('check_trial_eligibility', {
          p_subscriber_type: 'individual',
          p_subscriber_id: profile.id,
        })

      if (trialErr || !trialRows || trialRows.length === 0) {
        // RPC failed — deny access, mark trial expired
        setIsOnTrial(false)
        setIsTrialExpired(true)
        setIsFreeUser(false)
        setDaysRemaining(0)
        access = false
        return
      }

      const trial = trialRows[0]
      setTrialMessage(trial.reason || '')

      if (trial.is_eligible && trial.trial_expires_at) {
        // ── Time-based trial active (Basic Plus trial) ─────────────────
        const trialEnd = new Date(trial.trial_expires_at)
        const now = new Date()
        const diffDays = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))

        setIsOnTrial(true)
        setIsTrialExpired(false)
        setIsFreeUser(false)
        setTrialEndsAt(trialEnd)
        setDaysRemaining(Math.max(0, diffDays))
        access = true // trial grants premium access

      } else if (trial.is_eligible && !trial.trial_expires_at) {
        // ── Permanent free tier (vehicle count only) ───────────────────
        // Eligible to USE the platform but NOT premium features
        setIsFreeUser(true)
        setIsOnTrial(false)
        setIsTrialExpired(false)
        setDaysRemaining(0)
        access = false // free tier does NOT grant premium access

      } else {
        // ── Not eligible (trial expired or over vehicle limit) ─────────
        setIsOnTrial(false)
        setIsTrialExpired(true)
        setIsFreeUser(false)
        setDaysRemaining(0)
        access = false
      }
    } catch (err) {
      console.error('useTrialStatus error:', err)
      access = false // deny on error
    } finally {
      setCanAccessPremium(access)
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { resolve() }, [resolve])

  return {
    loading,
    profileId,
    canAccessPremium,
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