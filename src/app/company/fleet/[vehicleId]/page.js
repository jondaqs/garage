'use client'

import FleetVehicleDetailView from '@/components/company/FleetVehicleDetailView'

/**
 * Company-owner fleet vehicle detail page.
 *
 * Thin route wrapper around FleetVehicleDetailView. The component handles
 * everything; we just pass the portal's basePath so internal links stay
 * within /company/...
 */
export default function FleetVehicleDetailOwnerPage() {
  return <FleetVehicleDetailView basePath="/company" />
}