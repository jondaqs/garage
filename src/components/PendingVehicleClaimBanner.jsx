// src/components/PendingVehicleClaimBanner.jsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Car, ArrowRight, Clock, X } from 'lucide-react'
import Link from 'next/link'

/**
 * Displays banners for pending vehicle claims.
 *
 * Props:
 *  - companyId (optional) – when set, only shows company-targeted claims
 *  - onClaimsLoaded(claims) – callback with the claims array (for badge counts)
 *  - compact – if true, renders a minimal one-liner (for sidebar badge use)
 *  - basePath – base URL for the "Add Vehicle" link (default: '/dashboard/vehicles/add')
 */
export default function PendingVehicleClaimBanner({
  companyId = null,
  onClaimsLoaded = null,
  compact = false,
  basePath = '/dashboard/vehicles/add',
}) {
  const supabase = createClient()
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(new Set())

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc('get_pending_vehicle_claims')
        if (error) { console.error('Failed to load vehicle claims:', error); return }

        let parsed = []
        if (typeof data === 'string') {
          try { parsed = JSON.parse(data) } catch { parsed = [] }
        } else if (Array.isArray(data)) {
          parsed = data
        } else {
          parsed = []
        }

        // Filter by company if specified
        if (companyId) {
          parsed = parsed.filter(c => c.target_company_id === companyId)
        } else {
          parsed = parsed.filter(c => c.claim_type === 'individual' || !c.target_company_id)
        }

        setClaims(parsed)
        if (onClaimsLoaded) onClaimsLoaded(parsed)
      } catch (err) {
        console.error('Vehicle claims error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleClaims = claims.filter(c => !dismissed.has(c.claim_id))

  if (loading || visibleClaims.length === 0) return null

  if (compact) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-orange-500 rounded-full">
        {visibleClaims.length}
      </span>
    )
  }

  return (
    <div className="space-y-3 mb-6">
      {visibleClaims.map((claim) => {
        const details = claim.vehicle_details || {}
        const plate = details.plate_number || '—'
        const vehicleDesc = [details.year, details.make, details.model].filter(Boolean).join(' ')
        const expiresAt = claim.expires_at ? new Date(claim.expires_at) : null
        const daysLeft = expiresAt
          ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : null

        const addUrl = companyId
          ? `${basePath || `/dashboard/company/${companyId}/fleet/add`}?claim_id=${claim.claim_id}`
          : `${basePath}?claim_id=${claim.claim_id}`

        return (
          <div
            key={claim.claim_id}
            className="relative flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-xl"
          >
            <button
              onClick={() => setDismissed(prev => new Set([...prev, claim.claim_id]))}
              className="absolute top-2 right-2 p-1 text-amber-400 hover:text-amber-600 transition"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>

            <div className="p-2 rounded-lg bg-amber-100 flex-shrink-0">
              <Car size={20} className="text-amber-600" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                <span className="font-semibold">{claim.provider_name || 'A service provider'}</span>
                {' '}serviced vehicle{' '}
                <span className="font-mono font-semibold">{plate}</span>
                {vehicleDesc ? ` (${vehicleDesc})` : ''}
                {' '}and suggested adding it to your profile
              </p>

              {claim.work_order_number && (
                <p className="text-xs text-amber-600 mt-1">
                  Work order: {claim.work_order_number}
                </p>
              )}

              <div className="flex items-center gap-4 mt-3 flex-wrap">
                <Link
                  href={addUrl}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition"
                >
                  Add this vehicle
                  <ArrowRight size={14} />
                </Link>

                {daysLeft !== null && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                    <Clock size={12} />
                    {daysLeft === 0 ? 'Expires today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}