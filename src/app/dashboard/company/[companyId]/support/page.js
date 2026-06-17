// src/app/dashboard/company/[companyId]/support/page.js
'use client'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import SupportPageContent from '@/components/support/SupportPageContent'
import { Loader2 } from 'lucide-react'

function Content() {
  const { companyId } = useParams()
  return <SupportPageContent subscriberType="company" entityId={companyId} />
}

export default function CompanyMemberSupportPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={28} /></div>}>
      <Content />
    </Suspense>
  )
}