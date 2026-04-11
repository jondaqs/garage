'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Car, MapPin, User, Calendar, Clock,
  ClipboardList, AlertCircle, CheckCircle, ChevronRight,
  Wrench, Package, MessageSquare, Hash, ExternalLink,
  AlertTriangle, FileText, Loader2, ClipboardCheck
} from 'lucide-react'
import ServicesTab      from './components/ServicesTab'
import PartsTab         from './components/PartsTab'
import IssuesTab        from './components/IssuesTab'
import CommentsTab      from './components/CommentsTab'
import QualityCheckTab  from './components/QualityCheckTab'

// ─── Constants ──────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  intake:            { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-400'    },
  assigned:          { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  diagnosing:        { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500'  },
  awaiting_approval: { bg: 'bg-yellow-100',  text: 'text-yellow-700',  dot: 'bg-yellow-500'  },
  approved:          { bg: 'bg-cyan-100',    text: 'text-cyan-700',    dot: 'bg-cyan-500'    },
  in_progress:       { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  quality_check:     { bg: 'bg-indigo-100',  text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
  rework:            { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  completed:         { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500'   },
  cancelled:         { bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400'     },
  closed:            { bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-300'    },
}

const TIMELINE = [
  'intake','assigned','diagnosing','awaiting_approval',
  'approved','in_progress','quality_check','completed','closed'
]

const NEXT_STATUS_MAP = {
  intake:            [{ code: 'assigned',          label: 'Assign Mechanic',          color: 'bg-blue-600 hover:bg-blue-700'     }],
  assigned:          [{ code: 'diagnosing',         label: 'Begin Diagnostics',        color: 'bg-purple-600 hover:bg-purple-700' }],
  diagnosing:        [{ code: 'awaiting_approval',  label: 'Send Estimate for Approval', color: 'bg-yellow-500 hover:bg-yellow-600' }],
  approved:          [{ code: 'in_progress',        label: 'Start Service',            color: 'bg-orange-500 hover:bg-orange-600' }],
  in_progress:       [{ code: 'quality_check',      label: 'Submit for QC',            color: 'bg-indigo-600 hover:bg-indigo-700' }],
  quality_check:     [
    { code: 'completed',    label: 'Complete Work Order',   color: 'bg-green-600 hover:bg-green-700', via_api: true },
    { code: 'rework',       label: 'QC Failed — Rework',   color: 'bg-red-600 hover:bg-red-700'     },
  ],
  rework:            [{ code: 'quality_check',      label: 'Resubmit for QC',          color: 'bg-indigo-600 hover:bg-indigo-700' }],
  completed:         [{ code: 'closed',             label: 'Close Work Order',         color: 'bg-gray-600 hover:bg-gray-700'    }],
}

const TABS = [
  { id: 'overview',  label: 'Overview',   icon: ClipboardList  },
  { id: 'services',  label: 'Services',   icon: Wrench         },
  { id: 'parts',     label: 'Parts',      icon: Package        },
  { id: 'issues',    label: 'Issues',     icon: AlertTriangle  },
  { id: 'qc',        label: 'QC & Complete', icon: ClipboardCheck },
  { id: 'comments',  label: 'Comments',   icon: MessageSquare  },
]

// ─── Component ───────────────────────────────────────────────────────────────
export default function WorkOrderDetailPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [wo, setWo]                   = useState(null)
  const [mechanics, setMechanics]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [updating, setUpdating]       = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [activeTab, setActiveTab]     = useState('overview')
  const [sendingEstimate, setSendingEstimate] = useState(false)
  const [estimate, setEstimate]       = useState(null)

  // Check-in
  const [showCheckin, setShowCheckin]           = useState(false)
  const [checkinMileage, setCheckinMileage]     = useState('')
  // Assign mechanic
  const [selectedMechanic, setSelectedMechanic] = useState('')
  // Internal notes (overview tab)
  const [internalNote, setInternalNote]         = useState('')
  const [savingNote, setSavingNote]             = useState(false)

  // ── Load work order ─────────────────────────────────────────────────────
  const loadWorkOrder = useCallback(async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()

      // Try RPC first
      const { data: result, error: rpcErr } = await supabase.rpc(
        'get_work_order_with_details',
        { p_work_order_id: params.id, p_requesting_user_id: user.id }
      )

      if (!rpcErr && result?.success) {
        setWo(result.data)
        return
      }

      // Fallback direct query
      const { data, error: fetchErr } = await supabase
        .from('work_orders')
        .select(`
          *,
          status:work_order_statuses(code, display_name, sort_order),
          vehicle:vehicles(plate_number, make, model, year_of_manufacture, color, vin),
          service_provider:service_providers(id, name),
          shop:shops(name, town, county, street, phone),
          mechanic:mechanics(
            id, specialization,
            user:user_profiles(first_name, last_name, phone)
          ),
          booking:bookings!booking_id(
            booking_number, customer_user_id,
            customer:user_profiles!customer_user_id(first_name, last_name, phone, email),
            booking_services(service:services(name), estimated_cost, notes)
          )
        `)
        .eq('id', params.id)
        .single()

      if (fetchErr) throw fetchErr
      setWo(data)
    } catch (err) {
      setError(err.message || 'Failed to load work order')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  const loadMechanics = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { data: provider } = await supabase
        .from('service_providers').select('id').eq('owner_user_id', profile.id).single()
      if (!provider) return
      const { data } = await supabase
        .from('mechanics')
        .select('id, specialization, user:user_profiles(first_name, last_name)')
        .eq('service_provider_id', provider.id)
        .eq('is_active', true)
      setMechanics(data || [])
    } catch {}
  }, [])

  useEffect(() => {
    if (params.id) {
      loadWorkOrder()
      loadMechanics()
    }
  }, [params.id, loadWorkOrder, loadMechanics])

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleCheckIn = async () => {
    if (!checkinMileage || isNaN(Number(checkinMileage))) {
      setError('Enter a valid mileage reading'); return
    }
    setUpdating(true); setError('')
    try {
      const { error: upErr } = await supabase.from('work_orders').update({
        initial_mileage: parseInt(checkinMileage),
        vehicle_checked_in_at: new Date().toISOString(),
      }).eq('id', params.id)
      if (upErr) throw upErr
      setShowCheckin(false)
      setSuccess('Vehicle checked in')
      await loadWorkOrder()
    } catch (e) { setError(e.message) }
    finally { setUpdating(false) }
  }

  const assignMechanic = async () => {
    if (!selectedMechanic) { setError('Select a mechanic'); return }
    setUpdating(true); setError('')
    try {
      const { error: upErr } = await supabase.from('work_orders').update({
        assigned_mechanic_id: selectedMechanic,
      }).eq('id', params.id)
      if (upErr) throw upErr
      setSuccess('Mechanic assigned')
      setSelectedMechanic('')
      await loadWorkOrder()
    } catch (e) { setError(e.message) }
    finally { setUpdating(false) }
  }

  // ── Send estimate for approval (calls API route: DB + email + SMS) ──────
  const handleSendEstimate = async () => {
    if (!confirm('Send this estimate to the vehicle owner for approval?\nThey will receive an in-app notification, email, and SMS.')) return
    setSendingEstimate(true); setError(''); setSuccess('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/send-estimate`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send estimate')
      const channels = [
        data.email_sent && 'email',
        data.sms_sent   && 'SMS',
        'in-app notification'
      ].filter(Boolean).join(', ')
      setSuccess(`Estimate sent to owner via ${channels}. Waiting for their decision.`)
      await loadWorkOrder()
    } catch (err) { setError(err.message) }
    finally { setSendingEstimate(false) }
  }

  const advanceStatus = async (newStatusCode) => {
    if (!confirm(`Move to "${newStatusCode.replace(/_/g,' ')}"?`)) return
    setUpdating(true); setError('')
    try {
      const { data: newStatus } = await supabase
        .from('work_order_statuses').select('id').eq('code', newStatusCode).single()
      if (!newStatus) throw new Error('Status not found: ' + newStatusCode)
      const patch = { status_id: newStatus.id, updated_at: new Date().toISOString() }
      if (newStatusCode === 'closed') patch.closed_at = new Date().toISOString()
      const { error: upErr } = await supabase.from('work_orders').update(patch).eq('id', params.id)
      if (upErr) throw upErr
      setSuccess(`Status → ${newStatusCode.replace(/_/g,' ')}`)
      await loadWorkOrder()
    } catch (e) { setError(e.message) }
    finally { setUpdating(false) }
  }

  const saveInternalNote = async () => {
    if (!internalNote.trim()) return
    setSavingNote(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { error: insertErr } = await supabase.from('comments').insert({
        work_order_id: params.id, author_user_id: profile.id,
        comment_type: 'internal_note', content: internalNote, is_internal: true,
      })
      if (insertErr) throw insertErr
      setInternalNote('')
      setSuccess('Note saved')
    } catch (e) { setError(e.message) }
    finally { setSavingNote(false) }
  }

  // ── Guard states ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  if (!wo) return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button onClick={() => router.push('/provider/work-orders')}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft size={20} className="mr-1" /> Work Orders
      </button>
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
        <AlertCircle className="mx-auto text-red-600 mb-4" size={48} />
        <h2 className="text-xl font-semibold text-red-900 mb-2">Work Order Not Found</h2>
        <p className="text-red-700 mb-4">{error || 'Could not load work order'}</p>
        <button onClick={() => router.push('/provider/work-orders')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          All Work Orders
        </button>
      </div>
    </div>
  )

  // Resolve nested data (handles both RPC jsonb and direct query shapes)
  const statusCode    = wo.status?.code
  const statusStyle   = STATUS_COLORS[statusCode] || STATUS_COLORS.intake
  const nextActions   = NEXT_STATUS_MAP[statusCode] || []
  const currentStep   = TIMELINE.indexOf(statusCode)
  const vehicle       = wo.vehicle  || {}
  const booking       = wo.booking  || {}
  const customer      = booking.customer || {}
  const shop          = wo.shop     || {}
  const mechanic      = wo.mechanic || {}
  const mechanicUser  = mechanic.user || wo.mechanic_profile || {}
  const isTerminal    = ['completed','cancelled','closed'].includes(statusCode)

  // Inject service_provider_id into wo for tab components (needed for parts search)
  const woWithProvider = { ...wo, service_provider_id: wo.service_provider?.id || wo.service_provider_id }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => router.push('/provider/work-orders')}
          className="flex items-center text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} className="mr-1" /> Work Orders
        </button>
        {booking.booking_number && (
          <>
            <ChevronRight size={14} className="text-gray-300" />
            <button onClick={() => router.push(`/provider/bookings/${wo.booking_id}`)}
              className="flex items-center gap-1 text-blue-500 hover:text-blue-700">
              Booking #{booking.booking_number} <ExternalLink size={11} />
            </button>
          </>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-sm">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">
                {wo.work_order_number || 'WO-' + wo.id?.slice(0,8).toUpperCase()}
              </h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                {wo.status?.display_name || statusCode}
              </span>
              {wo.priority === 'urgent' && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">URGENT</span>
              )}
              {wo.is_walk_in && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">Walk-in</span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Opened {new Date(wo.opened_at || wo.created_at).toLocaleDateString('en-KE',{
                day:'numeric',month:'short',year:'numeric'
              })}
              {wo.scheduled_start && (
                <> · Scheduled {new Date(wo.scheduled_start).toLocaleDateString('en-KE',{
                  weekday:'short',day:'numeric',month:'short'
                })}</>
              )}
            </p>
          </div>
        </div>

        {/* Status timeline */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {TIMELINE.map((s, i) => {
            const past    = i < currentStep
            const current = i === currentStep
            const sc      = STATUS_COLORS[s] || STATUS_COLORS.intake
            return (
              <div key={s} className="flex items-center gap-1 flex-shrink-0">
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  current ? `${sc.bg} ${sc.text} ring-1 ring-offset-1 ring-current`
                  : past  ? 'bg-green-50 text-green-600'
                  : 'bg-gray-50 text-gray-400'
                }`}>
                  {past && <CheckCircle size={9} />}
                  <span className="hidden sm:inline">{s.replace(/_/g,' ')}</span>
                  <span className="sm:hidden">{i+1}</span>
                </div>
                {i < TIMELINE.length - 1 && (
                  <div className={`h-px w-2 ${past ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions bar */}
      {(nextActions.length > 0 || !wo.vehicle_checked_in_at || (!wo.assigned_mechanic_id && ['intake','assigned'].includes(statusCode))) && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Actions</p>
          <div className="flex flex-wrap gap-3">

            {/* Check-in */}
            {!wo.vehicle_checked_in_at && (
              showCheckin ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={checkinMileage}
                    onChange={e => setCheckinMileage(e.target.value)}
                    placeholder="Current km"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-36 focus:ring-2 focus:ring-blue-500" />
                  <button onClick={handleCheckIn} disabled={updating}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {updating ? '...' : 'Confirm Check-in'}
                  </button>
                  <button onClick={() => setShowCheckin(false)} className="text-sm text-gray-400 hover:text-gray-600">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowCheckin(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  <Car size={15} /> Check In Vehicle
                </button>
              )
            )}

            {/* Assign mechanic */}
            {!wo.assigned_mechanic_id && ['intake','assigned'].includes(statusCode) && mechanics.length > 0 && (
              <div className="flex items-center gap-2">
                <select value={selectedMechanic} onChange={e => setSelectedMechanic(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                  <option value="">Select mechanic...</option>
                  {mechanics.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.user?.first_name} {m.user?.last_name}{m.specialization ? ` (${m.specialization})` : ''}
                    </option>
                  ))}
                </select>
                <button onClick={assignMechanic} disabled={updating || !selectedMechanic}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  Assign
                </button>
              </div>
            )}

            {/* Status advances — intercept special actions */}
            {nextActions.map(action => {
              if (action.code === 'awaiting_approval') {
                return (
                  <button key={action.code}
                    onClick={handleSendEstimate}
                    disabled={sendingEstimate || updating}
                    className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${action.color}`}>
                    {sendingEstimate
                      ? <><Loader2 size={13} className="animate-spin" /> Sending...</>
                      : action.label}
                  </button>
                )
              }
              if (action.code === 'quality_check') {
                return (
                  <button key={action.code}
                    onClick={() => { advanceStatus('quality_check'); setActiveTab('qc') }}
                    disabled={updating}
                    className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${action.color}`}>
                    {updating && <Loader2 size={13} className="animate-spin" />}
                    {action.label}
                  </button>
                )
              }
              if (action.via_api) {
                // Completed — go to QC tab which has the full completion form
                return (
                  <button key={action.code}
                    onClick={() => setActiveTab('qc')}
                    className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium ${action.color}`}>
                    <ClipboardCheck size={13} /> Go to QC &amp; Complete
                  </button>
                )
              }
              return (
                <button key={action.code} onClick={() => advanceStatus(action.code)} disabled={updating}
                  className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${action.color}`}>
                  {updating && <Loader2 size={13} className="animate-spin" />}
                  {action.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-green-600 text-green-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-5">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* Vehicle */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Car size={13} /> Vehicle
                  </p>
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-gray-900 text-base">{vehicle.plate_number || '—'}</p>
                    <p className="text-gray-700">
                      {[vehicle.make, vehicle.model, vehicle.year_of_manufacture].filter(Boolean).join(' ')}
                    </p>
                    {vehicle.color && <p className="text-gray-500">{vehicle.color}</p>}
                    {vehicle.vin && <p className="font-mono text-xs text-gray-400">{vehicle.vin}</p>}
                    <div className="flex gap-6 pt-1">
                      <div>
                        <p className="text-xs text-gray-400">Check-in km</p>
                        <p className="font-medium">{wo.initial_mileage ? wo.initial_mileage.toLocaleString() : '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Checked in</p>
                        <p className={`font-medium ${!wo.vehicle_checked_in_at ? 'text-amber-600 text-sm' : ''}`}>
                          {wo.vehicle_checked_in_at
                            ? new Date(wo.vehicle_checked_in_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})
                            : 'Pending'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer / Owner */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <User size={13} /> Owner
                  </p>
                  {customer.first_name ? (
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold text-gray-900">{customer.first_name} {customer.last_name}</p>
                      {customer.phone && <p className="text-gray-600">{customer.phone}</p>}
                      {customer.email && <p className="text-gray-500">{customer.email}</p>}
                      {booking.booking_number && (
                        <button onClick={() => router.push(`/provider/bookings/${wo.booking_id}`)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs mt-1">
                          <Hash size={11} /> Booking #{booking.booking_number} <ExternalLink size={10} />
                        </button>
                      )}
                    </div>
                  ) : wo.walk_in_owner_name ? (
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold text-gray-900">{wo.walk_in_owner_name}</p>
                      {wo.walk_in_owner_phone && <p className="text-gray-600">{wo.walk_in_owner_phone}</p>}
                      {wo.walk_in_owner_email && <p className="text-gray-500">{wo.walk_in_owner_email}</p>}
                      <p className="text-xs text-amber-600">Walk-in · not linked to account</p>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">No owner data</p>
                  )}
                </div>

                {/* Location + Mechanic */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <MapPin size={13} /> Location &amp; Mechanic
                  </p>
                  <div className="space-y-2 text-sm">
                    {shop.name && (
                      <div>
                        <p className="font-medium text-gray-900">{shop.name}</p>
                        <p className="text-gray-500">{[shop.town, shop.county].filter(Boolean).join(', ')}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-400">Mechanic</p>
                      {mechanicUser.first_name
                        ? <p className="font-medium text-gray-900">{mechanicUser.first_name} {mechanicUser.last_name}</p>
                        : <p className="text-amber-600 text-sm">Not assigned</p>
                      }
                    </div>
                  </div>
                </div>

                {/* Schedule */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Calendar size={13} /> Schedule
                  </p>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Scheduled</p>
                      <p className="font-medium text-gray-900">
                        {wo.scheduled_start
                          ? new Date(wo.scheduled_start).toLocaleString('en-KE',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
                          : '—'}
                      </p>
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-xs text-gray-400">Check-in</p>
                        <p className="font-medium">
                          {wo.vehicle_checked_in_at
                            ? new Date(wo.vehicle_checked_in_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})
                            : <span className="text-amber-600 text-sm">Pending</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Check-out</p>
                        <p className="font-medium">{wo.vehicle_checked_out_at
                          ? new Date(wo.vehicle_checked_out_at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})
                          : '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Problem description */}
              {wo.problem_description && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Problem Description</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg leading-relaxed">
                    {wo.problem_description}
                  </p>
                </div>
              )}

              {/* Booking requested services (read-only) */}
              {booking.booking_services?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Requested in Booking
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {booking.booking_services.map((bs, i) => (
                      <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                        {bs.service?.name}
                        {bs.estimated_cost ? ` · KES ${Number(bs.estimated_cost).toLocaleString()}` : ''}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    These will be auto-imported when you open the Services tab.
                  </p>
                </div>
              )}

              {/* Estimate (if loaded from services tab) */}
              {estimate && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Current Estimate</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    {[
                      { label: 'Services', val: estimate.services_total },
                      { label: 'Parts',    val: estimate.parts_total    },
                      { label: 'VAT 16%',  val: estimate.tax            },
                      { label: 'Total',    val: estimate.total, bold: true },
                    ].map(({ label, val, bold }) => (
                      <div key={label}>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className={`${bold ? 'font-bold text-blue-900 text-base' : 'font-medium text-gray-800'}`}>
                          KES {Number(val || 0).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Internal note quick-add */}
              {!isTerminal && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Internal Note</p>
                  <div className="flex gap-2">
                    <textarea value={internalNote}
                      onChange={e => setInternalNote(e.target.value)}
                      placeholder="Internal note (not visible to customer)..."
                      rows={2}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-500" />
                    <button onClick={saveInternalNote} disabled={savingNote || !internalNote.trim()}
                      className="self-end px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                      {savingNote ? '...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SERVICES TAB ── */}
          {activeTab === 'services' && (
            <ServicesTab
              workOrder={woWithProvider}
              onEstimateChange={setEstimate}
            />
          )}

          {/* ── PARTS TAB ── */}
          {activeTab === 'parts' && (
            <PartsTab workOrder={woWithProvider} />
          )}

          {/* ── ISSUES TAB ── */}
          {activeTab === 'issues' && (
            <IssuesTab workOrder={woWithProvider} />
          )}

          {/* ── QC & COMPLETE TAB ── */}
          {activeTab === 'qc' && (
            <QualityCheckTab
              workOrder={woWithProvider}
              onStatusChange={async () => {
                await loadWorkOrder()
                setSuccess('')
              }}
            />
          )}

          {/* ── COMMENTS TAB ── */}
          {activeTab === 'comments' && (
            <CommentsTab workOrder={woWithProvider} />
          )}
        </div>
      </div>
    </div>
  )
}