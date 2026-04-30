'use client'

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
const CheckoutTab = dynamic(() => import('@/components/CheckoutTab'), { ssr: false })
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, CheckCircle, XCircle, Loader2, AlertCircle, AlertTriangle,
  Wrench, Package, MessageSquare, Shield, ClipboardList,
  Star, ChevronDown, Car, Gauge, Gauge as GaugeIcon, FileText, Receipt, LogOut
} from 'lucide-react'
import ServicesTab        from '@/app/provider/work-orders/[id]/components/ServicesTab'
import PartsTab           from '@/app/provider/work-orders/[id]/components/PartsTab'
import IssuesTab          from '@/app/provider/work-orders/[id]/components/IssuesTab'
import CommentsTab        from '@/app/provider/work-orders/[id]/components/CommentsTab'
import QualityCheckTab    from '@/app/provider/work-orders/[id]/components/QualityCheckTab'
import RecommendationsTab from '@/app/provider/work-orders/[id]/components/RecommendationsTab'
import InvoiceTab         from '@/app/provider/work-orders/[id]/components/InvoiceTab'
import ReceiptTab         from '@/components/ReceiptTab'
import EstimateReviewPanel from '@/app/provider/work-orders/[id]/components/EstimateReviewPanel'

const STATUS_COLORS = {
  intake:            'bg-gray-100 text-gray-600',
  assigned:          'bg-blue-100 text-blue-700',
  diagnosing:        'bg-purple-100 text-purple-700',
  services_estimates:  'bg-blue-100 text-blue-700',
  internal_review:     'bg-violet-100 text-violet-700',
  awaiting_approval:   'bg-yellow-100 text-yellow-700',
  approved:          'bg-cyan-100 text-cyan-700',
  in_progress:       'bg-orange-100 text-orange-700',
  quality_check:     'bg-indigo-100 text-indigo-700',
  rework:            'bg-red-100 text-red-700',
  completed:         'bg-green-100 text-green-700',
  cancelled:         'bg-red-100 text-red-500',
  closed:            'bg-gray-100 text-gray-500',
}

// Tabs available and their minimum permission requirement
// 'any' = all mechanics can see, 'can_approve_work' = gated
class WOErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, errorInfo: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    console.error('[MyTeams WO] === RENDER ERROR ===')
    console.error('[MyTeams WO] Message:', error?.message)
    console.error('[MyTeams WO] Stack:', error?.stack)
    console.error('[MyTeams WO] Component:', info?.componentStack)
    this.setState({ errorInfo: info })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl m-4 space-y-3">
          <p className="text-red-800 font-bold text-sm">Work order failed to render</p>
          <div className="bg-white border border-red-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">Error</p>
            <p className="text-xs font-mono text-red-600 break-all">{this.state.error.message}</p>
          </div>
          {this.state.errorInfo && (
            <details className="text-xs">
              <summary className="text-red-600 cursor-pointer font-medium">Component stack (click to expand)</summary>
              <pre className="mt-2 text-red-500 bg-white rounded p-2 overflow-auto text-xs border border-red-100 max-h-40">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button onClick={() => this.setState({ error: null, errorInfo: null })}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium">
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const ALL_TABS = [
  { id: 'overview',        label: 'Overview',          icon: ClipboardList, perm: 'any'              },
  { id: 'issues',          label: 'Issues/Diagnostics',icon: AlertCircle,   perm: 'can_approve_work' },
  { id: 'services',        label: 'Services',          icon: Wrench,        perm: 'can_approve_work' },
  { id: 'parts',           label: 'Parts',             icon: Package,       perm: 'can_approve_work' },
  { id: 'recommendations', label: 'Recommendations',   icon: Star,          perm: 'can_approve_work' },
  { id: 'qc',              label: 'Quality Check',     icon: Shield,        perm: 'can_approve_work' },
  { id: 'invoice',         label: 'Invoice',           icon: FileText,      perm: 'can_send_invoice' },
  { id: 'receipt',         label: 'Receipt',           icon: Receipt,       perm: 'can_send_invoice' },
  { id: 'checkout',        label: 'Checkout',          icon: LogOut,        perm: 'can_approve_work' },
  { id: 'comments',        label: 'Comments',          icon: MessageSquare, perm: 'any'              },
]

export default function MechanicWorkOrderPage() {
  const router  = useRouter()
  const params  = useParams()
  const supabase = createClient()

  const [wo,          setWo]          = useState(null)
  const [perms,       setPerms]       = useState(null)
  const [memberPerms, setMemberPerms] = useState(null)  // SPU-level perms for non-mechanics
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [acting,      setActing]      = useState(false)
  const [estimate,    setEstimate]    = useState(null)
  const [sendingEst,  setSendingEst]  = useState(false)
  const [activeTab,   setActiveTab]   = useState('overview')

  // Gating counts
  const [issueCount,    setIssueCount]    = useState(null)
  const [serviceCount,  setServiceCount]  = useState(null)
  const [qcBlockReason, setQcBlockReason] = useState(null)

  // Decline form
  const [showDecline,   setShowDecline]   = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  // Check-in
  const [showCheckin,    setShowCheckin]    = useState(false)
  const [checkinMileage, setCheckinMileage] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const { data: { user } } = await supabase.auth.getUser()
      // Try mechanic RPC first
      let result = null
      const { data: mechResult } = await supabase.rpc(
        'get_mechanic_work_order',
        { p_work_order_id: params.id, p_mechanic_user_id: user.id }
      )

      if (mechResult?.success) {
        result = mechResult
        setWo(result.work_order)
        setPerms(result.mechanic_permissions)
      } else {
        // Fall back to SPU-based access (admin, accountant, manager, owner)
        const { data: spuResult, error: spuErr } = await supabase.rpc(
          'get_provider_member_work_order',
          { p_work_order_id: params.id, p_user_id: user.id }
        )
        if (spuErr) throw spuErr
        if (!spuResult?.success) throw new Error(spuResult?.error || 'Access denied or work order not found')
        result = spuResult
        setWo(result.work_order)
        setMemberPerms(result.member_permissions)
        // Create a compatible perms object for components that use mechanic perms
        setPerms({
          can_approve_work:     result.member_permissions.can_approve_work,
          can_manage_inventory: result.member_permissions.can_manage_inventory,
          can_manage_team:      result.member_permissions.can_manage_team,
          can_send_estimates:   result.member_permissions.can_send_estimates,
          can_send_invoice:     result.member_permissions.can_send_invoice,
          is_assigned:          false,
          is_mechanic:          result.member_permissions.is_mechanic,
        })
      }

      // Fetch gate counts
      const woId = result.work_order.id
      supabase.from('vehicle_issues').select('id', { count: 'exact', head: true })
        .eq('work_order_id', woId).then(({ count }) => setIssueCount(count || 0)).catch(() => {})
      supabase.from('work_order_services').select('id', { count: 'exact', head: true })
        .eq('work_order_id', woId).then(({ count }) => setServiceCount(count || 0)).catch(() => {})
      // Load estimate via direct query — RPC is staff/mechanic only, won't work for accountants
      ;(async () => {
        try {
          const [{ data: svcs }, { data: pts }] = await Promise.all([
            supabase
              .from('work_order_services')
              .select('estimated_cost, status:work_order_services_statuses!status_id(code)')
              .eq('work_order_id', woId),
            supabase
              .from('work_order_parts')
              .select('quantity, unit_price, status:work_order_parts_statuses!status_id(code)')
              .eq('work_order_id', woId),
          ])
          const servicesTotal = (svcs || [])
            .filter(s => !['cancelled','skipped'].includes(s.status?.code))
            .reduce((sum, s) => sum + Number(s.estimated_cost || 0), 0)
          const partsTotal = (pts || [])
            .filter(p => ['reserved','in_use'].includes(p.status?.code))
            .reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.unit_price || 0), 0)
          const subtotal = servicesTotal + partsTotal
          const tax      = Math.round(subtotal * 0.16 * 100) / 100
          const total    = Math.round(subtotal * 1.16 * 100) / 100
          setEstimate({ success: true, services_total: servicesTotal, parts_total: partsTotal, subtotal, tax, total })
        } catch {}
      })()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  const handleAcknowledge = async () => {
    setActing(true); setError(''); setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc(
        'acknowledge_work_order_assignment',
        { p_work_order_id: params.id, p_mechanic_user_id: user.id }
      )
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setSuccess('Assignment acknowledged. You can now start work.')
      await load()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  const handleDecline = async () => {
    setActing(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc(
        'decline_work_order_assignment',
        { p_work_order_id: params.id, p_mechanic_user_id: user.id, p_decline_reason: declineReason || null }
      )
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      // Redirect back to My Teams after declining
      router.push('/dashboard/my-teams')
    } catch (err) { setError(err.message); setActing(false) }
  }

  const handleCheckIn = async () => {
    if (!checkinMileage || isNaN(Number(checkinMileage))) {
      setError('Enter a valid mileage reading')
      return
    }
    setActing(true); setError(''); setSuccess('')
    try {
      const { error: upErr } = await supabase
        .from('work_orders')
        .update({
          initial_mileage:       parseInt(checkinMileage),
          vehicle_checked_in_at: new Date().toISOString(),
        })
        .eq('id', params.id)
      if (upErr) throw upErr
      setShowCheckin(false)
      setCheckinMileage('')
      setSuccess('Vehicle checked in')
      await load()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  const handleSendEstimate = async () => {
    if (!confirm('Send estimates to the customer for approval?')) return
    setSendingEst(true); setError(''); setSuccess('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/send-estimate`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send')
      setSuccess('Estimates sent to customer for approval.')
      await load()
    } catch (err) { setError(err.message) }
    finally { setSendingEst(false) }
  }

  // Transition to internal_review — must go through API to trigger notifications
  const handleSubmitForInternalReview = async () => {
    setActing(true); setError(''); setSuccess('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/internal-review`, {
        method: 'POST',
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to submit for review')
      if (data.notified) {
        setSuccess(`Submitted for internal review. ${data.recipient_count} recipient(s) notified.`)
      } else {
        setSuccess('Submitted for internal review.')
      }
      await load()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  const handleReApprovalNeeded = async () => {
    try {
      const { data: statusRow } = await supabase
        .from('work_order_statuses').select('id').eq('code', 'internal_review').single()
      if (!statusRow) return
      await supabase.from('work_orders')
        .update({ status_id: statusRow.id, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      await fetch('/api/work-orders/' + params.id + '/internal-review', { method: 'POST' }).catch(() => {})
      setSuccess('New item added. Estimate sent back for re-approval — accountant/admin has been notified.')
      await load()
    } catch (e) { setError(e.message) }
  }

  const validateQcReady = async () => {
    try {
      const [{ data: svcs }, { data: parts }] = await Promise.all([
        supabase
          .from('work_order_services')
          .select('id, status:work_order_services_statuses!status_id(code)')
          .eq('work_order_id', params.id),
        supabase
          .from('work_order_parts')
          .select('id, status:work_order_parts_statuses!status_id(code)')
          .eq('work_order_id', params.id),
      ])
      const DONE_SVC  = ['completed','skipped','cancelled']
      const DONE_PART = ['used','cancelled','returned']
      const pendingSvcs  = (svcs  || []).filter(s => !DONE_SVC.includes(s.status?.code))
      const pendingParts = (parts || []).filter(p => !DONE_PART.includes(p.status?.code))
      if (pendingSvcs.length > 0 || pendingParts.length > 0) {
        const msgs = []
        if (pendingSvcs.length  > 0) msgs.push(`${pendingSvcs.length} service${pendingSvcs.length > 1 ? 's' : ''} not yet completed`)
        if (pendingParts.length > 0) msgs.push(`${pendingParts.length} part${pendingParts.length > 1 ? 's' : ''} not yet installed`)
        setQcBlockReason(msgs.join(' · '))
        return false
      }
      setQcBlockReason(null)
      return true
    } catch { return true }
  }

  const handleAdvanceStatus = async (newCode) => {
    setActing(true); setError(''); setSuccess('')
    try {
      const { data: statusRow } = await supabase
        .from('work_order_statuses').select('id').eq('code', newCode).single()
      const { error: upErr } = await supabase
        .from('work_orders')
        .update({ status_id: statusRow.id, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      if (upErr) throw upErr
      setSuccess(`Status updated to ${newCode.replace(/_/g, ' ')}`)
      await load()
    } catch (err) { setError(err.message) }
    finally { setActing(false) }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  if (error && !wo) return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => router.push('/dashboard/my-teams')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
        <ArrowLeft size={16} /> Back to My Teams
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
        <div>
          <p className="font-semibold text-red-900">Access denied</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
        </div>
      </div>
    </div>
  )

  const statusCode    = wo.status?.code || ''
  const assignStatus  = wo.mechanic_assignment_status
  const isPending     = assignStatus === 'pending'
  const isAcknowledged= assignStatus === 'acknowledged'
  const isTerminal    = ['completed','cancelled','closed'].includes(statusCode)
  const isAdmin         = ['admin', 'accountant'].includes(memberPerms?.role)
  const canApprove      = !!perms?.can_approve_work
  const canSendEst      = !!(perms?.can_send_estimates || memberPerms?.can_send_estimates)
  const canSendInvoice  = !!(perms?.can_send_invoice   || memberPerms?.can_send_invoice)
  const canCheckout     = isAdmin || !!(perms?.can_approve_work || memberPerms?.can_approve_work)
  const isMechanic      = !!perms?.mechanic_id || !memberPerms   // has mechanic record
  const memberRole      = memberPerms?.role || (isMechanic ? 'mechanic' : null)
  const isAssigned      = !!perms?.is_assigned

  // Invoice permissions — admins get full access; can_send_invoice gives full invoice access including generate
  const invoicePerms = {
    canGenerate:      isAdmin || canSendInvoice,
    canSendInvoice:   isAdmin || canSendInvoice,
    canRecordPayment: isAdmin || canSendInvoice,
    canConfirm:       isAdmin || canSendInvoice,
  }
  // readOnly: admin/accountant role but no can_approve_work — can view but not mutate work order content
  const isReadOnly = isAdmin && !canApprove

  // Build woWithProvider shape that tabs expect
  const woWithProvider = {
    ...wo,
    id: params.id,
    service_provider_id: wo.service_provider?.id,
  }

  // Available tabs based on permissions
  const tabs = ALL_TABS.filter(t => {
    if (t.perm === 'any') return true
    if (t.perm === 'can_approve_work') return canApprove || isAdmin
    if (t.perm === 'can_send_invoice') return isAdmin || canSendInvoice
    if (t.id === 'receipt') return isAdmin || canSendInvoice
    if (t.id === 'checkout') return canCheckout
    return false
  })

  return (
    <WOErrorBoundary>
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <button onClick={() => router.push('/dashboard/my-teams')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
        <ArrowLeft size={16} /> Back to My Teams
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{wo.work_order_number}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLORS[statusCode] || 'bg-gray-100 text-gray-600'}`}>
                {wo.status?.display_name}
              </span>
              {assignStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isAcknowledged ? 'bg-green-100 text-green-700' :
                  isPending      ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {isAcknowledged ? '✓ Acknowledged' : isPending ? '⏳ Awaiting response' : assignStatus}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{wo.service_provider?.name}</p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p className="flex items-center gap-1 justify-end">
              <Car size={13} /> {wo.vehicle?.plate_number}
              {wo.vehicle?.make && ` · ${wo.vehicle.make} ${wo.vehicle.model || ''}`}
            </p>
            <p className="text-xs mt-0.5">{new Date(wo.opened_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>

        {wo.problem_description && (
          <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            {wo.problem_description}
          </p>
        )}
      </div>

      {/* Feedback */}
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

      {/* Assignment action card */}
      {isAssigned && !isTerminal && (
        <div className={`rounded-xl p-4 border space-y-3 ${
          isPending      ? 'bg-yellow-50 border-yellow-300' :
          isAcknowledged ? 'bg-green-50 border-green-300' :
                           'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{isAcknowledged ? '✅' : '🔧'}</span>
            <p className="font-semibold text-sm text-gray-900">
              {isAcknowledged
                ? 'Assignment acknowledged — you are working on this'
                : 'You have been assigned to this work order'}
            </p>
          </div>

          {/* Check-in vehicle — shown when acknowledged and not yet checked in */}
          {isAcknowledged && !wo.vehicle_checked_in_at && (
            <div className="border-t border-green-200 pt-3">
              {showCheckin ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    value={checkinMileage}
                    onChange={e => setCheckinMileage(e.target.value)}
                    placeholder="Current mileage (km)"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-44 focus:ring-2 focus:ring-blue-400"
                  />
                  <button onClick={handleCheckIn} disabled={acting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {acting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                    Confirm Check-in
                  </button>
                  <button onClick={() => { setShowCheckin(false); setCheckinMileage('') }}
                    className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowCheckin(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  <Car size={14} /> Check In Vehicle
                </button>
              )}
            </div>
          )}

          {wo.vehicle_checked_in_at && (
            <div className="border-t border-green-200 pt-2 flex items-center gap-2 text-xs text-green-700">
              <CheckCircle size={13} />
              Vehicle checked in
              {wo.initial_mileage && <span className="text-green-600">· {wo.initial_mileage.toLocaleString()} km</span>}
            </div>
          )}

          {/* Acknowledge / Decline */}
          {isPending && !showDecline && (
            <div className="flex gap-2">
              <button onClick={handleAcknowledge} disabled={acting}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {acting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Acknowledge
              </button>
              <button onClick={() => setShowDecline(true)}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
                Decline
              </button>
            </div>
          )}

          {showDecline && (
            <div className="space-y-2">
              <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)}
                placeholder="Reason for declining (optional)..." rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
              <div className="flex gap-2">
                <button onClick={handleDecline} disabled={acting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
                  {acting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm Decline
                </button>
                <button onClick={() => { setShowDecline(false); setDeclineReason('') }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Internal Estimate Review — only for mechanics with can_send_estimates, not for admin/accountant viewers */}
          {statusCode === 'internal_review' && canSendEst && !isAdmin && (
            <div className="border-t border-violet-100 pt-3">
              <EstimateReviewPanel
                workOrder={woWithProvider}
                canSend={true}
                estimate={estimate}
                onSent={() => { load(); setSuccess('Estimate sent to customer for approval.') }}
              />
            </div>
          )}

          {/* Status advance actions */}
          {((isAcknowledged && canApprove) || (isAdmin && !isTerminal)) && (<>
            <div className="border-t border-green-200 pt-3">
              <p className="text-xs font-medium text-green-800 mb-2">Advance status:</p>
              <div className="flex flex-wrap gap-2">
                {statusCode === 'assigned' && (
                  <button onClick={() => { handleAdvanceStatus('diagnosing'); setActiveTab('issues') }}
                    disabled={acting} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
                    Start Diagnosing
                  </button>
                )}
                {statusCode === 'diagnosing' && (
                  <div className="flex flex-col gap-1.5">
                    {issueCount !== null && issueCount === 0 && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        ⚠️ Document at least one issue/diagnostic before moving to estimates
                      </p>
                    )}
                    <button
                      onClick={() => {
                        if (!issueCount) { setActiveTab('issues'); return }
                        handleAdvanceStatus('services_estimates')
                        setActiveTab('services')
                      }}
                      disabled={acting}
                      className={`px-3 py-1.5 text-white rounded-lg text-xs font-medium disabled:opacity-50 ${!issueCount ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                      Move to Services &amp; Parts Estimates
                    </button>
                    <p className="text-xs text-purple-700">Document all issues first, then move to add service &amp; parts estimates.</p>
                  </div>
                )}
                {statusCode === 'services_estimates' && (
                  <div className="flex flex-col gap-1.5">
                    {serviceCount !== null && serviceCount === 0 && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        ⚠️ Add at least one service or part before submitting for review
                      </p>
                    )}
                    <button
                      onClick={() => {
                        if (!serviceCount) { setActiveTab('services'); return }
                        handleSubmitForInternalReview()
                      }}
                      disabled={acting}
                      className={`px-3 py-1.5 text-white rounded-lg text-xs font-medium disabled:opacity-50 ${!serviceCount ? 'bg-violet-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'}`}>
                      Submit for Internal Review
                    </button>
                    <p className="text-xs text-blue-700">Add all service &amp; parts estimates, then submit for provider review before sending to customer.</p>
                  </div>
                )}
                {statusCode === 'internal_review' && (
                  canSendEst ? null : (
                    // Mechanic without can_send_estimates — waiting message
                    <div className="px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-lg">
                      <p className="text-xs text-violet-800 font-medium">⏳ Estimates submitted for provider review.</p>
                      <p className="text-xs text-violet-600 mt-0.5">The provider will review and send to the customer.</p>
                    </div>
                  )
                )}
                {statusCode === 'awaiting_approval' && (
                  <p className="text-xs text-yellow-700 font-medium">⏳ Awaiting customer approval of estimates.</p>
                )}
                {statusCode === 'approved' && (
                  <button onClick={() => handleAdvanceStatus('in_progress')}
                    disabled={acting} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 disabled:opacity-50">
                    Begin Work
                  </button>
                )}
                {statusCode === 'in_progress' && (
                  <div className="flex flex-col gap-1.5">
                    {qcBlockReason && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} /> {qcBlockReason}
                      </p>
                    )}
                    <button
                      onClick={async () => { const ok = await validateQcReady(); if (ok) handleAdvanceStatus('quality_check') }}
                      disabled={acting}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
                      Submit for Quality Check
                    </button>
                  </div>
                )}
                {statusCode === 'quality_check' && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-indigo-700 font-medium">⏳ Under quality check — record the outcome:</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setActiveTab('qc')}
                        disabled={acting}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                        ✓ Go to QC &amp; Complete
                      </button>
                      <button onClick={() => handleAdvanceStatus('rework')}
                        disabled={acting}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                        ✗ QC Failed — Rework
                      </button>
                    </div>
                  </div>
                )}
                {statusCode === 'rework' && (
                  <div className="flex flex-col gap-1.5">
                    {qcBlockReason && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} /> {qcBlockReason}
                      </p>
                    )}
                    <button
                      onClick={async () => { const ok = await validateQcReady(); if (ok) handleAdvanceStatus('quality_check') }}
                      disabled={acting}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
                      Resubmit for QC
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>)}

          {/* Permissions summary */}
          {perms && (
            <div className="border-t border-current border-opacity-20 pt-2 flex flex-wrap gap-2">
              <span className="text-xs text-gray-500">Your access:</span>
              {canApprove           && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Manage work order</span>}
              {perms.can_manage_inventory && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Manage inventory</span>}
              {!canApprove && !perms.can_manage_inventory && (
                <span className="text-xs text-gray-400">View only · acknowledge or decline assignment</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* EstimateReviewPanel for admin/accountant — outside assignment card, always visible when status = internal_review */}
      {statusCode === 'internal_review' && isAdmin && (
        <EstimateReviewPanel
          workOrder={woWithProvider}
          canSend={canSendEst || isAdmin}
          estimate={estimate}
          onSent={() => { load(); setSuccess('Estimate sent to customer for approval.') }}
        />
      )}

      {/* Tabs — only shown after acknowledged */}
      {(isAcknowledged || !isPending) && tabs.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b border-gray-200">
            {tabs.map(t => {
              const Icon = t.icon
              return (
                <button key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === t.id
                      ? 'border-blue-600 text-blue-700 bg-blue-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}>
                  <Icon size={14} /> {t.label}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Work Order</p>
                    <p className="font-semibold text-gray-900">{wo.work_order_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Status</p>
                    <p className="font-medium text-gray-900">{wo.status?.display_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Priority</p>
                    <p className="font-medium capitalize text-gray-900">{wo.priority || 'Normal'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Vehicle</p>
                    <p className="font-medium text-gray-900">{wo.vehicle?.plate_number}</p>
                    <p className="text-xs text-gray-500">{wo.vehicle?.make} {wo.vehicle?.model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Garage</p>
                    <p className="font-medium text-gray-900">{wo.service_provider?.name}</p>
                  </div>
                  {wo.total_amount > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Total</p>
                      <p className="font-semibold text-gray-900">KES {Number(wo.total_amount).toLocaleString()}</p>
                    </div>
                  )}
                </div>
                {wo.problem_description && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Problem Description</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{wo.problem_description}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'services' && (canApprove || isAdmin) && (
              <ServicesTab workOrder={woWithProvider} onEstimateChange={() => {}} onServiceAdded={() => setServiceCount(c => (c || 0) + 1)} readOnly={isReadOnly} onReApprovalNeeded={handleReApprovalNeeded} />
            )}
            {activeTab === 'parts' && (canApprove || isAdmin) && (
              <PartsTab workOrder={woWithProvider} readOnly={isReadOnly} onReApprovalNeeded={handleReApprovalNeeded} />
            )}
            {activeTab === 'issues' && (canApprove || isAdmin) && (
              <IssuesTab workOrder={woWithProvider} onIssueAdded={() => setIssueCount(c => (c || 0) + 1)} readOnly={isReadOnly} />
            )}
            {activeTab === 'invoice' && (isAdmin || canSendInvoice) && (
              <InvoiceTab workOrder={woWithProvider} permissions={invoicePerms} />
            )}

            {/* ── RECEIPT TAB ── */}
            {activeTab === 'receipt' && (isAdmin || canSendInvoice) && (
              <ReceiptTab workOrder={woWithProvider} canConfirm={invoicePerms.canConfirm} />
            )}

            {/* ── CHECKOUT TAB ── */}
            {activeTab === 'checkout' && canCheckout && (
              <CheckoutTab
                workOrder={woWithProvider}
                canCheckout={canCheckout}
                onStatusChange={() => { loadWorkOrder() }}
              />
            )}
            {activeTab === 'recommendations' && (canApprove || isAdmin) && (
              <RecommendationsTab workOrder={woWithProvider} />
            )}
            {activeTab === 'qc' && (canApprove || (isAdmin && !isReadOnly)) && (
              <QualityCheckTab
                workOrder={woWithProvider}
                onStatusChange={(event) => {
                  if (event === 'go_to_invoice') {
                    setActiveTab('invoice')
                    return
                  }
                  load()
                }}
              />
            )}
            {activeTab === 'comments' && (
              <CommentsTab workOrder={woWithProvider} />
            )}
          </div>
        </div>
      )}
    </div>
    </WOErrorBoundary>
  )
}