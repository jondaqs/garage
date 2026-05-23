'use client'

/**
 * Shared fleet-vehicle detail view.
 *
 * Rendered by both:
 *   • /company/fleet/[vehicleId]                       (company owner portal)
 *   • /dashboard/company/[companyId]/fleet/[vehicleId] (company member view)
 *
 * Both surfaces show the same vehicle details and history; only outbound
 * URLs and the company-resolution path differ.
 *
 * `basePath` drives every internal router.push so links stay within the
 * caller's portal. `companyIdHint` is optional — when the route already
 * knows the company (member route reads it from the URL) we use it
 * directly; otherwise we resolve it from the caller's owned/membership
 * record. Only admins / owners get write powers (Edit + Delete), but
 * everyone permitted to view a fleet vehicle can read the detail.
 */

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  ArrowLeft, Truck, Calendar, Gauge, Hash, Palette,
  AlertCircle, Clock, Wrench, Pencil, Trash2, X, Check
} from 'lucide-react'

const supabase = createClient()

export default function FleetVehicleDetailView({ basePath = '/company', companyIdHint = null }) {
  const { vehicleId } = useParams()
  const router = useRouter()

  const [vehicle, setVehicle]     = useState(null)
  const [history, setHistory]     = useState([])
  const [companyId, setCompanyId] = useState(companyIdHint)
  // Tracks whether the caller has admin powers (company owner OR
  // company_users.is_admin). Used to gate Edit/Delete buttons; non-admin
  // members can still view this page in read-only mode.
  // Permission gates. Owner is the company owner; admin is any active
  // company_user.is_admin; can_manage_fleet is the explicit per-member flag.
  //   • canEdit  → owner OR admin OR can_manage_fleet
  //   • canDelete → owner OR admin (owner deletes immediately; admin
  //                 raises a deletion request that the owner approves)
  const [isOwner,   setIsOwner]   = useState(false)
  const [profileId, setProfileId] = useState(null)
  const [canEdit,   setCanEdit]   = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  // Edit state
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [editForm, setEditForm]   = useState({})
  const [editError, setEditError] = useState('')

  // Delete / deletion-request state
  //   pendingRequest: the current 'pending' row in fleet_deletion_requests
  //   for this vehicle, or null. Drives the approval panel.
  //   confirming + deleting: legacy state for the owner's immediate-delete
  //   confirmation modal; admins use the requestModal instead.
  const [pendingRequest, setPendingRequest] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [requestModal, setRequestModal]     = useState(false)
  const [requestReason, setRequestReason]   = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [workflowError, setWorkflowError]   = useState(null)
  const [actingOnRequest, setActingOnRequest] = useState(false)

  useEffect(() => {
    if (vehicleId) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) throw new Error('Profile not found')
      setProfileId(profile.id)

      // Resolve permissions. Owner of any company gets both edit + delete.
      // Members get edit if is_admin OR can_manage_fleet; delete only if
      // is_admin (Phase 1).
      const { data: owned } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('owner_user_id', profile.id)
        .maybeSingle()

      if (owned) {
        if (!companyIdHint) setCompanyId(owned.id)
        setIsOwner(true)
        setCanEdit(true)
        setCanDelete(true)
      } else {
        const { data: mem } = await supabase
          .from('company_users')
          .select('company_id, is_admin, can_manage_fleet')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle()
        if (mem) {
          if (!companyIdHint) setCompanyId(mem.company_id)
          setCanEdit(!!(mem.is_admin || mem.can_manage_fleet))
          setCanDelete(!!mem.is_admin)
        }
      }

      // Load vehicle (read access is governed by RLS — non-admin members
      // can still view their fleet vehicles, just not mutate them)
      const { data: v, error: vErr } = await supabase
        .from('vehicles')
        .select('id, plate_number, make, model, year_of_manufacture, color, vin, created_at, updated_at')
        .eq('id', vehicleId)
        .single()

      if (vErr) throw vErr
      setVehicle(v)
      setEditForm({
        plate_number:        v.plate_number,
        make:                v.make                ?? '',
        model:               v.model               ?? '',
        year_of_manufacture: v.year_of_manufacture ?? '',
        color:               v.color               ?? '',
        vin:                 v.vin                 ?? '',
      })

      // Load enriched service history timeline
      const { data: timelineResult } = await supabase.rpc('get_vehicle_history_timeline', {
        p_vehicle_id:      vehicleId,
        p_requesting_user: user.id,
        p_limit:           30,
      })
      let historyData = []
      if (timelineResult?.success && timelineResult.timeline) {
        historyData = timelineResult.timeline
      } else {
        const { data: h } = await supabase
          .from('vehicle_history')
          .select(`
            id, mileage, recorded_at, event_type, description,
            work_order:work_orders(id, work_order_number, problem_description,
              status:work_order_statuses(display_name)
            ),
            service_provider:service_providers(name)
          `)
          .eq('vehicle_id', vehicleId)
          .order('recorded_at', { ascending: false })
        .limit(20)

        historyData = h ?? []
      }
      setHistory(historyData)

      // Any current pending deletion request on this vehicle? RLS limits
      // this to the caller's company. Used to drive the approval/cancel
      // UI panel inline with the detail view.
      const { data: pending } = await supabase
        .from('fleet_deletion_requests')
        .select(`
          id, status, requested_at, request_reason,
          requested_by_user_id,
          requester:user_profiles!requested_by_user_id(first_name, last_name)
        `)
        .eq('vehicle_id', vehicleId)
        .eq('status', 'pending')
        .maybeSingle()
      setPendingRequest(pending || null)
    } catch (err) {
      console.error(err)
      setError('Failed to load vehicle details.')
    } finally {
      setLoading(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  // Plate and VIN are immutable after creation — the server-side
  // update_fleet_vehicle RPC ignores p_plate_number and p_vin. We still
  // pass them so the function signature stays satisfied; the current
  // values flow through unchanged.
  const handleSave = async () => {
    setSaving(true)
    setEditError('')

    try {
      const { error: rpcErr } = await supabase.rpc('update_fleet_vehicle', {
        p_vehicle_id:          vehicleId,
        p_plate_number:        editForm.plate_number,
        p_make:                editForm.make,
        p_model:               editForm.model,
        p_year_of_manufacture: editForm.year_of_manufacture ? parseInt(editForm.year_of_manufacture) : null,
        p_color:               editForm.color || null,
        p_vin:                 editForm.vin || null,
        p_owner_company_id:    companyId,
      })

      if (rpcErr) throw rpcErr

      setVehicle(prev => ({
        ...prev,
        ...editForm,
        // Plate and VIN aren't actually being changed server-side; preserve
        // the existing values in local state so the UI is consistent.
        plate_number: prev.plate_number,
        vin:          prev.vin,
        year_of_manufacture: editForm.year_of_manufacture ? parseInt(editForm.year_of_manufacture) : null,
      }))
      setEditing(false)
    } catch (err) {
      setEditError(err?.message ?? 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditError('')
    setEditForm({
      plate_number:        vehicle.plate_number,
      make:                vehicle.make                ?? '',
      model:               vehicle.model               ?? '',
      year_of_manufacture: vehicle.year_of_manufacture ?? '',
      color:               vehicle.color               ?? '',
      vin:                 vehicle.vin                 ?? '',
    })
  }

  // ── Delete / deletion workflow ────────────────────────────────────────────
  // Owner path: calls request_fleet_vehicle_deletion which auto-approves
  //   and deactivates the vehicle. The same RPC handles both cases —
  //   the result.status tells us which path was taken.
  // Admin path: calls request_fleet_vehicle_deletion which creates a
  //   pending request and notifies the owner.
  const handleDelete = async () => {
    setDeleting(true)
    setWorkflowError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('request_fleet_vehicle_deletion', {
        p_vehicle_id: vehicleId,
        p_reason:     requestReason?.trim() || null,
      })
      if (rpcErr) throw rpcErr
      if (data?.success === false) throw new Error(data.error || 'Failed')

      // Owner-initiated: the vehicle is already deactivated. Route back.
      if (data?.status === 'approved') {
        router.push(`${basePath}/fleet`)
        return
      }
      // Admin path: now there's a pending request. Refresh and close modal.
      setRequestModal(false)
      setConfirming(false)
      setRequestReason('')
      // Re-fetch the request so the approval banner appears.
      const { data: pending } = await supabase
        .from('fleet_deletion_requests')
        .select(`
          id, status, requested_at, request_reason,
          requested_by_user_id,
          requester:user_profiles!requested_by_user_id(first_name, last_name)
        `)
        .eq('vehicle_id', vehicleId)
        .eq('status', 'pending')
        .maybeSingle()
      setPendingRequest(pending || null)
    } catch (err) {
      setWorkflowError(err?.message ?? 'Failed')
    } finally {
      setDeleting(false)
    }
  }

  // Owner approves the pending request → vehicle gets deactivated server-side.
  const handleApprove = async () => {
    if (!pendingRequest) return
    setActingOnRequest(true)
    setWorkflowError(null)
    try {
      const { data, error: e } = await supabase.rpc('approve_fleet_vehicle_deletion', {
        p_request_id: pendingRequest.id,
        p_reason:     decisionReason?.trim() || null,
      })
      if (e) throw e
      if (data?.success === false) throw new Error(data.error || 'Failed')
      router.push(`${basePath}/fleet`)
    } catch (err) {
      setWorkflowError(err?.message ?? 'Failed')
      setActingOnRequest(false)
    }
  }

  // Owner rejects the pending request → request stays in history as rejected.
  const handleReject = async () => {
    if (!pendingRequest) return
    setActingOnRequest(true)
    setWorkflowError(null)
    try {
      const { data, error: e } = await supabase.rpc('reject_fleet_vehicle_deletion', {
        p_request_id: pendingRequest.id,
        p_reason:     decisionReason?.trim() || null,
      })
      if (e) throw e
      if (data?.success === false) throw new Error(data.error || 'Failed')
      setPendingRequest(null)
      setDecisionReason('')
    } catch (err) {
      setWorkflowError(err?.message ?? 'Failed')
    } finally {
      setActingOnRequest(false)
    }
  }

  // Admin cancels their own pending request.
  const handleCancelRequest = async () => {
    if (!pendingRequest) return
    setActingOnRequest(true)
    setWorkflowError(null)
    try {
      const { data, error: e } = await supabase.rpc('cancel_fleet_vehicle_deletion', {
        p_request_id: pendingRequest.id,
      })
      if (e) throw e
      if (data?.success === false) throw new Error(data.error || 'Failed')
      setPendingRequest(null)
    } catch (err) {
      setWorkflowError(err?.message ?? 'Failed')
    } finally {
      setActingOnRequest(false)
    }
  }

  const field = (key, value) => setEditForm(prev => ({ ...prev, [key]: value }))

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (error || !vehicle) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <p>{error ?? 'Vehicle not found.'}</p>
    </div>
  )

  const latestMileage = history.find(h => h.mileage)?.mileage

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
      >
        <ArrowLeft size={18} />
        Back to Fleet
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-blue-100 rounded-xl">
          <Truck className="w-7 h-7 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{vehicle.plate_number}</h1>
          <p className="text-gray-500">
            {[vehicle.year_of_manufacture, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
          </p>
        </div>
        {pendingRequest ? (
          <span className="ml-auto px-3 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-full">
            Pending deletion
          </span>
        ) : (
          <span className="ml-auto px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
            Active
          </span>
        )}
      </div>

      {/* Pending deletion-request panel
          Shown whenever there's a pending request on this vehicle. Drives
          the workflow visually:
            • Owner   → Approve / Reject buttons + decision-reason input
            • Admin who raised it → "Cancel my request"
            • Anyone else permitted to see this (e.g. another admin) → info banner
          Hides itself when no pending request exists. */}
      {pendingRequest && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">Deletion requested</p>
              <p className="text-amber-800 text-xs mt-0.5">
                Requested by{' '}
                <span className="font-medium">
                  {pendingRequest.requester?.first_name} {pendingRequest.requester?.last_name}
                </span>
                {' on '}
                {new Date(pendingRequest.requested_at).toLocaleDateString('en-KE',
                  { day: 'numeric', month: 'short', year: 'numeric' })}.
              </p>
              {pendingRequest.request_reason && (
                <p className="text-sm text-amber-900 mt-2 italic">
                  "{pendingRequest.request_reason}"
                </p>
              )}
            </div>
          </div>

          {workflowError && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {workflowError}
            </div>
          )}

          {/* Owner branch — Approve / Reject */}
          {isOwner && (
            <div className="mt-3 space-y-2">
              <textarea
                value={decisionReason}
                onChange={e => setDecisionReason(e.target.value)}
                placeholder="Reason / note (optional)..."
                rows={2}
                className="w-full p-2 text-sm border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  disabled={actingOnRequest}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {actingOnRequest
                    ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    : <Trash2 size={13} />}
                  Approve & delete
                </button>
                <button
                  onClick={handleReject}
                  disabled={actingOnRequest}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50"
                >
                  <X size={13} />
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Requester branch — Cancel my request */}
          {!isOwner && pendingRequest.requested_by_user_id === profileId && (
            <div className="mt-3">
              <button
                onClick={handleCancelRequest}
                disabled={actingOnRequest}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-800 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50"
              >
                {actingOnRequest
                  ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-amber-800" />
                  : <X size={13} />}
                Cancel my request
              </button>
            </div>
          )}

          {/* Other admin viewing — informational only */}
          {!isOwner && pendingRequest.requested_by_user_id !== profileId && (
            <p className="text-xs text-amber-800 mt-2 italic">
              Awaiting owner approval. Only the requester can cancel.
            </p>
          )}
        </div>
      )}

      {/* Details card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Vehicle Details</h2>

          {/* Actions — Edit and Delete are gated independently.
              • Edit   → anyone with edit rights (owner / admin / can_manage_fleet)
              • Delete → admin or owner. Owner sees "Delete" (immediate, with
                         confirmation modal). Admin sees "Request deletion"
                         (raises a pending request the owner approves).
              When a pending deletion request already exists for this
              vehicle, neither button shows — the approval/cancel panel
              below takes over. */}
          {!editing && companyId && !pendingRequest && (canEdit || canDelete) && (
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <Pencil size={14} />
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => isOwner ? setConfirming(true) : setRequestModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 size={14} />
                  {isOwner ? 'Delete' : 'Request deletion'}
                </button>
              )}
            </div>
          )}

          {editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving
                  ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                  : <Check size={14} />}
                Save
              </button>
            </div>
          )}
        </div>

        {editError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
            <AlertCircle size={15} />
            {editError}
          </div>
        )}

        {/* View mode */}
        {!editing && (
          <div className="grid grid-cols-2 gap-4">
            <DetailRow icon={<Hash size={14} />}     label="Plate Number"       value={<span className="font-mono">{vehicle.plate_number}</span>} />
            <DetailRow icon={<Truck size={14} />}    label="Make & Model"       value={`${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || '—'} />
            <DetailRow icon={<Calendar size={14} />} label="Year"               value={vehicle.year_of_manufacture ?? '—'} />
            <DetailRow icon={<Palette size={14} />}  label="Color"              value={<span className="capitalize">{vehicle.color ?? '—'}</span>} />
            {vehicle.vin && (
              <DetailRow icon={<Hash size={14} />}   label="VIN"                value={<span className="font-mono">{vehicle.vin}</span>} span />
            )}
            {latestMileage && (
              <DetailRow icon={<Gauge size={14} />}  label="Last Recorded Mileage" value={`${latestMileage.toLocaleString()} km`} />
            )}
            <DetailRow icon={<Clock size={14} />}    label="Added"              value={new Date(vehicle.created_at).toLocaleDateString()} />
          </div>
        )}

        {/* Edit mode */}
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Plate Number
                <span className="ml-2 text-gray-400 font-normal">(cannot be changed)</span>
              </label>
              <input
                type="text"
                value={editForm.plate_number}
                disabled
                maxLength={16}
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg font-mono uppercase tracking-widest cursor-not-allowed"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Make *</label>
                <input
                  type="text"
                  value={editForm.make}
                  onChange={e => field('make', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Model *</label>
                <input
                  type="text"
                  value={editForm.model}
                  onChange={e => field('model', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                <input
                  type="number"
                  value={editForm.year_of_manufacture}
                  onChange={e => field('year_of_manufacture', e.target.value)}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Color</label>
                <input
                  type="text"
                  value={editForm.color}
                  onChange={e => field('color', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                VIN
                <span className="ml-2 text-gray-400 font-normal">(cannot be changed)</span>
              </label>
              <input
                type="text"
                value={editForm.vin}
                disabled
                maxLength={17}
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg font-mono uppercase text-sm cursor-not-allowed"
              />
            </div>
          </div>
        )}
      </div>

      {/* Owner-only immediate-delete confirmation modal */}
      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-900">Delete Vehicle</h3>
            </div>
            <p className="text-gray-600 text-sm mb-2">
              Remove <span className="font-semibold">{vehicle.plate_number}</span> from the active fleet?
            </p>
            <p className="text-gray-500 text-xs mb-5">
              The vehicle will be deactivated (not erased) and its service history is preserved. You can restore it later from the fleet page unless someone else registers it in the meantime.
            </p>
            {workflowError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                {workflowError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirming(false); setWorkflowError(null) }}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {deleting
                  ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  : <Trash2 size={15} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin-only deletion-request modal. Same RPC as the owner path, but
          for non-owners it doesn't auto-approve — it creates a pending
          request the owner must approve. The reason field is forwarded
          server-side and surfaces in the owner's approval panel. */}
      {requestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-700" />
              </div>
              <h3 className="font-semibold text-gray-900">Request deletion</h3>
            </div>
            <p className="text-gray-600 text-sm mb-3">
              Send a deletion request to the company owner for{' '}
              <span className="font-semibold">{vehicle.plate_number}</span>. The vehicle will only be deactivated once the owner approves.
            </p>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reason (optional)</label>
            <textarea
              value={requestReason}
              onChange={e => setRequestReason(e.target.value)}
              rows={3}
              placeholder="e.g. Vehicle sold, replaced, decommissioned..."
              className="w-full p-2 text-sm border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-amber-500"
            />
            {workflowError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                {workflowError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setRequestModal(false); setRequestReason(''); setWorkflowError(null) }}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {deleting
                  ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  : <AlertCircle size={15} />}
                Submit request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Service history */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Service History</h2>
          <Link
            href={`${basePath}/bookings/new?vehicleId=${vehicleId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Wrench className="w-3.5 h-3.5" />
            Book Service
          </Link>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-10">
            <Wrench className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No service history yet</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-4 bottom-4 w-px bg-gray-200" />
            <div className="space-y-4">
              {history.map((h, idx) => {
                const eventType = h.event_type || 'service_completed'
                const timestamp = h.recorded_at
                const mileage   = h.mileage
                const provider  = h.provider || h.service_provider
                const wo        = h.work_order
                const services  = h.services || []
                const totalAmt  = h.total_amount || wo?.total_amount
                const desc      = h.description || wo?.problem_description || ''
                const dotColor  = {
                  service_completed: 'bg-green-500',
                  checkin:           'bg-blue-500',
                  checkout:          'bg-blue-400',
                  issue_found:       'bg-orange-500',
                }[eventType] || 'bg-gray-400'
                const eventLabel = {
                  service_completed: 'Service Completed',
                  checkin:           'Vehicle Check-in',
                  checkout:          'Vehicle Check-out',
                  issue_found:       'Issue Found',
                }[eventType] || 'Service Event'
                return (
                  <div key={h.id || idx} className="flex items-start gap-4 pl-10 relative">
                    <div className={`absolute left-4 top-4 w-3 h-3 rounded-full border-2 border-white ${dotColor}`} />
                    <div className="flex-1 bg-gray-50 rounded-lg p-4 border border-gray-100">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{eventLabel}</p>
                          {provider?.name && <p className="text-xs text-gray-500 mt-0.5">{provider.name}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">
                            {new Date(timestamp).toLocaleDateString('en-KE', {day:'numeric',month:'short',year:'numeric'})}
                          </p>
                          {mileage && <p className="text-xs text-gray-500 mt-0.5">{mileage.toLocaleString()} km</p>}
                        </div>
                      </div>
                      {services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {services.map((svc, si) => (
                            <span key={si} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{svc}</span>
                          ))}
                        </div>
                      )}
                      {desc && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{desc}</p>}
                      {(wo?.id || totalAmt) && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                          {wo?.id && (
                            <button
                              onClick={() => router.push(`${basePath}/work-orders/${wo.id}`)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                              {wo.work_order_number ? 'WO ' + wo.work_order_number : 'View Work Order'} →
                            </button>
                          )}
                          {totalAmt && (
                            <span className="text-xs font-semibold text-gray-700 ml-auto">KES {Number(totalAmt).toLocaleString()}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value, span }) {
  return (
    <div className={`flex items-start gap-3 ${span ? 'col-span-2' : ''}`}>
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  )
}