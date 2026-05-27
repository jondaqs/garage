// → src/app/company/fleet-assignments/page.js
'use client'

import FleetAssignmentManager from '@/components/company/FleetAssignmentManager'

/**
 * Fleet Assignments page for the company-owner portal (/company/…).
 *
 * The layout.js already resolves userRole — but since the company portal
 * is restricted to the owner (or admin members who navigate to /company),
 * we always pass canEdit = true here. The API route double-checks
 * server-side anyway.
 */
export default function CompanyFleetAssignmentsPage() {
  return <FleetAssignmentManager canEdit={true} />
}