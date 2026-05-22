'use client'

import CompanyRemindersView from '@/components/company/CompanyRemindersView'

/**
 * Company-owner reminders page.
 *
 * Thin route wrapper around the shared CompanyRemindersView. Both this
 * route and /dashboard/company/[companyId]/reminders render the same
 * component; only the basePath differs so internal links route to the
 * correct portal (owner → /company/*, member → /dashboard/company/[id]/*).
 */
export default function CompanyRemindersOwnerPage() {
  return <CompanyRemindersView basePath="/company" />
}