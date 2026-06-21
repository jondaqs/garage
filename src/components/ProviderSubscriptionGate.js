'use client'

import { useRouter } from 'next/navigation'
import { Lock, Sparkles, ArrowRight, ShieldOff, LifeBuoy } from 'lucide-react'
import Link from 'next/link'
import useProviderAccess from '@/hooks/useProviderAccess'
import ProviderAccessBanner from '@/components/ProviderAccessBanner'

/**
 * ProviderSubscriptionGate
 *
 * canWrite = true  → render children (with trial banner)
 * canWrite = false → lock screen
 */
export default function ProviderSubscriptionGate({
  featureName = 'This feature',
  children,
}) {
  const router = useRouter()
  const access = useProviderAccess()

  if (access.loading) {
    return (
      <div className="max-w-6xl mx-auto animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-16 bg-gray-100 rounded-xl mb-6" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (access.canWrite) {
    return (
      <>
        <ProviderAccessBanner {...access} />
        {children}
      </>
    )
  }

  // Suspended lock screen
  if (access.state === 'suspended') {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 md:py-24 px-6 text-center">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
            <ShieldOff className="text-red-400" size={32} />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">Provider subscription suspended</h2>
          <p className="text-gray-500 text-sm max-w-md mb-2">
            Access to {featureName.toLowerCase()} is unavailable while the subscription is suspended.
          </p>
          <p className="text-gray-400 text-sm max-w-md mb-8">
            Contact support to resolve the suspension and restore full access.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link href="/provider/support"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors shadow-sm">
              <LifeBuoy size={16} /> Contact Support
            </Link>
            <button onClick={() => router.back()}
              className="inline-flex items-center gap-1 px-5 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Lapsed lock screen
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col items-center justify-center py-16 md:py-24 px-6 text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-6">
          <Lock className="text-gray-400" size={32} />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
          {featureName} requires a subscription
        </h2>
        <p className="text-gray-500 text-sm max-w-md mb-8">
          Your provider&apos;s trial has ended. Subscribe to unlock{' '}
          {featureName.toLowerCase()} and continue operating.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link href="/provider/subscription"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            <Sparkles size={16} /> View Plans <ArrowRight size={16} />
          </Link>
          <button onClick={() => router.back()}
            className="inline-flex items-center gap-1 px-5 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}