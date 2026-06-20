'use client'

import { useParams } from 'next/navigation'
import CompanyRemindersView from '@/components/company/CompanyRemindersView'
import CompanySubscriptionGate from '@/components/CompanySubscriptionGate'

/**
 * Company-member reminders page.
 *
 * Thin route wrapper around the shared CompanyRemindersView. Sister to
 * /company/reminders (the owner-side route). The basePath is derived
 * from the [companyId] path param so internal links route within the
 * member's portal subtree (/dashboard/company/{id}/...) instead of the
 * owner-only /company/... namespace, which middleware blocks for members.
 */
export default function CompanyRemindersMemberPage() {
  const { companyId } = useParams()
  return (
    <CompanySubscriptionGate companyId={companyId} featureName="Reminders">
      <CompanyRemindersView basePath={`/dashboard/company/${companyId}`} />
    </CompanySubscriptionGate>
  )
}