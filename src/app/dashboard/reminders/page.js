'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Bell, BellOff, Calendar, Gauge, Car, Wrench,
  CheckCircle, AlertCircle, Loader2, ChevronRight, Plus, RefreshCw
} from 'lucide-react'
import SubscriptionGate from '@/components/SubscriptionGate'

const PRIORITY_COLORS = {
  low:    'border-gray-200 bg-white',
  normal: 'border-blue-200 bg-blue-50/30',
  high:   'border-orange-200 bg-orange-50/30',
  urgent: 'border-red-200 bg-red-50/30',
}

const PRIORITY_DOT = {
  low:    'bg-gray-400',
  normal: 'bg-blue-500',
  high:   'bg-orange-500',
  urgent: 'bg-red-500',
}
const PRIORITY_TAG = {
  low:    'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}
const PRIORITY_LABEL = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
}

export default function RemindersPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [reminders, setReminders]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [filter, setFilter]         = useState('active')   // 'active' | 'dismissed' | 'all'

  useEffect(() => { loadReminders() }, [])

  const loadReminders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile  } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

      const { data, error: err } = await supabase
        .from('reminders')
        .select(`
          id, title, message, reminder_type, trigger_value,
          scheduled_at, sent_at, is_active, created_at,
          vehicle:vehicles_secure(id, plate_number, make, model),
          recommendation:maintenance_recommendations(
            id, note, priority, recommended_mileage, recommended_date,
            service:services(name),
            work_order:work_orders_secure(id, work_order_number)
          )
        `)
        .eq('user_id', profile.id)
        .order('scheduled_at', { ascending: true })

      if (err) throw err
      setReminders(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true); setError(''); setSuccess('')
    await loadReminders()
    setRefreshing(false)
  }

  const handleDismiss = async (reminderId) => {
    try {
      await supabase.from('reminders')
        .update({ is_active: false })
        .eq('id', reminderId)
      setSuccess('Reminder dismissed')
      setReminders(r => r.filter(rem => rem.id !== reminderId))
    } catch (e) { setError(e.message) }
  }

  const handleAcknowledgeRec = async (recId, reminderId) => {
    try {
      await supabase.from('maintenance_recommendations')
        .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
        .eq('id', recId)
      await supabase.from('reminders')
        .update({ is_active: false, sent_at: new Date().toISOString() })
        .eq('id', reminderId)
      setSuccess('Acknowledged — we\'ll remind you closer to the due date.')
      await loadReminders()
    } catch (e) { setError(e.message) }
  }

  const active   = reminders.filter(r => r.is_active)
  const dismissed = reminders.filter(r => !r.is_active)

  // A reminder is overdue when the recommended SERVICE date has passed,
  // not when scheduled_at has passed. scheduled_at is the notification
  // fire time (e.g. day-before), which is always before the due date.
  const isReminderOverdue = (r) => {
    const recDate = r.recommendation?.recommended_date
    if (recDate) return new Date(recDate) < new Date(new Date().toDateString())
    // Mileage-only: fall back to scheduled_at as a rough proxy
    return r.scheduled_at && new Date(r.scheduled_at) < new Date()
  }
  const overdue  = active.filter(isReminderOverdue)

  const filtered = filter === 'active' ? active
    : filter === 'dismissed' ? dismissed
    : reminders

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  return (
    <SubscriptionGate
      featureName="Reminders"
      featureDescription="Get notified about upcoming maintenance, service due dates, and scheduled inspections."
    >
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bell size={24} className="text-green-600" /> Service Reminders
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {active.length} active reminder{active.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
            title="Refresh reminders"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        {/* Filter */}
        <div className="flex gap-2">
          {[
            { value: 'active',    label: 'Active'    },
            { value: 'dismissed', label: 'Dismissed' },
            { value: 'all',       label: 'All'       },
          ].map(f => (
            <button key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

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

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-300 rounded-xl flex items-center gap-3">
          <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
          <div>
            <p className="font-semibold text-red-900 text-sm">
              {overdue.length} overdue reminder{overdue.length > 1 ? 's' : ''}
            </p>
            <p className="text-red-700 text-xs mt-0.5">
              Your vehicle(s) are past their recommended service date or mileage.
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Bell className="mx-auto text-gray-300 mb-4" size={44} />
          <h3 className="text-base font-medium text-gray-900 mb-2">
            {filter === 'dismissed' ? 'No dismissed reminders' : filter === 'all' ? 'No reminders yet' : 'No active reminders'}
          </h3>
          <p className="text-gray-500 text-sm">
            {filter === 'active'
              ? 'Reminders are created automatically when your mechanic adds maintenance recommendations after a service.'
              : 'Try switching the filter above.'}
          </p>
          {filter === 'active' && (
            <button
              onClick={() => router.push('/dashboard/bookings')}
              className="mt-4 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              Book a Service
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rem => {
            const rec      = rem.recommendation
            const priority = rec?.priority || 'normal'
            const isOverdue = rem.is_active && isReminderOverdue(rem)
            const isDismissed = !rem.is_active

            return (
              <div key={rem.id}
                className={`rounded-xl border p-4 ${
                  isDismissed
                    ? 'border-gray-200 bg-gray-50 opacity-70'
                    : isOverdue ? 'border-red-300 bg-red-50/40' : PRIORITY_COLORS[priority]
                }`}>
                <div className="flex items-start gap-3">
                  {/* Priority dot */}
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                    isDismissed ? 'bg-gray-300' : isOverdue ? 'bg-red-500' : PRIORITY_DOT[priority]
                  }`} />

                  <div className="flex-1 min-w-0">
                    {/* Title row — service name + priority tag + overdue badge */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                        <Wrench size={13} className="text-gray-400" />
                        {rec?.service?.name || rem.title || 'Service Due'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isDismissed ? 'bg-gray-200 text-gray-500' : PRIORITY_TAG[priority]
                      }`}>
                        {isDismissed ? 'Dismissed' : PRIORITY_LABEL[priority]}
                      </span>
                      {isOverdue && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                          OVERDUE
                        </span>
                      )}
                    </div>

                    {/* Vehicle */}
                    {rem.vehicle && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mb-1.5">
                        <Car size={11} />
                        {rem.vehicle.plate_number}
                        {rem.vehicle.make && ` · ${rem.vehicle.make} ${rem.vehicle.model}`}
                      </p>
                    )}

                    {/* Mechanic note */}
                    {rec?.note && (
                      <p className="text-sm text-gray-700 mb-2">{rec.note}</p>
                    )}

                    {/* Due info + WO link */}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      {rec?.recommended_mileage && (
                        <span className="flex items-center gap-1">
                          <Gauge size={11} /> Due at {rec.recommended_mileage.toLocaleString()} km
                        </span>
                      )}
                      {rec?.recommended_date && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          Due {new Date(rec.recommended_date).toLocaleDateString('en-KE', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </span>
                      )}
                      {rec?.work_order?.id && (
                        <button
                          onClick={() => router.push(`/dashboard/work-orders/${rec.work_order.id}`)}
                          className="text-blue-500 hover:text-blue-700"
                        >
                          WO {rec.work_order.work_order_number}
                        </button>
                      )}
                    </div>

                    {/* CTA prompt — only for active reminders */}
                    {!isDismissed && (rec?.recommended_date || rec?.recommended_mileage) && (
                      <p className="text-xs text-green-700 mt-2 font-medium">
                        Book a service now to stay on schedule.
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {rem.vehicle?.id && (
                      <button
                        onClick={() => router.push(`/dashboard/bookings/book?vehicle=${rem.vehicle?.id}`)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 whitespace-nowrap"
                      >
                        Book Service
                      </button>
                    )}
                    {!isDismissed && rec?.id && (
                      <button
                        onClick={() => handleAcknowledgeRec(rec.id, rem.id)}
                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50 whitespace-nowrap"
                      >
                        Acknowledge
                      </button>
                    )}
                    {!isDismissed && (
                      <button
                        onClick={() => handleDismiss(rem.id)}
                        className="px-3 py-1.5 text-gray-400 hover:text-gray-600 text-xs whitespace-nowrap"
                      >
                        Dismiss
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
    </SubscriptionGate>
  )
}