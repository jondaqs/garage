'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import useCompanyAccess from '@/hooks/useCompanyAccess'

/**
 * useOwnerCompanyAccess()
 *
 * For the owner portal (/company/...) where companyId is NOT
 * in the URL. Resolves the owner's company from their profile,
 * then delegates to useCompanyAccess.
 *
 * Returns the same interface as useCompanyAccess plus:
 *   companyId — the resolved company ID (null until loaded)
 */
export default function useOwnerCompanyAccess() {
  const supabase = createClient()
  const [companyId, setCompanyId] = useState(null)
  const [resolving, setResolving] = useState(true)

  useEffect(() => {
    const resolve = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setResolving(false); return }

        const { data: profile } = await supabase
          .from('user_profiles_secure')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()

        if (!profile) { setResolving(false); return }

        // Check if user owns a company
        const { data: owned } = await supabase
          .from('company_profiles')
          .select('id')
          .eq('owner_user_id', profile.id)
          .maybeSingle()

        if (owned) {
          setCompanyId(owned.id)
        } else {
          // Fallback: check company_users membership
          const { data: membership } = await supabase
            .from('company_users')
            .select('company_id')
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .maybeSingle()

          if (membership) setCompanyId(membership.company_id)
        }
      } catch (err) {
        console.error('useOwnerCompanyAccess resolve error:')
      } finally {
        setResolving(false)
      }
    }
    resolve()
  }, [supabase])

  const access = useCompanyAccess(companyId)

  return {
    ...access,
    companyId,
    // loading is true while either resolving companyId or fetching access
    loading: resolving || access.loading,
  }
}