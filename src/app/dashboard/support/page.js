// src/app/dashboard/support/page.js
'use client'
import { Suspense } from 'react'
import SupportPageContent from '@/components/support/SupportPageContent'
export default function DashboardSupportPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" /></div>}>
      <SupportPageContent subscriberType="individual" />
    </Suspense>
  )
}