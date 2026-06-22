// src/app/company/service-requests/page.js
'use client'
import ServiceRequestsPage from '@/components/broadcast/ServiceRequestsPage'
import useOwnerCompanyAccess from '@/hooks/useOwnerCompanyAccess'
import CompanyAccessBanner from '@/components/CompanyAccessBanner'

export default function Page() {
  const access = useOwnerCompanyAccess()
  return (
    <>
      {!access.loading && <CompanyAccessBanner {...access} companyId={access.companyId} />}
      <ServiceRequestsPage subscriberType="company" canWrite={access.canWrite} accessState={access.state} />
    </>
  )
}