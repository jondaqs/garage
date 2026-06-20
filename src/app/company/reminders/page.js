'use client'

import CompanyRemindersView from '@/components/company/CompanyRemindersView'
import CompanySubscriptionGate from '@/components/CompanySubscriptionGate'
import useOwnerCompanyAccess from '@/hooks/useOwnerCompanyAccess'

/**
 * Company-owner reminders page.
 */
export default function CompanyRemindersOwnerPage() {
  const { companyId, loading } = useOwnerCompanyAccess()

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <CompanySubscriptionGate companyId={companyId} featureName="Reminders">
      <CompanyRemindersView basePath="/company" />
    </CompanySubscriptionGate>
  )
}