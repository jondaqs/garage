'use client'

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
const CheckoutTab = dynamic(() => import('@/components/CheckoutTab'), { ssr: false })
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {ArrowLeft, CheckCircle, XCircle, Loader2, AlertCircle, AlertTriangle,
  Wrench, Package, MessageSquare, Shield, ClipboardList,
  Star, ChevronDown, Car, Gauge, Gauge as GaugeIcon, FileText, Receipt, LogOut,
  BellRing, ClipboardCheck, RefreshCw
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
    console.error('[MyTeams WO] Load failed')
    console.error('[MyTeams WO] Load failed')
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
  const [changesRequested, setChangesRequested] = useState(null)
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
  const [refreshing,     setRefreshing]     = useState(false)
  const [checkinMileage, setCheckinMileage] = useState('')

  // Mechanic assignment (for members with can_manage_team or can_approve_work)
  const [mechanics,        setMechanics]        = useState([])
  const [selectedMechanic, setSelectedMechanic] = useState('')

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
        const mechPerms = result.mechanic_permissions || {}

        // Also load SPU permissions — the user may be both a mechanic AND
        // an admin/manager. Mechanic RPC only returns mechanics-table perms,
        // which may be all false. The SPU row carries the real role + perms.
        const { data: spuCheck } = await supabase.rpc(
          'get_provider_member_work_order',
          { p_work_order_id: params.id, p_user_id: user.id }
        )
        const spuPerms = spuCheck?.success ? (spuCheck.member_permissions || {}) : {}

        if (spuPerms.role) {
          setMemberPerms(spuPerms)
        }

        // Merge: either source can grant a permission (union, not intersection)
        setPerms({
          mechanic_id:          mechPerms.mechanic_id,
          can_approve_work:     !!(mechPerms.can_approve_work     || spuPerms.can_approve_work),
          can_manage_inventory: !!(mechPerms.can_manage_inventory || spuPerms.can_manage_inventory),
          can_manage_team:      !!(mechPerms.can_manage_team      || spuPerms.can_manage_team),
          can_send_estimates:   !!(mechPerms.can_send_estimates   || spuPerms.can_send_estimates),
          can_send_invoice:     !!(mechPerms.can_send_invoice     || spuPerms.can_send_invoice),
          is_assigned:          mechPerms.is_assigned,
          is_mechanic:          true,
        })
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
          const vr       = wo?.vat_rate ?? 16
          const tax      = Math.round(subtotal * vr / 100 * 100) / 100
          const total    = Math.round((subtotal + tax) * 100) / 100
          setEstimate({ success: true, services_total: servicesTotal, parts_total: partsTotal, subtotal, tax, total, vat_rate: vr })
        } catch {}
      })()

      // Fetch latest estimate change request
      supabase.from('work_order_approvals')
        .select('decision, decision_notes, approved_at')
        .eq('work_order_id', params.id)
        .eq('decision', 'changes_requested')
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setChangesRequested(data))
        .then(null, () => {})

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  // Load mechanics list when WO + permissions are available
  // For members with admin/accountant role, can_manage_team or can_approve_work
  // Only admin-role members (not accountant) get implicit mechanic-loading access
  const isAdminRole = memberPerms?.role === 'admin'
  // RPC returns service_provider as nested object, not top-level service_provider_id
  const woProviderId = wo?.service_provider_id || wo?.service_provider?.id
  useEffect(() => {
    if (!woProviderId || (!perms && !memberPerms)) return
    if (!isAdminRole && !perms?.can_manage_team && !perms?.can_approve_work) return

    ;(async () => {
      try {
        // Use SECURITY DEFINER RPC instead of direct mechanics query —
        // the mechanics table RLS only allows the provider owner or the
        // mechanic themselves to read rows. SPU members (admin, etc.)
        // are blocked. get_provider_team_members bypasses RLS and returns
        // mechanic_id + names for all active team members.
        const { data: teamData } = await supabase.rpc(
          'get_provider_team_members',
          { p_provider_id: woProviderId }
        )

        // Filter to only team members who are mechanics (have a mechanic_id)
        const mechanicMembers = (teamData || [])
          .filter(t => t.mechanic_id)
          .map(t => ({
            id: t.mechanic_id,
            user_id: t.user_id,
            specialization: t.specialization,
            user: { first_name: t.first_name, last_name: t.last_name },
          }))

        // Deduplicate by user_id — keep entry with specialization if one exists
        const seen = new Map()
        for (const m of mechanicMembers) {
          const existing = seen.get(m.user_id)
          if (!existing || (!existing.specialization && m.specialization)) {
            seen.set(m.user_id, m)
          }
        }

        setMechanics([...seen.values()])
      } catch (err) {
        console.error('Failed to load mechanics:')
      }
    })()
  }, [woProviderId, perms?.can_manage_team, perms?.can_approve_work, isAdminRole])

  // Assign mechanic handler
  const assignMechanic = async () => {
    if (!selectedMechanic) { setError('Select a mechanic'); return }
    setActing(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`/api/work-orders/${params.id}/assign-mechanic`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mechanicId: selectedMechanic }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to assign')
      setSuccess(`Mechanic assigned — notification sent${data.email_sent ? ' (email ✓)' : ''}${data.sms_sent ? ' (SMS ✓)' : ''}`)
      setSelectedMechanic('')
      await load()
    } catch (e) { setError(e.message) }
    finally { setActing(false) }
  }

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
      router.push('/dashboard/my-teams/work-orders')
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
      <button onClick={() => router.push('/dashboard/my-teams/work-orders')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
        <ArrowLeft size={16} /> Back to Work Orders
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
  // isFullAdmin: only the 'admin' role gets implicit access to ALL work order
  // transition actions (like the provider owner). Accountants keep their
  // existing behavior — they rely on their DB boolean flags and get
  // invoice/receipt access via isAdmin, but don't get blanket canApprove etc.
  const isFullAdmin     = memberPerms?.role === 'admin'
  const canApprove      = isFullAdmin || !!perms?.can_approve_work
  const canSendEst      = isFullAdmin || !!(perms?.can_send_estimates || memberPerms?.can_send_estimates)
  const canSendInvoice  = isFullAdmin || !!(perms?.can_send_invoice   || memberPerms?.can_send_invoice)
  const canCheckout     = isAdmin || !!(perms?.can_approve_work || memberPerms?.can_approve_work)
  const isMechanic      = !!perms?.mechanic_id || !memberPerms   // has mechanic record
  const memberRole      = memberPerms?.role || (isMechanic ? 'mechanic' : null)

  // Recommendations add gate (mirrors add_maintenance_recommendation
  // server-side). On the team-member page the viewer is never the provider
  // owner (owners go through /provider/work-orders/), so "owner or admin"
  // collapses to "is this an SPU admin". Accountants do NOT qualify for
  // the post-close override even though they share isAdmin elsewhere.
  const isProviderAdmin = memberPerms?.role === 'admin'
  const canAddRecommendation =
    isProviderAdmin
    || (!isTerminal && (canApprove || !!memberPerms?.can_approve_work))
  const isAssigned      = !!perms?.is_assigned

  // Admin-role members, or members with can_manage_team / can_approve_work can assign mechanics
  const canAssignMechanic = isFullAdmin || !!(perms?.can_manage_team || perms?.can_approve_work)

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
      <button onClick={() => router.push('/dashboard/my-teams/work-orders')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm">
        <ArrowLeft size={16} /> Back to Work Orders
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
            <button
              onClick={async () => { setRefreshing(true); await load(); setRefreshing(false) }}
              disabled={refreshing}
              title="Refresh"
              className="inline-flex items-center gap-1.5 mb-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
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

      {/* ── Work-order action card ───────────────────────────────────────
          Visible whenever the work order isn't terminal AND the viewer has
          *some* role-driven action available — either they're the assigned
          mechanic, or they're a manager-level member (admin/accountant) who
          can drive the workflow. Admin-role members get all capabilities
          implicitly — they can perform every transition action just like
          the provider owner. Other roles are gated on specific boolean
          permissions (canApprove, canSendEst, etc.). */}
      {!isTerminal && (isAssigned || isAdmin || canAssignMechanic) && (
        <div className={`rounded-xl p-4 border space-y-3 ${
          isAssigned
            ? (isPending      ? 'bg-yellow-50 border-yellow-300'
              : isAcknowledged ? 'bg-green-50 border-green-300'
              :                  'bg-gray-50 border-gray-200')
            // Admin-as-viewer skin: neutral, no assignment status colouring.
            : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {isAssigned ? (isAcknowledged ? '✅' : '🔧') : '🛠️'}
            </span>
            <p className="font-semibold text-sm text-gray-900">
              {isAssigned
                ? (isAcknowledged
                    ? 'Assignment acknowledged — you are working on this'
                    : 'You have been assigned to this work order')
                // Non-assigned viewer (admin, accountant). Don't pretend
                // they're the mechanic; just frame it as oversight.
                : 'Work order actions'}
            </p>
          </div>

          {/* Check-in vehicle — available to the assigned mechanic once
              they've acknowledged, or to any admin (who may be checking in
              on the mechanic's behalf, e.g. when the customer drops the
              car at the front desk). Hidden once the vehicle is already
              checked in. */}
          {((isAcknowledged || isAdmin) && !wo.vehicle_checked_in_at) && (
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

          {/* Acknowledge / Decline — only the assigned mechanic accepts an
              assignment. Admins viewing this card don't see these buttons. */}
          {isAssigned && isPending && !showDecline && (
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

          {isAssigned && showDecline && (
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

          {/* Assign / Reassign mechanic — for members with can_manage_team or can_approve_work */}
          {canAssignMechanic && (
            <>
              {/* Pending assignment banner with reassign option */}
              {wo.assigned_mechanic_id && assignStatus === 'pending' && !isAssigned && (
                <div className="border-t border-yellow-200 pt-3">
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-yellow-50 border border-yellow-300 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse flex-shrink-0" />
                      <span className="text-yellow-800 font-medium">Waiting for mechanic to acknowledge</span>
                    </div>
                    <button
                      onClick={() => { supabase.from('work_orders').update({ assigned_mechanic_id: null, mechanic_assignment_status: null }).eq('id', params.id).then(() => load()) }}
                      className="text-xs text-red-600 hover:underline flex-shrink-0">
                      Reassign
                    </button>
                  </div>
                </div>
              )}

              {/* Assign mechanic dropdown — when no mechanic assigned and WO is in early status */}
              {!wo.assigned_mechanic_id && ['intake','assigned'].includes(statusCode) && mechanics.length > 0 && (
                <div className="border-t border-green-200 pt-3">
                  <p className="text-xs font-medium text-green-800 mb-2">Assign mechanic:</p>
                  <div className="flex items-center gap-2">
                    <select value={selectedMechanic} onChange={e => setSelectedMechanic(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 w-1/2">
                      <option value="">Select mechanic...</option>
                      {mechanics.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.user?.first_name || ''} {m.user?.last_name || ''}{m.specialization ? ` (${m.specialization})` : ''}
                        </option>
                      ))}
                    </select>
                    <button onClick={assignMechanic} disabled={acting || !selectedMechanic}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                      {acting ? 'Assigning...' : 'Assign'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Internal Estimate Review — gated on can_send_estimates only.
              Same model as the other actions: role doesn't grant access,
              the boolean does. An admin without can_send_estimates won't
              see this panel. */}
          {statusCode === 'internal_review' && canSendEst && (
            <div className="border-t border-violet-100 pt-3">
              <EstimateReviewPanel
                workOrder={woWithProvider}
                canSend={true}
                estimate={estimate}
                onSent={() => { load(); setSuccess('Estimate sent to customer for approval.') }}
              />
            </div>
          )}

          {/* Status advance actions — admins and members with can_approve_work
              can drive the full workflow. Mechanics with can_approve_work
              additionally need to have acknowledged the assignment. */}
          {(canApprove && (isAcknowledged || !isAssigned)) && !isTerminal && (<>
            <div className="border-t border-green-200 pt-3">
              <p className="text-xs font-medium text-green-800 mb-2">Advance status:</p>
              <div className="flex flex-wrap gap-2">
                {statusCode === 'intake' && (
                  <button onClick={() => handleAdvanceStatus('assigned')}
                    disabled={acting} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                    {acting ? <Loader2 size={13} className="animate-spin inline mr-1" /> : null}
                    Transition to Assigned
                  </button>
                )}
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

      {/* (The previous admin-only EstimateReviewPanel that lived here was
          removed: the in-card panel above now fires for admins too, gated
          on can_send_estimates like every other action.) */}

      {/* ── Estimate approved banner ── */}
      {wo.estimate_approved && wo.status?.code === 'approved' && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Estimate approved — ready to start work</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              The customer has approved the estimate. You can now begin service work on the vehicle.
              Update service statuses in the <span className="font-semibold text-green-700">Services tab</span>.
            </p>
          </div>
        </div>
      )}

      {/* ── Checkout request action banner ── */}
      {wo.checkout_requested && !wo.checkout_request_satisfied && (
        <div className="rounded-xl border border-blue-300 bg-blue-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <BellRing size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Action needed — Checkout form requested</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              The customer has received the invoice and is requesting the checkout form before making payment.
              Go to the <span className="font-semibold text-blue-700">Checkout tab</span> below, complete the road-test checklist and submit.
            </p>
          </div>
        </div>
      )}

      {/* ── Checkout declined banner ── */}
      {wo.checkout_declined && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ClipboardCheck size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Action needed — Checkout declined by customer</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              The customer was not satisfied with the checkout submission. Go to the <span className="font-semibold text-red-700">Checkout tab</span> to
              review their reason, address any concerns and resubmit the checkout form.
            </p>
          </div>
        </div>
      )}

      {/* ── Estimate changes requested banner ── */}
      {changesRequested && statusCode === 'diagnosing' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquare size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Action needed — Customer requested changes to estimate</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              The customer has reviewed the estimate and requested modifications before approving.
              Update the services and costs in the <span className="font-semibold text-amber-700">Services tab</span>, then re-send for approval.
            </p>
            {changesRequested.decision_notes && (
              <div className="mt-2 px-3 py-2 bg-white border border-amber-200 rounded-lg">
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">Customer&apos;s feedback</p>
                <p className="text-xs text-gray-700 leading-relaxed">{changesRequested.decision_notes}</p>
              </div>
            )}
          </div>
        </div>
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
                onStatusChange={() => { load() }}
              />
            )}
            {activeTab === 'recommendations' && (
              <RecommendationsTab workOrder={woWithProvider} canAdd={canAddRecommendation} />
            )}
            {activeTab === 'qc' && (canApprove || (isAdmin && !isReadOnly)) && (
              <QualityCheckTab
                workOrder={woWithProvider}
                canSendInvoice={canSendInvoice}
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