// → src/app/dashboard/company/[companyId]/fleet-assignments/page.js
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import FleetAssignmentManager from '@/components/company/FleetAssignmentManager'
import { Loader2 } from 'lucide-react'

/**
 * Fleet Assignments page in the member portal (/dashboard/company/<id>/…).
 *
 * Resolves the caller's membership to determine canEdit:
 *   - owner          → canEdit = true
 *   - is_admin       → canEdit = true
 *   - can_manage_fleet → canEdit = true
 *   - everyone else  → canEdit = false (read-only view)
 */
export default function MemberFleetAssignmentsPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }

        const { data: profile } = await supabase
          .from('user_profiles_secure')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()
        if (!profile) { setError('Profile not found'); return }

        // Check if owner
        const { data: owned } = await supabase
          .from('company_profiles_secure')
          .select('id')
          .eq('id', companyId)
          .eq('owner_user_id', profile.id)
          .maybeSingle()

        if (owned) {
          setCanEdit(true)
          setLoading(false)
          return
        }

        // Check membership
        const { data: mem } = await supabase
          .from('company_users')
          .select('is_admin, can_manage_fleet')
          .eq('user_id', profile.id)
          .eq('company_id', companyId)
          .eq('is_active', true)
          .maybeSingle()

        if (!mem) { setError('You are not a member of this company.'); return }

        setCanEdit(!!(mem.is_admin || mem.can_manage_fleet))
      } catch {
        setError('Failed to verify access')
      } finally {
        setLoading(false)
      }
    })()
  }, [companyId])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }

  return <FleetAssignmentManager canEdit={canEdit} />
}