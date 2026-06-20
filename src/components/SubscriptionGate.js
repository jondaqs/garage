'use client'

import { useRouter } from 'next/navigation'
import { Lock, ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import useTrialStatus from '@/hooks/useTrialStatus'
import TrialBanner from '@/components/TrialBanner'

/**
 * SubscriptionGate
 *
 * Wraps feature pages that require at least a Basic trial:
 *   budget · reports · reminders · history
 *
 * Behaviour:
 *   • Active subscription → render children, no banner
 *   • On trial           → render children with TrialBanner at top
 *   • Trial expired      → full-page lock overlay with upgrade prompt
 *   • Free tier (vehicle-count only, no time trial) → treat like expired
 *     for these premium features
 *   • Loading            → skeleton
 *
 * Props:
 *   featureName – human label e.g. "Budget & Spend"
 *   featureDescription – one-liner explaining what the feature does
 *   children    – the page content to render when access is granted
 */
export default function SubscriptionGate({
  featureName = 'This feature',
  featureDescription = '',
  children,
}) {
  const router = useRouter()
  const {
    loading,
    hasActiveSubscription,
    isOnTrial,
    isTrialExpired,
    trialEndsAt,
    daysRemaining,
    isFreeUser,
  } = useTrialStatus()

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-16 bg-gray-100 rounded-xl mb-6" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  // ── Active subscription → full access, no banner ────────────────────────
  if (hasActiveSubscription) {
    return <>{children}</>
  }

  // ── On trial → show page with trial banner at top ───────────────────────
  if (isOnTrial) {
    return (
      <>
        {/* Desktop banner */}
        <div className="hidden md:block">
          <TrialBanner
            daysRemaining={daysRemaining}
            trialEndsAt={trialEndsAt}
            featureName={featureName}
          />
        </div>
        {/* Mobile banner */}
        <div className="md:hidden mb-4">
          <TrialBanner
            daysRemaining={daysRemaining}
            trialEndsAt={trialEndsAt}
            featureName={featureName}
            compact
          />
        </div>
        {children}
      </>
    )
  }

  // ── Trial expired / free-tier user → lock screen ────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* The restrictive overlay */}
      <div className="flex flex-col items-center justify-center py-16 md:py-24 px-6 text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gray-100 flex items-center justify-center mb-6">
          <Lock className="text-gray-400" size={32} />
        </div>

        <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
          {featureName} requires a subscription
        </h2>

        {featureDescription && (
          <p className="text-gray-500 text-sm md:text-base max-w-md mb-2">
            {featureDescription}
          </p>
        )}

        <p className="text-gray-500 text-sm max-w-md mb-8">
          Your free Basic trial has ended. Subscribe to a plan to unlock{' '}
          {featureName.toLowerCase()} and other premium features.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/dashboard/subscription"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Sparkles size={16} />
            View Subscription Plans
            <ArrowRight size={16} />
          </Link>

          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-1 px-5 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        {/* Feature highlights to motivate upgrade */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
          {[
            { title: 'Budget Tracking', desc: 'Set limits and monitor vehicle spending' },
            { title: 'Service Reports', desc: 'Work orders, providers, and downtime analytics' },
            { title: 'Smart Reminders', desc: 'Never miss scheduled maintenance again' },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-left"
            >
              <p className="text-sm font-semibold text-gray-700 mb-1">{item.title}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}