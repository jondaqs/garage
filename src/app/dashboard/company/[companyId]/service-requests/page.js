// src/app/dashboard/company/[companyId]/service-requests/page.js
'use client'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import ServiceRequestsPage from '@/components/broadcast/ServiceRequestsPage'
import { Loader2 } from 'lucide-react'

function Content() {
  const { companyId } = useParams()
  return <ServiceRequestsPage subscriberType="company" entityId={companyId} />
}

export default function CompanyMemberServiceRequestsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={28} /></div>}>
      <Content />
    </Suspense>
  )
}