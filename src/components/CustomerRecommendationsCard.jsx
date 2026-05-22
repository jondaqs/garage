'use client'

import { useState } from 'react'
import { Bell, Wrench, Gauge, Calendar, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Read-only Recommendations card for the customer-side work-order pages.
 *
 * Reads `recommendations` straight off the work order (already shaped
 * by get_customer_work_order RPC) — no fetch here. Hides itself when
 * the list is empty.
 *
 * Collapsed by default. Header click toggles open/closed; the chevron
 * indicates state. Customers can have many WOs with many recs; showing
 * everything expanded would push the rest of the page below the fold.
 */
const PRIORITY_STYLES = {
  low:    'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export default function CustomerRecommendationsCard({ recommendations = [] }) {
  const [expanded, setExpanded] = useState(false)
  if (!Array.isArray(recommendations) || recommendations.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full px-5 py-3 border-b border-gray-100 flex items-center gap-2 hover:bg-gray-50 transition-colors"
      >
        <Bell className="text-blue-500 flex-shrink-0" size={16} />
        <p className="font-semibold text-gray-900 text-sm flex-1 text-left">
          Maintenance Recommendations ({recommendations.length})
        </p>
        {expanded
          ? <ChevronUp   size={16} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="p-3 space-y-2">
          {recommendations.map(rec => (
            <div key={rec.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {rec.service && (
                  <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Wrench size={13} className="text-gray-400" />
                    {rec.service.name}
                  </span>
                )}
                <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (PRIORITY_STYLES[rec.priority] || PRIORITY_STYLES.normal)}>
                  {rec.priority}
                </span>
                {rec.is_acknowledged && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Acknowledged
                  </span>
                )}
              </div>
              {rec.note && <p className="text-sm text-gray-700 whitespace-pre-line">{rec.note}</p>}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-2">
                {rec.recommended_mileage && (
                  <span className="flex items-center gap-1">
                    <Gauge size={12} /> Due at {rec.recommended_mileage.toLocaleString()} km
                  </span>
                )}
                {rec.recommended_date && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    Due {new Date(rec.recommended_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}