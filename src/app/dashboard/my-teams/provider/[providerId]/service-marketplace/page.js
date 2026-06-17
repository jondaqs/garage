// src/app/dashboard/my-teams/provider/[providerId]/service-marketplace/page.js
'use client'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

// Dynamic import to avoid circular dependency — the marketplace page
// exports ProviderMarketplaceContent which accepts providerIdProp
import dynamic from 'next/dynamic'
const ProviderMarketplacePage = dynamic(
  () => import('@/app/provider/service-marketplace/page'),
  { loading: () => <div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={28} /></div> }
)

function Content() {
  const { providerId } = useParams()
  // The ProviderMarketplacePage wrapper renders ProviderMarketplaceContent
  // which now accepts providerIdProp via the exported wrapper
  return <ProviderMarketplacePage providerIdProp={providerId} />
}

export default function ProviderMemberMarketplacePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-emerald-600" size={28} /></div>}>
      <Content />
    </Suspense>
  )
}