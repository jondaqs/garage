'use client'

/**
 * Shared company-reminders view.
 *
 * Rendered by both:
 *   • /company/reminders                            (company owner portal)
 *   • /dashboard/company/[companyId]/reminders      (company member view)
 *
 * Both routes need the same data, same filters, same actions — only the
 * outbound URLs differ (owners → /company/..., members → /dashboard/company/[id]/...).
 * The `basePath` prop drives every router.push so the component stays
 * portal-agnostic.
 *
 * Auth + company resolution lives inside the component because it handles
 * both audiences cleanly: it first looks for an owned company on the
 * caller, then falls back to an active company_users row. That same
 * resolver served both audiences in the prior monolithic page and is
 * carried over unchanged.
 */

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Bell, Calendar, Gauge, Car, Wrench,
  CheckCircle, AlertCircle, Loader2, ChevronRight,
} from 'lucide-react'

const PRIORITY_BORDER = {
  low:    'border-gray-200 bg-white',
  normal: 'border-blue-200 bg-blue-50/30',
  high:   'border-orange-200 bg-orange-50/30',
  urgent: 'border-red-200 bg-red-50/30',
}
const PRIORITY_DOT = {
  low: 'bg-gray-400', normal: 'bg-blue-500', high: 'bg-orange-500', urgent: 'bg-red-500',
}
const PRIORITY_LABEL = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
}
const PRIORITY_TAG = {
  low:    'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export default function CompanyRemindersView({ basePath = '/company' }) {
  const supabase = createClient()
  const router   = useRouter()

  const [recommendations, setRecommendations] = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState('')
  const [filter,          setFilter]          = useState('active')   // 'active' | 'all' | 'acknowledged'

  useEffect(() => { loadRecommendations() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecommendations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile  } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

      // Resolve company: owned first, then active membership.
      let companyId = null
      const { data: owned } = await supabase
        .from('company_profiles_secure').select('id').eq('owner_user_id', profile.id).maybeSingle()
      if (owned) {
        companyId = owned.id
      } else {
        const { data: mem } = await supabase
          .from('company_users').select('company_id')
          .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
        companyId = mem?.company_id
      }
      if (!companyId) { setError('No company found'); return }

      // Get all fleet vehicle IDs
      const { data: fleet } = await supabase
        .from('vehicle_ownership').select('vehicle_id')
        .eq('owner_company_id', companyId)
      const vehicleIds = fleet?.map(f => f.vehicle_id) || []
      if (vehicleIds.length === 0) { setRecommendations([]); return }

      const { data, error: err } = await supabase
        .from('maintenance_recommendations')
        .select(`
          id, note, priority, recommended_mileage, recommended_date,
          is_acknowledged, acknowledged_at, created_at,
          service:services(id, name),
          vehicle:vehicles_secure(id, plate_number, make, model),
          mechanic:mechanics(user:user_profiles_secure(first_name, last_name)),
          work_order:work_orders_secure(id, work_order_number)
        `)
        .in('vehicle_id', vehicleIds)
        .order('created_at', { ascending: false })

      if (err) throw err
      setRecommendations(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAcknowledge = async (recId) => {
    try {
      const { error: err } = await supabase
        .from('maintenance_recommendations')
        .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('id', recId)
      if (err) throw err
      setSuccess('Recommendation acknowledged')
      setRecommendations(prev => prev.map(r =>
        r.id === recId
          ? { ...r, is_acknowledged: true, acknowledged_at: new Date().toISOString() }
          : r
      ))
    } catch (e) { setError(e.message) }
  }

  const filtered = recommendations.filter(r => {
    if (filter === 'active')       return !r.is_acknowledged
    if (filter === 'acknowledged') return r.is_acknowledged
    return true
  })

  const urgentCount = recommendations.filter(r => !r.is_acknowledged && r.priority === 'urgent').length
  const highCount   = recommendations.filter(r => !r.is_acknowledged && r.priority === 'high').length
  const activeCount = recommendations.filter(r => !r.is_acknowledged).length

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell size={24} className="text-blue-600" /> Fleet Maintenance Recommendations
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} active across your fleet
          </p>
        </div>
        {/* Filter */}
        <div className="flex gap-2">
          {[
            { value: 'active',       label: 'Active'       },
            { value: 'acknowledged', label: 'Acknowledged' },
            { value: 'all',          label: 'All'          },
          ].map(f => (
            <button key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2 text-sm">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Urgent / high priority banner */}
      {(urgentCount > 0 || highCount > 0) && filter !== 'acknowledged' && (
        <div className="p-4 bg-red-50 border border-red-300 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="text-red-500 flex-shrink-0" size={18} />
            <p className="font-semibold text-red-900 text-sm">
              Urgent attention needed
            </p>
          </div>
          <p className="text-red-700 text-xs">
            {urgentCount > 0 && `${urgentCount} urgent`}
            {urgentCount > 0 && highCount > 0 && ' · '}
            {highCount > 0 && `${highCount} high priority`}
            {' '}recommendation{(urgentCount + highCount) > 1 ? 's' : ''} require immediate action.
          </p>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Bell className="mx-auto text-gray-300 mb-4" size={44} />
          <h3 className="text-base font-medium text-gray-900 mb-2">
            {filter === 'acknowledged' ? 'No acknowledged recommendations' : 'No active recommendations'}
          </h3>
          <p className="text-gray-500 text-sm">
            {filter === 'active'
              ? 'Mechanics add recommendations during service. They will appear here.'
              : 'Try switching the filter above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rec => {
            const isOverdue = rec.recommended_date && !rec.is_acknowledged
              && new Date(rec.recommended_date) < new Date()

            return (
              <div key={rec.id}
                className={`rounded-xl border p-4 ${
                  rec.is_acknowledged
                    ? 'border-gray-200 bg-gray-50 opacity-70'
                    : isOverdue
                      ? 'border-red-300 bg-red-50/40'
                      : PRIORITY_BORDER[rec.priority] || PRIORITY_BORDER.normal
                }`}>
                <div className="flex items-start gap-3">
                  {/* Priority dot */}
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                    rec.is_acknowledged ? 'bg-gray-300' : isOverdue ? 'bg-red-500' : PRIORITY_DOT[rec.priority]
                  }`} />

                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {rec.service && (
                        <span className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                          <Wrench size={13} className="text-gray-400" />
                          {rec.service.name}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        rec.is_acknowledged
                          ? 'bg-gray-200 text-gray-500'
                          : PRIORITY_TAG[rec.priority]
                      }`}>
                        {rec.is_acknowledged ? 'Acknowledged' : PRIORITY_LABEL[rec.priority]}
                      </span>
                      {isOverdue && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">OVERDUE</span>
                      )}
                    </div>

                    {/* Vehicle (portal-aware link) */}
                    {rec.vehicle && (
                      <button
                        onClick={() => router.push(`${basePath}/fleet/${rec.vehicle.id}`)}
                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-1.5 font-medium"
                      >
                        <Car size={11} />
                        {rec.vehicle.plate_number}
                        {rec.vehicle.make && ` · ${rec.vehicle.make} ${rec.vehicle.model}`}
                        <ChevronRight size={10} />
                      </button>
                    )}

                    {/* Note */}
                    {rec.note && (
                      <p className="text-sm text-gray-700 mb-2">{rec.note}</p>
                    )}

                    {/* Due info */}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      {rec.recommended_mileage && (
                        <span className="flex items-center gap-1">
                          <Gauge size={11} /> Due at {rec.recommended_mileage.toLocaleString()} km
                        </span>
                      )}
                      {rec.recommended_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          Due {new Date(rec.recommended_date).toLocaleDateString('en-KE', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </span>
                      )}
                      {rec.mechanic?.user && (
                        <span>
                          From: {rec.mechanic.user.first_name} {rec.mechanic.user.last_name}
                        </span>
                      )}
                      {rec.work_order?.id && (
                        <button
                          onClick={() => router.push(`${basePath}/work-orders/${rec.work_order.id}`)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          WO {rec.work_order.work_order_number}
                        </button>
                      )}
                    </div>

                    {/* Acknowledged info */}
                    {rec.is_acknowledged && rec.acknowledged_at && (
                      <p className="text-xs text-gray-400 mt-2">
                        Acknowledged {new Date(rec.acknowledged_at).toLocaleDateString('en-KE', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                    )}
                  </div>

                  {/* Actions
                      Book Service stays available even after acknowledgement —
                      acknowledging a recommendation only suppresses the priority
                      surfacing, the underlying need to book a service is still
                      something the user may want to act on later.
                      Acknowledge button is naturally gated to unacknowledged items. */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {rec.vehicle?.id && (
                      <button
                        onClick={() => router.push(`${basePath}/bookings/book?vehicle=${rec.vehicle.id}`)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 whitespace-nowrap"
                      >
                        Book Service
                      </button>
                    )}
                    {!rec.is_acknowledged && (
                      <button
                        onClick={() => handleAcknowledge(rec.id)}
                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50 whitespace-nowrap"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}