'use client'

import { useParams } from 'next/navigation'
import FleetVehicleDetailView from '@/components/company/FleetVehicleDetailView'

/**
 * Company-member fleet vehicle detail page.
 *
 * Sister to /company/fleet/[vehicleId]. The basePath is derived from
 * [companyId] so links route inside the member's dashboard subtree.
 * companyId is also passed as a hint so the component doesn't need to
 * re-resolve it from the membership row (cheap optimisation, also
 * matches the URL of truth).
 */
export default function FleetVehicleDetailMemberPage() {
  const { companyId } = useParams()
  return (
    <FleetVehicleDetailView
      basePath={`/dashboard/company/${companyId}`}
      companyIdHint={companyId}
    />
  )
}