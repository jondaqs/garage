'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { DollarSign, TrendingUp, FileText, Loader2, ChevronRight } from 'lucide-react'

export default function VehicleSpendWidget({ vehicleId, compact = false }) {
  const supabase = createClient()
  const router   = useRouter()

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vehicleId) return
    loadSpend()
  }, [vehicleId])

  const loadSpend = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result } = await supabase.rpc('get_vehicle_spend_summary', {
        p_vehicle_id:      vehicleId,
        p_requesting_user: user.id,
      })
      if (result?.success) setData(result)
    } catch {}
    finally { setLoading(false) }
  }

  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

  if (loading) return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="animate-spin text-gray-400" size={18} />
    </div>
  )

  if (!data) return null

  // Compact mode — single line for use in vehicle cards
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <DollarSign size={12} className="text-gray-400" />
        <span>{fmt(data.all_time_total)} spent · {data.service_count || 0} service{data.service_count !== 1 ? 's' : ''}</span>
      </div>
    )
  }

  // Full widget
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <DollarSign size={16} className="text-green-600" /> Service Spend
      </h3>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-1">This Month</p>
          <p className="text-base font-bold text-gray-900">
            {fmt(data.this_month_total)}
          </p>
        </div>
        <div className="text-center border-x border-gray-100">
          <p className="text-xs text-gray-400 mb-1">This Year</p>
          <p className="text-base font-bold text-gray-900">
            {fmt(data.this_year_total)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-1">All Time</p>
          <p className="text-base font-bold text-gray-900">
            {fmt(data.all_time_total)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
        <span>{data.service_count || 0} service{data.service_count !== 1 ? 's' : ''} total</span>
        {data.last_service_date && (
          <span>Last: {new Date(data.last_service_date).toLocaleDateString('en-KE', {
            day: 'numeric', month: 'short', year: 'numeric'
          })}</span>
        )}
      </div>

      {/* Recent invoices */}
      {data.recent_invoices?.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recent Invoices</p>
          {data.recent_invoices.map((inv, i) => (
            <button key={inv.id || i}
              onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className={inv.status === 'paid' ? 'text-green-500' : 'text-yellow-500'} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(inv.issued_at).toLocaleDateString('en-KE', {
                      day: 'numeric', month: 'short'
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className={`text-xs font-semibold ${
                  inv.status === 'paid' ? 'text-green-700' : 'text-yellow-700'
                }`}>
                  {fmt(inv.total_amount)}
                </span>
                <ChevronRight size={12} className="text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}