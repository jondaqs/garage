'use client'

import Link from 'next/link'
import { Clock, AlertTriangle, ShieldOff, Sparkles, LifeBuoy, Wrench, Users } from 'lucide-react'

/**
 * ProviderAccessBanner
 * Displays contextual banner on provider pages based on subscription state.
 */
export default function ProviderAccessBanner({
  state, canWrite, daysRemaining, trialEndsAt,
  maxStaff, maxShops, currentStaff, currentShops,
  planName, compact = false,
}) {
  if (!state || state === 'subscribed') return null

  if (state === 'trial') {
    const urgent = daysRemaining != null && daysRemaining <= 7
    const trialDate = trialEndsAt
      ? trialEndsAt.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
      : null

    if (compact) {
      return (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${urgent ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
          <Clock size={16} className={urgent ? 'text-amber-500' : 'text-blue-500'} />
          <p className={`text-xs font-medium flex-1 ${urgent ? 'text-amber-800' : 'text-blue-800'}`}>
            {planName} · {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left
            <span className="font-normal opacity-70 ml-1">
              ({currentStaff}/{maxStaff} staff · {currentShops}/{maxShops} shop{maxShops !== 1 ? 's' : ''})
            </span>
          </p>
          <Link href="/provider/subscription" className={`text-xs font-medium px-2 py-1 rounded-lg ${urgent ? 'text-amber-700 bg-amber-100' : 'text-blue-700 bg-blue-100'}`}>
            Subscribe
          </Link>
        </div>
      )
    }

    return (
      <div className={`flex items-start gap-3 p-4 mb-6 rounded-xl border ${urgent ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
        <Clock size={20} className={`mt-0.5 flex-shrink-0 ${urgent ? 'text-amber-500' : 'text-blue-500'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${urgent ? 'text-amber-800' : 'text-blue-800'}`}>
            {planName} — {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
          </p>
          <p className={`text-xs mt-0.5 ${urgent ? 'text-amber-600' : 'text-blue-600'}`}>
            {trialDate ? `Ends ${trialDate}. ` : ''}Subscribe before the trial ends to keep full access.
          </p>
          <div className="flex items-center gap-4 mt-2">
            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
              <Users size={12} /> {currentStaff}/{maxStaff} staff
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
              <Wrench size={12} /> {currentShops}/{maxShops} shop{maxShops !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <Link href="/provider/subscription" className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${urgent ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <Sparkles size={12} /> Subscribe
        </Link>
      </div>
    )
  }

  if (state === 'lapsed') {
    if (compact) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-amber-300 bg-amber-50">
          <AlertTriangle size={16} className="text-amber-500" />
          <p className="text-xs font-medium text-amber-800 flex-1">Trial ended — view-only mode</p>
          <Link href="/provider/subscription" className="text-xs font-medium px-2 py-1 rounded-lg text-white bg-amber-600">Subscribe</Link>
        </div>
      )
    }
    return (
      <div className="flex items-start gap-3 p-4 mb-6 rounded-xl border border-amber-300 bg-amber-50">
        <AlertTriangle size={20} className="text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800">Your provider&apos;s trial has ended</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Your provider is in view-only mode. You cannot create work orders, accept bookings,
            or manage inventory. Subscribe to restore full access.
          </p>
        </div>
        <Link href="/provider/subscription" className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          <Sparkles size={14} /> View Plans
        </Link>
      </div>
    )
  }

  if (state === 'suspended') {
    if (compact) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-300 bg-red-50">
          <ShieldOff size={16} className="text-red-500" />
          <p className="text-xs font-medium text-red-800 flex-1">Subscription suspended — view-only</p>
          <Link href="/provider/support" className="text-xs font-medium px-2 py-1 rounded-lg text-red-700 bg-red-100">Support</Link>
        </div>
      )
    }
    return (
      <div className="flex items-start gap-3 p-4 mb-6 rounded-xl border border-red-300 bg-red-50">
        <ShieldOff size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-800">Provider subscription suspended</p>
          <p className="text-xs text-red-600 mt-0.5">
            Your provider is in view-only mode while the subscription is suspended.
            Contact support to resolve this and restore full access.
          </p>
        </div>
        <Link href="/provider/support" className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors">
          <LifeBuoy size={12} /> Contact Support
        </Link>
      </div>
    )
  }

  return null
}