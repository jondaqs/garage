// src/app/dashboard/my-teams/provider/[providerId]/service-marketplace/page.js
'use client'
import { useParams } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import ProviderMarketplacePage from '@/app/provider/service-marketplace/page'

// Re-uses the provider marketplace page — the RPC functions resolve the provider
// from the caller's auth context, so the providerId param is for sidebar routing only.
export default function ProviderMemberMarketplacePage() {
  return <ProviderMarketplacePage />
}