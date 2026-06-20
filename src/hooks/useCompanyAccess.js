'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * useCompanyAccess(companyId)
 *
 * Calls check_company_access RPC and returns the company's
 * subscription/trial state for UI gating.
 *
 * Returns:
 *   loading          — true while fetching
 *   state            — 'trial' | 'subscribed' | 'lapsed' | 'suspended' | null
 *   canWrite         — false = view-only (deny by default)
 *   trialEndsAt      — Date | null
 *   daysRemaining    — number | null
 *   maxVehicles      — number | null (null = unlimited)
 *   maxStaff         — number | null
 *   currentVehicles  — number
 *   currentStaff     — number
 *   canAddVehicle    — boolean
 *   canAddStaff      — boolean
 *   planName         — string | null
 *   subscriptionStatus — string | null
 *   reason           — human-readable string
 *   refresh()        — re-fetch
 */
export default function useCompanyAccess(companyId) {
  const supabase = createClient()

  const [loading, setLoading]                       = useState(true)
  const [state, setState]                           = useState(null)
  const [canWrite, setCanWrite]                     = useState(false) // deny by default
  const [trialEndsAt, setTrialEndsAt]               = useState(null)
  const [daysRemaining, setDaysRemaining]           = useState(null)
  const [maxVehicles, setMaxVehicles]               = useState(null)
  const [maxStaff, setMaxStaff]                     = useState(null)
  const [currentVehicles, setCurrentVehicles]       = useState(0)
  const [currentStaff, setCurrentStaff]             = useState(0)
  const [canAddVehicle, setCanAddVehicle]           = useState(false)
  const [canAddStaff, setCanAddStaff]               = useState(false)
  const [planName, setPlanName]                     = useState(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [reason, setReason]                         = useState('')

  const resolve = useCallback(async () => {
    if (!companyId) { setLoading(false); return }

    try {
      const { data, error } = await supabase.rpc('check_company_access', {
        p_company_id: companyId,
      })

      if (error || !data) {
        console.error('check_company_access error:', error)
        // Deny by default on error
        setCanWrite(false)
        setState(null)
        setReason('Unable to verify company subscription status.')
        return
      }

      setState(data.state)
      setCanWrite(data.can_write === true)
      setTrialEndsAt(data.trial_ends_at ? new Date(data.trial_ends_at) : null)
      setDaysRemaining(data.days_remaining)
      setMaxVehicles(data.max_vehicles)
      setMaxStaff(data.max_staff)
      setCurrentVehicles(data.current_vehicles || 0)
      setCurrentStaff(data.current_staff || 0)
      setCanAddVehicle(data.can_add_vehicle === true)
      setCanAddStaff(data.can_add_staff === true)
      setPlanName(data.plan_name)
      setSubscriptionStatus(data.subscription_status)
      setReason(data.reason || '')
    } catch (err) {
      console.error('useCompanyAccess error:', err)
      setCanWrite(false)
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabase])

  useEffect(() => { resolve() }, [resolve])

  return {
    loading,
    state,
    canWrite,
    trialEndsAt,
    daysRemaining,
    maxVehicles,
    maxStaff,
    currentVehicles,
    currentStaff,
    canAddVehicle,
    canAddStaff,
    planName,
    subscriptionStatus,
    reason,
    refresh: resolve,
  }
}