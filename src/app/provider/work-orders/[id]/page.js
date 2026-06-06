'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Car, MapPin, User, Calendar, Clock,
  ClipboardList, AlertCircle, CheckCircle, ChevronRight,
  Wrench, Package, MessageSquare, Hash, ExternalLink,
  AlertTriangle, FileText, Loader2, ClipboardCheck, Receipt, Bell, LogOut, BellRing,
  Edit3, DollarSign, Lock, Info, RefreshCw
} from 'lucide-react'
import ServicesTab      from './components/ServicesTab'
import PartsTab         from './components/PartsTab'
import IssuesTab        from './components/IssuesTab'
import CommentsTab      from './components/CommentsTab'
import QualityCheckTab  from './components/QualityCheckTab'
import InvoiceTab            from './components/InvoiceTab'
import ReceiptTab            from '@/components/ReceiptTab'
import CheckoutTab           from '@/components/CheckoutTab'
import RecommendationsTab    from './components/RecommendationsTab'
import EstimateReviewPanel  from './components/EstimateReviewPanel'

// ─── Constants ──────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  intake:            { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-400'    },
  assigned:          { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  diagnosing:          { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500'  },
  services_estimates:  { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  internal_review:     { bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500'  },
  awaiting_approval:   { bg: 'bg-yellow-100',  text: 'text-yellow-700',  dot: 'bg-yellow-500'  },
  approved:          { bg: 'bg-cyan-100',    text: 'text-cyan-700',    dot: 'bg-cyan-500'    },
  in_progress:       { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  quality_check:     { bg: 'bg-indigo-100',  text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
  rework:            { bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500'     },
  completed:         { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500'   },
  cancelled:         { bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400'     },
  closed:            { bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-300'    },
}

const TIMELINE = [
  'intake','assigned','diagnosing','services_estimates','internal_review',
  'awaiting_approval','approved','in_progress','quality_check','completed','closed'
]

const NEXT_STATUS_MAP = {
  intake:            [{ code: 'assigned',          label: 'Transition to Assigned',   color: 'bg-blue-600 hover:bg-blue-700'     }],
  assigned:          [{ code: 'diagnosing',         label: 'Begin Diagnostics',            color: 'bg-purple-600 hover:bg-purple-700' }],
  diagnosing:        [{ code: 'services_estimates', label: 'Move to Services & Parts Estimates', color: 'bg-blue-600 hover:bg-blue-700', requires_issues: true }],
  services_estimates:[{ code: 'internal_review',   label: 'Submit for Internal Review',         color: 'bg-violet-600 hover:bg-violet-700', requires_estimates: true }],
  internal_review:   [{ code: 'awaiting_approval', label: 'Send Estimates for Approval',         color: 'bg-yellow-500 hover:bg-yellow-600', via_internal_review: true }],
  approved:          [{ code: 'in_progress',       label: 'Start Service',                       color: 'bg-orange-500 hover:bg-orange-600' }],
  in_progress:       [{ code: 'quality_check',      label: 'Submit for QC',            color: 'bg-indigo-600 hover:bg-indigo-700' }],
  quality_check:     [
    { code: 'completed',    label: 'Complete Work Order',   color: 'bg-green-600 hover:bg-green-700', via_api: true },
    { code: 'rework',       label: 'QC Failed — Rework',   color: 'bg-red-600 hover:bg-red-700'     },
  ],
  rework:            [{ code: 'quality_check',      label: 'Resubmit for QC',          color: 'bg-indigo-600 hover:bg-indigo-700' }],
  completed:         [{ code: 'closed',             label: 'Close Work Order',         color: 'bg-gray-600 hover:bg-gray-700'    }],
}

const TABS = [
  { id: 'overview',        label: 'Overview',            icon: ClipboardList  },
  { id: 'issues',          label: 'Issues/Diagnostics',  icon: AlertTriangle  },
  { id: 'services',        label: 'Services',            icon: Wrench         },
  { id: 'parts',           label: 'Parts',               icon: Package        },
  { id: 'recommendations', label: 'Recommendations',     icon: Bell           },
  { id: 'qc',              label: 'QC & Complete',       icon: ClipboardCheck },
  { id: 'invoice',         label: 'Invoice',             icon: FileText       },
  { id: 'receipt',         label: 'Receipt',             icon: Receipt        },
  { id: 'checkout',        label: 'Checkout',            icon: LogOut         },
  { id: 'comments',        label: 'Comments',            icon: MessageSquare  },
]

// ─── Component ───────────────────────────────────────────────────────────────
export default function WorkOrderDetailPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()

  const [wo, setWo]                   = useState(null)
  const [issueCount,     setIssueCount]     = useState(null)  // null = not yet checked
  const [serviceCount,   setServiceCount]   = useState(null)  // null = not yet checked
  const [qcBlockReason,  setQcBlockReason]  = useState(null)  // null = ok, string = blocked
  const [isOwner,         setIsOwner]         = useState(false) // is current user the provider owner
  const [spuPermissions,  setSpuPermissions]  = useState({})    // SPU-level permissions for current user
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
  const [mechanicName,     setMechanicName]     = useState('')   // resolved via SECURITY DEFINER fn
  // Internal notes (overview tab)
  const [internalNote, setInternalNote]         = useState('')
  const [savingNote, setSavingNote]             = useState(false)

  // Overview inline edits: shop + currency
  const [shopList,         setShopList]         = useState([])     // provider's shops
  const [currencies,       setCurrencies]       = useState([])     // for the free-pick dropdown
  const [providerCurrency, setProviderCurrency] = useState(null)   // joined from service_providers.currency_id
  const [shopCurrency,     setShopCurrency]     = useState(null)   // joined from selected shop's currency_id
  const [woCurrency,       setWoCurrency]       = useState(null)   // joined from work_orders.currency_id (display)
  const [editingShop,      setEditingShop]      = useState(false)
  const [editingCurrency,  setEditingCurrency]  = useState(false)
  const [draftShopId,      setDraftShopId]      = useState('')
  const [draftCurrencyId,  setDraftCurrencyId]  = useState('')
  const [savingShop,       setSavingShop]       = useState(false)
  const [savingCurrency,   setSavingCurrency]   = useState(false)
  const [refreshing,       setRefreshing]       = useState(false)

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

      if (result?.data) {
      }

      if (!rpcErr && result?.success) {
        setWo(result.data)
        return
      }


      // Fallback direct query — use _secure views for PII-decrypted fields
      const { data, error: fetchErr } = await supabase
        .from('work_orders_secure')
        .select(`
          *,
          status:work_order_statuses(code, display_name, sort_order),
          vehicle:vehicles_secure(plate_number, make, model, year_of_manufacture, color, vin),
          service_provider:service_providers_secure(id, name, phone, email),
          shop:shops_secure(name, town, county, street, phone),
          mechanic:mechanics(
            id, user_id, specialization,
            user:user_profiles_secure(first_name, last_name, phone)
          ),
          booking:bookings_secure!booking_id(
            booking_number, customer_user_id,
            customer:user_profiles_secure!customer_user_id(first_name, last_name, phone, email),
            booking_services(service:services(name), estimated_cost, notes)
          )
        `)
        .eq('id', params.id)
        .single()

      if (fetchErr) throw fetchErr
      setWo(data)

      // Check if issues are populated (for Send Estimates gate)
      supabase.from('vehicle_issues')
        .select('id', { count: 'exact', head: true })
        .eq('work_order_id', params.id)
        .then(({ count }) => setIssueCount(count || 0))
        .catch(() => {})

      // Check if services are populated (for Internal Review gate)
      supabase.from('work_order_services')
        .select('id', { count: 'exact', head: true })
        .eq('work_order_id', params.id)
        .then(({ count }) => setServiceCount(count || 0))
        .catch(() => {})

      // Is current user the provider owner?
      supabase.from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
        .then(async ({ data: prof }) => {
          if (!prof) return
          // Check if owner
          const { data: provRow } = await supabase.from('service_providers_secure')
            .select('id').eq('owner_user_id', prof.id)
            .eq('id', data.service_provider?.id).maybeSingle()
          setIsOwner(!!provRow?.id)

          // Fetch SPU permissions for current user on this provider
          const { data: spuRow } = await supabase.from('service_provider_users')
            .select('role, can_approve_work, can_manage_team, can_manage_inventory, can_send_estimates, can_send_invoice')
            .eq('user_id', prof.id)
            .eq('service_provider_id', data.service_provider?.id)
            .eq('is_active', true)
            .maybeSingle()

          // Also fetch mechanic-level permissions (mechanic may not have an SPU row
          // or the SPU row may not reflect the mechanics table can_send_invoice flag)
          const { data: mechRow } = await supabase.from('mechanics')
            .select('can_approve_work, can_manage_team, can_manage_inventory, can_send_estimates, can_send_invoice')
            .eq('user_id', prof.id)
            .eq('service_provider_id', data.service_provider?.id)
            .eq('is_active', true)
            .maybeSingle()

          // Merge: SPU row wins for role; either source can grant a permission
          const merged = {
            ...(spuRow || {}),
            can_approve_work:     !!(spuRow?.can_approve_work     || mechRow?.can_approve_work),
            can_manage_team:      !!(spuRow?.can_manage_team      || mechRow?.can_manage_team),
            can_manage_inventory: !!(spuRow?.can_manage_inventory || mechRow?.can_manage_inventory),
            can_send_estimates:   !!(spuRow?.can_send_estimates   || mechRow?.can_send_estimates),
            can_send_invoice:     !!(spuRow?.can_send_invoice     || mechRow?.can_send_invoice),
          }
          if (spuRow || mechRow) setSpuPermissions(merged)
        })
        .catch(() => {})

      // Resolve mechanic name — mechanic.user is null due to user_profiles RLS
      // Use get_team_member_profiles which is SECURITY DEFINER
      if (data.assigned_mechanic_id && data.mechanic?.user_id) {
        try {
          const { data: profiles } = await supabase.rpc(
            'get_team_member_profiles',
            { provider_owner_auth_id: user.id }
          )
          const p = (profiles || []).find(pr => pr.user_id_from_mechanics === data.mechanic.user_id)
          if (p) setMechanicName(`${p.first_name || ''} ${p.last_name || ''}`.trim())
        } catch {}
      } else {
        setMechanicName('')
      }
    } catch (err) {
      setError(err.message || 'Failed to load work order')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  // ── Load estimate independently (not relying on ServicesTab mount) ────────
  const loadEstimate = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.rpc('calculate_work_order_estimate', {
        p_work_order_id:    params.id,
        p_provider_user_id: user.id,
      })
      if (data?.success) setEstimate(data)
    } catch {}
  }, [params.id])

  const loadMechanics = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Fetch mechanics for this provider
      const { data: profile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
      const { data: provider } = await supabase
        .from('service_providers_secure').select('id').eq('owner_user_id', profile.id).single()
      if (!provider) return

      const { data: mechanicsData } = await supabase
        .from('mechanics')
        .select('id, specialization, user_id, can_approve_work, can_manage_inventory')
        .eq('service_provider_id', provider.id)
        .eq('is_active', true)

      if (!mechanicsData?.length) { setMechanics([]); return }

      // Resolve names via SECURITY DEFINER function (bypasses user_profiles RLS)
      const { data: profiles } = await supabase.rpc(
        'get_team_member_profiles',
        { provider_owner_auth_id: user.id }
      )

      const merged = mechanicsData.map(m => {
        const p = (profiles || []).find(pr => pr.user_id_from_mechanics === m.user_id)
        return {
          ...m,
          user: p ? {
            first_name: p.first_name,
            last_name:  p.last_name,
          } : { first_name: 'Unknown', last_name: '' },
        }
      })

      // Deduplicate by user_id — keep the entry with a specialization if one exists
      const seen = new Map()
      for (const m of merged) {
        const existing = seen.get(m.user_id)
        if (!existing || (!existing.specialization && m.specialization)) {
          seen.set(m.user_id, m)
        }
      }

      setMechanics([...seen.values()])
    } catch (e) {
      console.error('loadMechanics error:', e.message)
    }
  }, [])

  useEffect(() => {
    if (params.id) {
      loadWorkOrder()
      loadMechanics()
      loadEstimate()
    }
  }, [params.id, loadWorkOrder, loadMechanics, loadEstimate])

  // Load shops + currencies + the cascade-related currency rows for the
  // overview inline editors. Runs whenever the work order's shop/currency
  // selections change so the editors stay in sync after saves.
  useEffect(() => {
    if (!wo) return
    let cancelled = false

    async function loadOverviewData () {
      const providerId        = wo.service_provider_id || wo.service_provider?.id
      const shopId            = wo.shop_id || null
      const providerCurId     = wo.service_provider?.currency_id || null
      // Note: wo.service_provider doesn't always include currency_id; fetch it if missing.
      const woCurId           = wo.currency_id || null

      // 1. Shops for this provider — for the inline shop dropdown.
      const shopsP = providerId
        ? supabase.from('shops_secure')
            .select('id, name, town, currency_id')
            .eq('service_provider_id', providerId)
            .order('name')
        : Promise.resolve({ data: [] })

      // 2. Full currencies list — for the free-pick dropdown.
      const currsP = supabase.from('currencies')
        .select('id, code, display_name, symbol, sort_order')
        .eq('is_active', true)
        .order('sort_order', { nullsFirst: false })
        .order('code')

      // 3. Provider's currency (display + cascade).
      const provCurP = providerCurId
        ? supabase.from('currencies').select('id, code, display_name, symbol').eq('id', providerCurId).single()
        : (providerId
            ? supabase.from('service_providers_secure')
                .select('currency:currencies(id, code, display_name, symbol)')
                .eq('id', providerId).single()
            : Promise.resolve({ data: null }))

      // 4. Work order's currency (display).
      const woCurP = woCurId
        ? supabase.from('currencies').select('id, code, display_name, symbol').eq('id', woCurId).single()
        : Promise.resolve({ data: null })

      const [{ data: shops }, { data: currs }, provRes, woRes] =
        await Promise.all([shopsP, currsP, provCurP, woCurP])
      if (cancelled) return

      setShopList(shops || [])
      setCurrencies(currs || [])
      // provRes might be either a currency row or a {currency: {...}} wrapper.
      setProviderCurrency(provRes?.data?.currency ?? provRes?.data ?? null)
      setWoCurrency(woRes?.data || null)

      // 5. Selected shop's currency_id (already in `shops`); fan out into a join.
      const selectedShop = (shops || []).find(s => s.id === shopId)
      if (selectedShop?.currency_id) {
        const { data: sc } = await supabase
          .from('currencies')
          .select('id, code, display_name, symbol')
          .eq('id', selectedShop.currency_id)
          .single()
        if (!cancelled) setShopCurrency(sc || null)
      } else {
        setShopCurrency(null)
      }
    }
    loadOverviewData()
    return () => { cancelled = true }
  }, [wo])

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
      const res  = await fetch(`/api/work-orders/${params.id}/assign-mechanic`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mechanicId: selectedMechanic }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to assign')
      setSuccess(`Mechanic assigned — notification sent${data.email_sent ? ' (email ✓)' : ''}${data.sms_sent ? ' (SMS ✓)' : ''}`)
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

  // ── Transition to internal_review — calls API for owner notification ──────
  const handleInternalReview = async () => {
    if (!confirm('Submit estimates for internal review?')) return
    setUpdating(true); setError(''); setSuccess('')
    try {
      const resp = await fetch(`/api/work-orders/${params.id}/internal-review`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed')
      if (data.notified) {
        const channels = [data.email_sent && 'email', data.sms_sent && 'SMS', 'in-app notification'].filter(Boolean).join(', ')
        setSuccess(`Submitted for internal review. Provider notified via ${channels}.`)
      } else {
        setSuccess('Submitted for internal review.')
      }
      await loadWorkOrder()
    } catch (err) { setError(err.message) }
    finally { setUpdating(false) }
  }

  // Check all services are completed/skipped and all parts are used/cancelled before QC
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
      const DONE_SVC   = ['completed','skipped','cancelled']
      const DONE_PART  = ['used','cancelled','returned']
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
    } catch { return true }  // fail open — don't block on network error
  }

  const advanceStatus = async (newStatusCode, skipConfirm = false) => {
    if (!skipConfirm && !confirm(`Move to "${newStatusCode.replace(/_/g,' ')}"?`)) return
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
      loadEstimate()
      await loadWorkOrder()
    } catch (e) { setError(e.message) }
    finally { setUpdating(false) }
  }

  // Called when a service/part is added after customer already approved —
  // silently transitions back to internal_review for re-review and re-send
  const handleReApprovalNeeded = async () => {
    try {
      const { data: statusRow } = await supabase
        .from('work_order_statuses').select('id').eq('code', 'internal_review').single()
      if (!statusRow) return
      await supabase.from('work_orders')
        .update({ status_id: statusRow.id, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      // Notify accountant/admin/owner that re-review is needed
      await fetch('/api/work-orders/' + params.id + '/internal-review', { method: 'POST' }).catch(() => {})
      await loadWorkOrder()
    } catch (e) { setError(e.message) }
  }

  const saveInternalNote = async () => {
    if (!internalNote.trim()) return
    setSavingNote(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
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

  // ── Overview: currency cascade ──────────────────────────────────────────
  // Rules (in order):
  //   1. Provider has set currency           -> locked to provider currency
  //   2. Provider has no currency,
  //      shop selected and shop has currency -> locked to shop currency
  //   3. Otherwise (no provider, no shop, or shop without currency)
  //                                           -> free pick from currencies list
  //
  // (Slightly different from inventory's order, where shop wins over provider —
  // the user asked for provider precedence here: "If provider has set currency
  // it should be fixed to provider currency".)
  const cascadeProviderCurrencyId = providerCurrency?.id || null
  const cascadeShopCurrencyId     = shopCurrency?.id     || null
  let   cascadeForced  = false
  let   cascadeSource  = 'free'   // 'provider' | 'shop' | 'free'
  let   cascadeCurId   = null
  let   cascadeCurName = null
  if (cascadeProviderCurrencyId) {
    cascadeForced  = true
    cascadeSource  = 'provider'
    cascadeCurId   = cascadeProviderCurrencyId
    cascadeCurName = providerCurrency?.code
  } else if (cascadeShopCurrencyId) {
    cascadeForced  = true
    cascadeSource  = 'shop'
    cascadeCurId   = cascadeShopCurrencyId
    cascadeCurName = shopCurrency?.code
  }

  // ── Save handlers for inline edits ───────────────────────────────────────
  const saveShop = async () => {
    setSavingShop(true); setError('')
    try {
      // null = clear assignment. Empty-string from <select> → null.
      const newShopId = draftShopId || null
      const { error: upErr } = await supabase
        .from('work_orders')
        .update({ shop_id: newShopId })
        .eq('id', wo.id)
      if (upErr) throw upErr
      setEditingShop(false)
      setSuccess('Shop updated')
      await loadWorkOrder()
    } catch (e) { setError(e.message) }
    finally { setSavingShop(false) }
  }

  const saveCurrency = async () => {
    setSavingCurrency(true); setError('')
    try {
      // If the cascade forces a value, write that — guards against stale UI
      // sending an old user pick after the cascade flipped.
      const newCurrencyId = cascadeForced
        ? cascadeCurId
        : (draftCurrencyId || null)
      const { error: upErr } = await supabase
        .from('work_orders')
        .update({ currency_id: newCurrencyId })
        .eq('id', wo.id)
      if (upErr) throw upErr
      setEditingCurrency(false)
      setSuccess('Currency updated')
      await loadWorkOrder()
    } catch (e) { setError(e.message) }
    finally { setSavingCurrency(false) }
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

  // Resolve owner from ALL available sources (handles both RPC & fallback paths)
  // Priority: 1) Booking customer  2) RPC-built wo.owner  3) Flat walk-in fields on WO
  const resolvedOwner = (() => {
    // 1. Booking customer (joined via booking relation)
    if (customer.first_name || customer.phone || customer.email) {
      return { ...customer, owner_type: 'booking_customer' }
    }
    // 2. RPC-resolved owner (get_work_order_with_details builds this)
    if (wo.owner && (wo.owner.first_name || wo.owner.phone || wo.owner.email)) {
      return wo.owner
    }
    // 3. Flat walk-in fields from work_orders_secure (fallback query path)
    if (wo.walk_in_owner_name || wo.walk_in_owner_phone || wo.walk_in_owner_email) {
      return {
        first_name: wo.walk_in_owner_name || null,
        last_name:  null,
        phone:      wo.walk_in_owner_phone || null,
        email:      wo.walk_in_owner_email || null,
        owner_type: 'walk_in',
      }
    }
    // 4. RPC owner that only has owner_type (e.g. company with no contact)
    if (wo.owner && wo.owner.owner_type) return wo.owner
    return null
  })()

  const shop          = wo.shop     || {}
  const mechanic      = wo.mechanic || {}
  const mechanicUser  = mechanic.user || wo.mechanic_profile || {}
  const assignStatus  = wo.mechanic_assignment_status
  const isTerminal    = ['completed','cancelled','closed'].includes(statusCode)
  // User can send estimates if they are owner, admin, accountant, or have SPU can_send_estimates
  const isAdminOrOwner      = isOwner || ['admin','accountant'].includes(spuPermissions.role)
  const canSendEstimatesAll = isAdminOrOwner || spuPermissions.can_send_estimates
  // Invoice permissions — owner/admin/accountant get full access; can_send_invoice gives full invoice access
  const canSendInvoice   = isAdminOrOwner || spuPermissions.can_send_invoice
  const canCheckout      = isAdminOrOwner || spuPermissions.can_approve_work
  const invoicePerms = {
    canGenerate:      canSendInvoice,   // anyone who can send can also generate
    canSendInvoice:   canSendInvoice,
    canRecordPayment: canSendInvoice,
    canConfirm:       canSendInvoice,
  }

  // Recommendation add gate:
  //   • Provider owner OR SPU admin → always (even after the WO is closed,
  //     so they can record follow-up work for the next visit)
  //   • Anyone else with can_approve_work → only while the WO is still
  //     open. Once it's terminal (closed/cancelled/completed), only the
  //     owner/admin can add further recommendations.
  // Mirrors add_maintenance_recommendation's server-side gate.
  const isProviderAdmin   = isOwner || spuPermissions.role === 'admin'
  const canAddRecommendation =
    isProviderAdmin
    || (!isTerminal && (spuPermissions.can_approve_work || isAdminOrOwner))

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
          <button
            onClick={async () => { setRefreshing(true); await loadWorkOrder(); setRefreshing(false) }}
            disabled={refreshing}
            title="Refresh"
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
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

            {/* Assigned mechanic pending acknowledgement banner */}
            {wo.assigned_mechanic_id && assignStatus === 'pending' && (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-yellow-50 border border-yellow-300 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse flex-shrink-0" />
                  <span className="text-yellow-800 font-medium">
                    Waiting for {mechanicName || 'mechanic'} to acknowledge
                  </span>
                </div>
                <button
                  onClick={() => { supabase.from('work_orders').update({ assigned_mechanic_id: null, mechanic_assignment_status: null }).eq('id', params.id).then(() => loadWorkOrder()) }}
                  className="text-xs text-red-600 hover:underline flex-shrink-0"
                >
                  Reassign
                </button>
              </div>
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
              {/* Diagnosing → Services & Parts Estimates (requires issues populated) */}
              if (action.requires_issues) {
                const issuesReady = issueCount !== null && issueCount > 0
                return (
                  <div key={action.code} className="flex flex-col gap-1.5">
                    {!issuesReady && issueCount !== null && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Document at least one issue/diagnostic before moving to estimates
                      </p>
                    )}
                    <button
                      onClick={() => {
                        if (!issuesReady) {
                          setActiveTab('issues')
                          setError('Please document at least one issue/diagnostic finding before moving to Services & Parts Estimates.')
                          return
                        }
                        advanceStatus(action.code)
                      }}
                      disabled={updating}
                      className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${!issuesReady ? 'opacity-60' : ''} ${action.color}`}>
                      {updating && <Loader2 size={13} className="animate-spin" />}
                      {action.label}
                    </button>
                  </div>
                )
              }

              {/* Services & Parts Estimates → Internal Review (requires services populated) */}
              if (action.requires_estimates) {
                const servicesReady = serviceCount !== null && serviceCount > 0
                return (
                  <div key={action.code} className="flex flex-col gap-1.5">
                    {!servicesReady && serviceCount !== null && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Add at least one service or part before submitting for review
                      </p>
                    )}
                    <button
                      onClick={() => {
                        if (!servicesReady) {
                          setActiveTab('services')
                          setError('Add at least one service or part estimate before submitting for internal review.')
                          return
                        }
                        ;(async () => {
                          await advanceStatus('internal_review', true)
                          await handleInternalReview().catch(() => {})
                        })()
                      }}
                      disabled={updating}
                      className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${!servicesReady ? 'opacity-60' : ''} ${action.color}`}>
                      {updating && <Loader2 size={13} className="animate-spin" />}
                      {action.label}
                    </button>
                  </div>
                )
              }

              {/* Internal Review → EstimateReviewPanel (owner, admin, accountant, or can_send_estimates) */}
              if (action.via_internal_review) {
                return (
                  <div key={action.code} className="w-full">
                    <EstimateReviewPanel
                      workOrder={woWithProvider}
                      canSend={canSendEstimatesAll}
                      estimate={estimate}
                      onSent={() => { loadWorkOrder(); setSuccess('Estimate sent to customer for approval.') }}
                    />
                  </div>
                )
              }

              if (action.code === 'awaiting_approval') {
                return null  // handled by via_internal_review above
              }
              if (action.code === 'quality_check') {
                return (
                  <div key={action.code} className="flex flex-col gap-1.5">
                    {qcBlockReason && (
                      <p className="text-xs text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} /> {qcBlockReason}
                      </p>
                    )}
                    <button
                      onClick={async () => {
                        const ready = await validateQcReady()
                        if (!ready) return
                        advanceStatus('quality_check')
                        setActiveTab('qc')
                      }}
                      disabled={updating}
                      className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 ${action.color}`}>
                      {updating && <Loader2 size={13} className="animate-spin" />}
                      {action.label}
                    </button>
                  </div>
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
              Go to the <span className="font-semibold text-blue-700">Checkout tab</span> below, complete the road-test checklist and submit — this will clear the action and notify the customer.
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
                  {resolvedOwner ? (
                    <div className="space-y-1 text-sm">
                      {(resolvedOwner.first_name || resolvedOwner.last_name) ? (
                        <p className="font-semibold text-gray-900">
                          {resolvedOwner.first_name || ''}{resolvedOwner.last_name ? ` ${resolvedOwner.last_name}` : ''}
                        </p>
                      ) : (
                        <p className="font-medium text-gray-600 italic">Name not provided</p>
                      )}
                      {resolvedOwner.phone && <p className="text-gray-600">{resolvedOwner.phone}</p>}
                      {resolvedOwner.email && <p className="text-gray-500">{resolvedOwner.email}</p>}
                      {resolvedOwner.owner_type === 'booking_customer' && booking.booking_number && (
                        <button onClick={() => router.push(`/provider/bookings/${wo.booking_id}`)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs mt-1">
                          <Hash size={11} /> Booking #{booking.booking_number} <ExternalLink size={10} />
                        </button>
                      )}
                      {resolvedOwner.owner_type === 'company' && (
                        <p className="text-xs text-blue-600">Company fleet</p>
                      )}
                      {resolvedOwner.owner_type === 'walk_in' && (
                        <p className="text-xs text-amber-600">Walk-in · not linked to account</p>
                      )}
                      {resolvedOwner.owner_type === 'individual' && (
                        <p className="text-xs text-green-600">Registered owner</p>
                      )}
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
                  <div className="space-y-3 text-sm">

                    {/* ── Inline-editable Shop ── */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-400">Shop</p>
                        {!editingShop && !isTerminal && (
                          <button
                            onClick={() => { setDraftShopId(wo.shop_id || ''); setEditingShop(true) }}
                            className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                            title="Change shop"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        )}
                      </div>

                      {editingShop ? (
                        <div className="mt-1 space-y-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
                          <select
                            value={draftShopId}
                            onChange={e => setDraftShopId(e.target.value)}
                            disabled={savingShop}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-400"
                          >
                            <option value="">— No shop (provider-wide) —</option>
                            {shopList.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name}{s.town ? ` · ${s.town}` : ''}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-gray-500">
                            Changing the shop may also change the work order's billing currency if the new shop has its own currency.
                          </p>
                          <div className="flex gap-2">
                            <button onClick={saveShop} disabled={savingShop}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1">
                              {savingShop ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                              Save
                            </button>
                            <button onClick={() => setEditingShop(false)} disabled={savingShop}
                              className="px-3 py-1 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : shop.name ? (
                        <div>
                          <p className="font-medium text-gray-900">{shop.name}</p>
                          <p className="text-gray-500">{[shop.town, shop.county].filter(Boolean).join(', ')}</p>
                        </div>
                      ) : (
                        <p className="text-gray-400 italic">No shop assigned</p>
                      )}
                    </div>

                    {/* ── Inline Billing Currency ── */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-400 inline-flex items-center gap-1">
                          <DollarSign size={11} /> Billing Currency
                        </p>
                        {!editingCurrency && !isTerminal && (
                          <button
                            onClick={() => {
                              setDraftCurrencyId(wo.currency_id || cascadeCurId || '')
                              setEditingCurrency(true)
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                            title="Change currency"
                          >
                            <Edit3 size={11} /> Edit
                          </button>
                        )}
                      </div>

                      {editingCurrency ? (
                        <div className="mt-1 space-y-2 bg-blue-50 border border-blue-100 rounded-lg p-2">
                          {cascadeForced ? (
                            <>
                              <div className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded px-2 py-1.5">
                                <Lock size={12} className="text-gray-400" />
                                <span className="font-medium text-gray-900">
                                  {cascadeCurName || 'Currency'}
                                </span>
                                <span className="text-[10px] uppercase tracking-wide font-medium text-gray-500 ml-auto">
                                  from {cascadeSource}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-600 flex items-start gap-1">
                                <Info size={11} className="flex-shrink-0 mt-0.5" />
                                {cascadeSource === 'provider'
                                  ? <>Locked to your provider currency. To use a different one for this work order, clear your provider currency in Settings → Business Profile.</>
                                  : <>Locked to the selected shop's currency. Switch shops above to change, or clear the shop's currency in shop settings.</>}
                              </p>
                            </>
                          ) : (
                            <>
                              <select
                                value={draftCurrencyId}
                                onChange={e => setDraftCurrencyId(e.target.value)}
                                disabled={savingCurrency || currencies.length === 0}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-400"
                              >
                                <option value="">— Select currency —</option>
                                {currencies.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.code}{c.symbol ? ` (${c.symbol})` : ''} — {c.display_name}
                                  </option>
                                ))}
                              </select>
                              <p className="text-[11px] text-gray-600 flex items-start gap-1">
                                <Info size={11} className="flex-shrink-0 mt-0.5" />
                                Neither your provider nor the selected shop has set a default currency. Pick one for this work order. Setting a default in Settings will lock this for future work orders.
                              </p>
                            </>
                          )}
                          <div className="flex gap-2">
                            <button onClick={saveCurrency} disabled={savingCurrency || (!cascadeForced && !draftCurrencyId)}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1">
                              {savingCurrency ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                              Save
                            </button>
                            <button onClick={() => setEditingCurrency(false)} disabled={savingCurrency}
                              className="px-3 py-1 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {woCurrency
                              ? <>{woCurrency.code}{woCurrency.symbol ? ` (${woCurrency.symbol})` : ''} <span className="text-gray-400 font-normal">— {woCurrency.display_name}</span></>
                              : <span className="text-gray-400 italic">Not set</span>}
                          </p>
                          {cascadeForced && (
                            <span className="text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 inline-flex items-center gap-1">
                              <Lock size={9} /> from {cascadeSource}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Mechanic</p>
                      {(mechanicName || mechanic.id) ? (
                        <div className="space-y-1">
                          <p className="font-medium text-gray-900">
                            {mechanicName || 'Mechanic'}
                            {mechanic.specialization && (
                              <span className="text-gray-400 font-normal"> · {mechanic.specialization}</span>
                            )}
                          </p>
                          {assignStatus === 'pending' && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />
                              Awaiting acknowledgement
                            </span>
                          )}
                          {assignStatus === 'acknowledged' && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                              Acknowledged
                            </span>
                          )}
                          {assignStatus === 'declined' && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                              Declined
                              {wo.mechanic_decline_reason && (
                                <span className="text-red-600"> · {wo.mechanic_decline_reason}</span>
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm italic">Not assigned</p>
                      )}
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
                    {booking.booking_services.map((bs, i) => {
                      // booking_services has no currency column — these estimates
                      // are entered at booking time and implicitly use the work
                      // order's currency. Show the WO currency code, or just the
                      // number if none is set.
                      const num    = bs.estimated_cost ? Number(bs.estimated_cost).toLocaleString(undefined, { maximumFractionDigits: 2 }) : null
                      const prefix = woCurrency ? (woCurrency.symbol || woCurrency.code) : ''
                      return (
                        <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                          {bs.service?.name}
                          {num ? ` · ${prefix ? `${prefix} ${num}` : num}` : ''}
                        </span>
                      )
                    })}
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
                    ].map(({ label, val, bold }) => {
                      // Render in the work order's currency. The estimate
                      // numbers are computed in the work order's currency by
                      // the services tab (parts converted via their snapshot
                      // exchange_rate, services priced directly), so there's
                      // no further conversion needed here — only labeling.
                      const num    = Number(val || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
                      const prefix = woCurrency
                        ? (woCurrency.symbol || woCurrency.code)
                        : ''
                      return (
                        <div key={label}>
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className={`${bold ? 'font-bold text-blue-900 text-base' : 'font-medium text-gray-800'}`}>
                            {prefix ? `${prefix} ${num}` : num}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  {!woCurrency && (
                    <p className="text-[11px] text-amber-700 mt-2">
                      No billing currency set for this work order — totals shown without a currency label.
                    </p>
                  )}
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
              onServiceAdded={() => setServiceCount(c => (c || 0) + 1)}
                onReApprovalNeeded={handleReApprovalNeeded}
            />
          )}

          {/* ── PARTS TAB ── */}
          {activeTab === 'parts' && (
            <PartsTab workOrder={woWithProvider} onReApprovalNeeded={handleReApprovalNeeded} />
          )}

          {/* ── ISSUES TAB ── */}
          {activeTab === 'issues' && (
            <IssuesTab workOrder={woWithProvider} onIssueAdded={() => setIssueCount(c => (c || 0) + 1)} />
          )}

          {/* ── INVOICE TAB ── */}
          {activeTab === 'invoice' && (
            <InvoiceTab workOrder={woWithProvider} permissions={invoicePerms} />
          )}

          {/* ── RECEIPT TAB ── */}
          {activeTab === 'receipt' && (
            <ReceiptTab workOrder={woWithProvider} canConfirm={invoicePerms.canConfirm} />
          )}

          {/* ── CHECKOUT TAB ── */}
          {activeTab === 'checkout' && (
            <CheckoutTab
              workOrder={woWithProvider}
              canCheckout={canCheckout}
              onStatusChange={(code) => { loadWorkOrder() }}
            />
          )}

          {/* ── RECOMMENDATIONS TAB ── */}
          {activeTab === 'recommendations' && (
            <RecommendationsTab workOrder={woWithProvider} canAdd={canAddRecommendation} />
          )}

          {/* ── QC & COMPLETE TAB ── */}
          {activeTab === 'qc' && (
            <QualityCheckTab
              workOrder={woWithProvider}
              canSendInvoice={canSendInvoice}
              onStatusChange={async (event) => {
                if (event === 'go_to_invoice') {
                  setActiveTab('invoice')
                  return
                }
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