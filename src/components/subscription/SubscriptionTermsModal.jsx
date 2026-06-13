// src/components/subscription/SubscriptionTermsModal.jsx
'use client'

/**
 * Reusable Subscription Terms & Conditions Modal
 *
 * Shows subscription T&C that user must accept before subscribing.
 * Used by SubscriptionManager and can be reused anywhere.
 *
 * Props:
 *   isOpen       - boolean, controls visibility
 *   onClose      - function, called when modal is dismissed
 *   onAccept     - function, called when user accepts and confirms
 *   packageName  - string, the package being subscribed to
 *   packageCost  - string/number, formatted cost
 *   isUpgrade    - boolean, whether this is an upgrade from existing plan
 *   upgradeCredit - string, formatted credit amount (if upgrade)
 *   currentPlan  - string, name of current active plan (if upgrade)
 *   loading      - boolean, shows spinner on confirm button
 */

import { useState } from 'react'
import { X, AlertTriangle, ArrowUpRight, Shield, Clock, Ban, Check, Loader2 } from 'lucide-react'

export default function SubscriptionTermsModal({
  isOpen,
  onClose,
  onAccept,
  packageName = 'this plan',
  packageCost = '',
  isUpgrade = false,
  upgradeCredit = '',
  currentPlan = '',
  loading = false,
}) {
  const [agreed, setAgreed] = useState(false)

  if (!isOpen) return null

  const handleAccept = () => {
    if (!agreed) return
    onAccept()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">Subscription Terms & Conditions</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {/* Package summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-900">
              {isUpgrade ? 'Upgrading to' : 'Subscribing to'}: <span className="text-blue-700">{packageName}</span>
            </p>
            {packageCost && (
              <p className="text-xs text-blue-600 mt-1">Cost: {packageCost}</p>
            )}
            {isUpgrade && upgradeCredit && (
              <p className="text-xs text-green-600 mt-1">
                ↗ Upgrade credit from {currentPlan}: {upgradeCredit} will be applied
              </p>
            )}
          </div>

          {/* Terms */}
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Ban size={15} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">No Refunds or Downgrades</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Once you subscribe to a plan, you cannot request a refund or downgrade to a lower plan
                  until your current subscription period expires. All payments are final and non-refundable.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Clock size={15} className="text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Subscription Duration</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Your subscription will remain active for the duration of the billing period you selected.
                  You may choose not to renew at the end of the period, at which point you will revert
                  to the free tier (if available).
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <ArrowUpRight size={15} className="text-green-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Upgrades with Credit</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  You may upgrade to a higher plan at any time while your current subscription is active.
                  The remaining value of your current plan will be calculated pro-rata (based on unused days)
                  and credited towards the cost of the new plan. The credit cannot exceed the cost of the new plan
                  and cannot be withdrawn as cash.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield size={15} className="text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Activation & Payment</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Your new plan will be activated after your payment has been verified and confirmed by our team.
                  If you are upgrading, your current plan will remain active until the new plan is confirmed.
                  An invoice will be generated and sent to you upon subscription.
                </p>
              </div>
            </div>
          </div>

          {/* Warning box */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              By proceeding, you acknowledge that this subscription is <strong>non-refundable</strong> and
              cannot be downgraded until expiry. Please ensure you have selected the correct plan before confirming.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-3">
          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-900 transition-colors">
              I have read and agree to the subscription terms and conditions. I understand that this subscription
              is non-refundable and cannot be downgraded until expiry.
            </span>
          </label>

          {/* Buttons */}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleAccept} disabled={!agreed || loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {loading ? 'Processing…' : 'Accept & Subscribe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}