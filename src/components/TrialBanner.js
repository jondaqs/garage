'use client'

import Link from 'next/link'
import { Clock, Sparkles, ArrowRight } from 'lucide-react'

/**
 * TrialBanner
 *
 * Shows a contextual banner informing the user they are on a free
 * Basic trial. Displayed on the dashboard landing page and at the
 * top of gated feature pages (budget, reports, reminders, history).
 *
 * Props:
 *   daysRemaining  – integer days until trial expires
 *   trialEndsAt    – Date object (trial expiry)
 *   featureName    – optional string, e.g. "Budget & Spend" — when
 *                    provided the banner text is feature-specific
 *   compact        – boolean, render a smaller mobile-friendly variant
 */
export default function TrialBanner({
  daysRemaining = 0,
  trialEndsAt,
  featureName,
  compact = false,
}) {
  const formattedDate = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

  const urgencyColor =
    daysRemaining <= 7
      ? 'border-amber-400 bg-amber-50'
      : 'border-blue-200 bg-blue-50'

  const urgencyText =
    daysRemaining <= 7 ? 'text-amber-800' : 'text-blue-800'

  const urgencySubtext =
    daysRemaining <= 7 ? 'text-amber-600' : 'text-blue-600'

  const urgencyIcon =
    daysRemaining <= 7 ? 'text-amber-500' : 'text-blue-500'

  if (compact) {
    return (
      <Link
        href="/dashboard/subscription"
        className={`flex items-start gap-3 p-3 rounded-xl border ${urgencyColor} transition-colors hover:opacity-90`}
      >
        <Sparkles size={16} className={`${urgencyIcon} mt-0.5 flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${urgencyText}`}>
            {featureName ? `${featureName} — ` : ''}Free trial
            {daysRemaining > 0 ? ` · ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left` : ' ending soon'}
          </p>
          <p className={`text-[11px] ${urgencySubtext} mt-0.5`}>
            Ends {formattedDate}. Subscribe to keep access.
          </p>
        </div>
        <ArrowRight size={14} className={`${urgencyIcon} mt-0.5 flex-shrink-0`} />
      </Link>
    )
  }

  return (
    <div
      className={`flex items-center gap-4 p-4 mb-6 rounded-xl border ${urgencyColor} transition-colors`}
    >
      <div className={`p-2 rounded-lg ${daysRemaining <= 7 ? 'bg-amber-100' : 'bg-blue-100'}`}>
        <Clock size={20} className={urgencyIcon} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${urgencyText}`}>
          {featureName
            ? `${featureName} is part of your free Basic trial`
            : "You're on a free Basic trial"}
        </p>
        <p className={`text-sm ${urgencySubtext} mt-0.5`}>
          {daysRemaining > 0
            ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining — trial ends ${formattedDate}.`
            : `Trial ending very soon — ${formattedDate}.`}
          {' '}Subscribe to a plan to continue using{' '}
          {featureName ? featureName.toLowerCase() : 'premium features'} after the trial.
        </p>
      </div>

      <Link
        href="/dashboard/subscription"
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        View Plans <ArrowRight size={14} />
      </Link>
    </div>
  )
}