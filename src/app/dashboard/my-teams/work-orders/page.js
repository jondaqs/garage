'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Wrench, CheckCircle, XCircle, AlertCircle,
  Loader2, RefreshCw, ClipboardList, Car
} from 'lucide-react'

const STATUS_COLORS = {
  intake:            'bg-gray-100 text-gray-600',
  assigned:          'bg-blue-100 text-blue-700',
  diagnosing:        'bg-purple-100 text-purple-700',
  awaiting_approval: 'bg-yellow-100 text-yellow-700',
  approved:          'bg-cyan-100 text-cyan-700',
  in_progress:       'bg-orange-100 text-orange-700',
  quality_check:     'bg-indigo-100 text-indigo-700',
  rework:            'bg-red-100 text-red-700',
  completed:         'bg-green-100 text-green-700',
  cancelled:         'bg-red-100 text-red-500',
  closed:            'bg-gray-100 text-gray-500',
}

const ASSIGN_BADGE = {
  pending:      { cls: 'bg-yellow-100 text-yellow-700', label: '⏳ Awaiting response' },
  acknowledged: { cls: 'bg-green-100  text-green-700',  label: '✓ Acknowledged'       },
  declined:     { cls: 'bg-gray-100   text-gray-500',   label: 'Declined'             },
}

export default function MechanicWorkOrdersPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [workOrders,      setWorkOrders]      = useState([])
  const [loading,         setLoading]         = useState(true)
  const [refreshing,      setRefreshing]      = useState(false)
  const [error,           setError]           = useState('')
  const [acknowledging,   setAcknowledging]   = useState(null)
  const [declineReason,   setDeclineReason]   = useState('')
  const [showDeclineForm, setShowDeclineForm] = useState(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else         setRefreshing(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc(
        'get_mechanic_assigned_work_orders',
        { p_mechanic_user_id: user.id }
      )
      if (rpcErr) throw rpcErr
      setWorkOrders(result?.work_orders || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const acknowledgeWO = async (woId) => {
    setAcknowledging(woId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.rpc('acknowledge_work_order_assignment', {
        p_work_order_id:    woId,
        p_mechanic_user_id: user.id,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      await load(true)
    } catch (e) { alert(e.message) }
    finally { setAcknowledging(null) }
  }

  const declineWO = async (woId) => {
    setAcknowledging(woId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.rpc('decline_work_order_assignment', {
        p_work_order_id:    woId,
        p_mechanic_user_id: user.id,
        p_decline_reason:   declineReason || null,
      })
      if (error) throw error
      if (!data.success) throw new Error(data.error)
      setShowDeclineForm(null)
      setDeclineReason('')
      await load(true)
    } catch (e) { alert(e.message) }
    finally { setAcknowledging(null) }
  }

  // ── Grouped by provider ───────────────────────────────────────────────────
  const grouped = workOrders.reduce((acc, wo) => {
    const key = wo.provider?.name || 'Unknown Garage'
    if (!acc[key]) acc[key] = []
    acc[key].push(wo)
    return acc
  }, {})

  const pending      = workOrders.filter(w => w.mechanic_assignment_status === 'pending')
  const acknowledged = workOrders.filter(w => w.mechanic_assignment_status === 'acknowledged')

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assigned Work Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Work orders assigned to you by your service provider(s)
          </p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Summary pills */}
      {workOrders.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <span className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm font-medium text-blue-700">
            {workOrders.length} total
          </span>
          {pending.length > 0 && (
            <span className="px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full text-sm font-medium text-yellow-700">
              {pending.length} awaiting response
            </span>
          )}
          {acknowledged.length > 0 && (
            <span className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-sm font-medium text-green-700">
              {acknowledged.length} in progress
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {workOrders.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ClipboardList className="mx-auto text-gray-300 mb-3" size={48} />
          <p className="font-semibold text-gray-600">No assigned work orders</p>
          <p className="text-sm text-gray-400 mt-1">
            Work orders assigned to you by a service provider will appear here.
          </p>
        </div>
      )}

      {/* Work orders grouped by provider */}
      {Object.entries(grouped).map(([providerName, wos]) => (
        <div key={providerName}>
          {/* Provider group header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-green-600 rounded-md flex items-center justify-center flex-shrink-0">
              <Wrench size={12} className="text-white" />
            </div>
            <h2 className="text-sm font-semibold text-gray-700">{providerName}</h2>
            <span className="text-xs text-gray-400">({wos.length})</span>
          </div>

          <div className="space-y-3">
            {wos.map(wo => {
              const assignBadge = ASSIGN_BADGE[wo.mechanic_assignment_status] || ASSIGN_BADGE.pending
              const isPending      = wo.mechanic_assignment_status === 'pending'
              const isAcknowledged = wo.mechanic_assignment_status === 'acknowledged'
              const isActioning    = acknowledging === wo.id

              return (
                <div key={wo.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{wo.work_order_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[wo.status?.code] || 'bg-gray-100 text-gray-600'}`}>
                          {wo.status?.display_name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${assignBadge.cls}`}>
                          {assignBadge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-600">
                        <Car size={13} className="flex-shrink-0" />
                        <span className="font-medium">{wo.vehicle?.plate_number}</span>
                        {wo.vehicle?.make && (
                          <span className="text-gray-400">· {wo.vehicle.make} {wo.vehicle.model || ''}</span>
                        )}
                      </div>
                      {wo.problem_description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2 italic">
                          "{wo.problem_description}"
                        </p>
                      )}
                    </div>

                    {/* Permissions badges */}
                    <div className="flex-shrink-0 flex flex-col gap-1 items-end">
                      {wo.mechanic_permissions?.can_approve_work && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">WO access</span>
                      )}
                      {wo.mechanic_permissions?.can_manage_inventory && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Inventory</span>
                      )}
                    </div>
                  </div>

                  {/* Decline form */}
                  {showDeclineForm === wo.id && (
                    <div className="mb-3 space-y-2">
                      <textarea
                        value={declineReason}
                        onChange={e => setDeclineReason(e.target.value)}
                        placeholder="Reason for declining (optional)..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-red-300"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => declineWO(wo.id)} disabled={isActioning}
                          className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                          {isActioning ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                          Confirm Decline
                        </button>
                        <button onClick={() => { setShowDeclineForm(null); setDeclineReason('') }}
                          className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">
                      Opened {new Date(wo.opened_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>

                    <div className="flex gap-2 flex-wrap">
                      {/* Always: View Details */}
                      <button
                        onClick={() => router.push(`/dashboard/my-teams/work-order/${wo.id}`)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                      >
                        {isAcknowledged ? 'Open Work Order' : 'View Details'}
                      </button>

                      {/* Pending: Acknowledge + Decline */}
                      {isPending && showDeclineForm !== wo.id && (
                        <>
                          <button onClick={() => acknowledgeWO(wo.id)} disabled={isActioning}
                            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
                            {isActioning
                              ? <Loader2 size={13} className="animate-spin" />
                              : <CheckCircle size={13} />}
                            Acknowledge
                          </button>
                          <button onClick={() => setShowDeclineForm(wo.id)}
                            className="px-4 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
                            Decline
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}