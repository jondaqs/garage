// src/app/provider/support/page.js
'use client'
import { Suspense } from 'react'
import SupportPageContent from '@/components/support/SupportPageContent'
export default function ProviderSupportPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" /></div>}>
      <SupportPageContent subscriberType="service_provider" />
    </Suspense>
  )
}