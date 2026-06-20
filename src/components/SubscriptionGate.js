'use client'

import { useRouter } from 'next/navigation'
import { Lock, ArrowRight, Sparkles, ShieldOff, LifeBuoy } from 'lucide-react'
import Link from 'next/link'
import useTrialStatus from '@/hooks/useTrialStatus'
import TrialBanner from '@/components/TrialBanner'

/**
 * SubscriptionGate
 *
 * Deny-by-default wrapper for premium feature pages.
 *
 * The single gate: canAccessPremium (from useTrialStatus)
 *   true  → render children (with optional banners)
 *   false → render lock screen (variant depends on reason flags)
 *
 * NOTE: This is a UI gate. Server-side enforcement uses
 * has_premium_access() in RLS policies and RPC guards.
 */
export default function SubscriptionGate({
  featureName = 'This feature',
  featureDescription = '',
  children,
}) {
  const router = useRouter()
  const {
    loading,
    canAccessPremium,
    hasActiveSubscription,
    isSuspended,
    isOnTrial,
    trialEndsAt,
    daysRemaining,
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

  // ═══════════════════════════════════════════════════════════════════════
  //  ACCESS GRANTED — canAccessPremium is true
  // ═══════════════════════════════════════════════════════════════════════
  if (canAccessPremium) {
    // Active subscription → clean render, no banners
    if (hasActiveSubscription) {
      return <>{children}</>
    }

    // On trial → show banners + children
    return (
      <>
        {isSuspended && (
          <div className="flex items-start gap-3 p-3 md:p-4 mb-4 md:mb-6 rounded-xl border border-red-300 bg-red-50">
            <ShieldOff size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">Your subscription has been suspended</p>
              <p className="text-xs md:text-sm text-red-600 mt-0.5">
                You still have trial access to {featureName.toLowerCase()} until the trial ends.
                Contact support to resolve the suspension.
              </p>
            </div>
            <Link href="/dashboard/support"
              className="hidden md:inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors">
              <LifeBuoy size={12} /> Support
            </Link>
          </div>
        )}
        {/* Desktop trial banner */}
        <div className="hidden md:block">
          <TrialBanner
            daysRemaining={daysRemaining}
            trialEndsAt={trialEndsAt}
            featureName={featureName}
          />
        </div>
        {/* Mobile trial banner */}
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

  // ═══════════════════════════════════════════════════════════════════════
  //  ACCESS DENIED — canAccessPremium is false
  //  Choose the appropriate lock screen based on reason
  // ═══════════════════════════════════════════════════════════════════════

  // ── Suspended + no trial → suspension lock screen ─────────────────────
  if (isSuspended) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 md:py-24 px-6 text-center">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
            <ShieldOff className="text-red-400" size={32} />
          </div>

          <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-2">
            Your subscription has been suspended
          </h2>

          <p className="text-gray-500 text-sm max-w-md mb-2">
            Access to {featureName.toLowerCase()} and other premium features is
            unavailable while your subscription is suspended and your free trial has ended.
          </p>

          <p className="text-gray-400 text-sm max-w-md mb-8">
            Contact support to resolve the suspension, or subscribe to a new plan
            to regain access.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link href="/dashboard/support"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors shadow-sm">
              <LifeBuoy size={16} /> Contact Support
            </Link>
            <Link href="/dashboard/subscription"
              className="inline-flex items-center gap-1 px-5 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              View Subscription
            </Link>
            <button onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-1 px-5 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Default: trial expired / free tier / no subscription → subscribe ──
  return (
    <div className="max-w-6xl mx-auto">
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
          <Link href="/dashboard/subscription"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            <Sparkles size={16} /> View Subscription Plans <ArrowRight size={16} />
          </Link>
          <button onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-1 px-5 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Back to Dashboard
          </button>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
          {[
            { title: 'Budget Tracking', desc: 'Set limits and monitor vehicle spending' },
            { title: 'Service Reports', desc: 'Work orders, providers, and downtime analytics' },
            { title: 'Smart Reminders', desc: 'Never miss scheduled maintenance again' },
          ].map((item) => (
            <div key={item.title}
              className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-left">
              <p className="text-sm font-semibold text-gray-700 mb-1">{item.title}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}