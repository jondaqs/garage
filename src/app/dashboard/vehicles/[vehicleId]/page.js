// src/app/dashboard/vehicles/[vehicleId]/page.js
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import VehicleSpendWidget from '@/components/VehicleSpendWidget'
import {
  ArrowLeft, Car, Calendar, Gauge, Hash, Palette,
  AlertCircle, Clock, Wrench, Pencil, Trash2, X, Check,
  Download, Loader2
} from 'lucide-react'

const supabase = createClient()

export default function VehicleDetailPage() {
  const { vehicleId } = useParams()
  const router = useRouter()

  const [vehicle, setVehicle]   = useState(null)
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Set to true when the vehicle has been deactivated (soft-deleted) or
  // when its ownership row no longer ties it to the current user. In
  // either case the page becomes read-only: the editable detail card is
  // replaced by a summary notice and the Edit / Delete / Book Service
  // controls are hidden. Service history stays visible because it's
  // still useful as a historical record.
  const [inactiveForUser, setInactiveForUser] = useState(false)
  const [deactivatedAt, setDeactivatedAt]     = useState(null)

  // Edit state
  const [editing, setEditing]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')

  // Delete state
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  // Report download state
  const [downloading, setDownloading] = useState(false)

  // Spend summary (lifted from VehicleSpendWidget so we have it available
  // for the downloadable report. The widget still renders its own copy
  // for the on-page view — both pull from the same RPC.)
  const [spend, setSpend] = useState(null)

  useEffect(() => {
    if (vehicleId) loadData()
  }, [vehicleId])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Resolve the caller's profile id — needed to detect whether the
      // current ownership row still ties this vehicle to this user.
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      const profileId = profile?.id || null

      // Load vehicle. is_active / deactivated_at are needed to detect
      // soft-deleted vehicles. RLS vehicles_select_personal covers the
      // active case; vehicles_select_history covers the soft-deleted
      // one, so a previous owner can still view the detail page.
      const { data: v, error: vErr } = await supabase
        .from('vehicles')
        .select('id, plate_number, make, model, year_of_manufacture, color, vin, created_at, updated_at, is_active, deactivated_at')
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

      // Determine whether this vehicle is still in the caller's active
      // garage. Two cases mark it inactive:
      //   1. vehicles.is_active === false (soft-deleted).
      //   2. No vehicle_ownership row currently ties this vehicle to the
      //      caller (e.g. ownership was archived). Defensive check that
      //      handles edge cases where is_active wasn't flipped.
      let stillOwnedByUser = true
      if (profileId) {
        const { data: currentOwnership } = await supabase
          .from('vehicle_ownership')
          .select('vehicle_id')
          .eq('vehicle_id', vehicleId)
          .eq('owner_user_id', profileId)
          .maybeSingle()
        stillOwnedByUser = !!currentOwnership
      }
      const isInactive = (v.is_active === false) || !stillOwnedByUser
      setInactiveForUser(isInactive)
      setDeactivatedAt(v.deactivated_at || null)

      // Load enriched service history timeline
      const { data: timelineResult } = await supabase.rpc('get_vehicle_history_timeline', {
        p_vehicle_id:      vehicleId,
        p_requesting_user: user.id,
        p_limit:           30,
      })
      if (timelineResult?.success && timelineResult.timeline) {
        setHistory(timelineResult.timeline)
      } else {
        // Fallback to direct query if RPC not yet deployed
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
          .limit(30)
        setHistory(h ?? [])
      }

      // Spend summary — non-fatal if it fails. Used by both the
      // on-page widget (which fetches its own copy) and the PDF report.
      const { data: spendResult } = await supabase.rpc('get_vehicle_spend_summary', {
        p_vehicle_id:      vehicleId,
        p_requesting_user: user.id,
      })
      if (spendResult?.success) setSpend(spendResult)
    } catch (err) {
      console.error(err)
      setError('Failed to load vehicle details.')
    } finally {
      setLoading(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  // Only color is mutable post-creation. plate, vin, make, model, and
  // year_of_manufacture are all immutable — they identify the physical
  // vehicle. The RPC enforces the same rule server-side; we still pass
  // the values so the function signature stays satisfied, but only
  // color actually gets written.
  const handleSave = async () => {
    setSaving(true)
    setEditError('')

    try {
      const { error: rpcErr } = await supabase.rpc('update_personal_vehicle', {
        p_vehicle_id:          vehicleId,
        p_plate_number:        editForm.plate_number,
        p_make:                editForm.make,
        p_model:               editForm.model,
        p_year_of_manufacture: editForm.year_of_manufacture ? parseInt(editForm.year_of_manufacture) : null,
        p_color:               editForm.color || null,
        p_vin:                 editForm.vin || null,
      })

      if (rpcErr) throw rpcErr

      // Only color is reflected back into local state. Every other field
      // is preserved from the previous vehicle record since the RPC
      // doesn't (and won't) write them.
      setVehicle(prev => ({
        ...prev,
        color: editForm.color || null,
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

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true)
    try {
      const { error: rpcErr } = await supabase.rpc('delete_personal_vehicle', {
        p_vehicle_id: vehicleId,
      })
      if (rpcErr) throw rpcErr
      router.push('/dashboard')
    } catch (err) {
      setError(err?.message ?? 'Failed to delete vehicle.')
      setConfirming(false)
      setDeleting(false)
    }
  }

  const field = (key, value) => setEditForm(prev => ({ ...prev, [key]: value }))

  // ── Download report ──────────────────────────────────────────────────────
  // Builds a native-text PDF (vector text, selectable, small file) rather
  // than rasterising the page DOM. Three sections:
  //   1. Vehicle identity + status
  //   2. Service spend summary (if available)
  //   3. Service history timeline (paginated)
  // Designed as a shareable owner-facing document — useful for resale,
  // insurance claims, and fleet handovers.
  const handleDownloadReport = async () => {
    setDownloading(true)
    try {
      const { default: jsPDF } = await import('jspdf')

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 14
      const contentW = pageW - margin * 2

      // Layout cursor
      let y = margin

      // ── Helpers ────────────────────────────────────────────────────────
      const ensureSpace = (needed) => {
        if (y + needed > pageH - margin) {
          pdf.addPage()
          y = margin
        }
      }
      const setFont = (size, weight = 'normal') => {
        pdf.setFont('helvetica', weight)
        pdf.setFontSize(size)
      }
      const rgb = (r, g, b) => pdf.setTextColor(r, g, b)
      const grayLine = () => {
        pdf.setDrawColor(220, 220, 220)
        pdf.setLineWidth(0.2)
        pdf.line(margin, y, pageW - margin, y)
      }
      const fmtDate = (d) => d
        ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—'
      const fmtMoney = (n) => 'KES ' + Number(n || 0).toLocaleString()

      // ── Header ─────────────────────────────────────────────────────────
      setFont(20, 'bold'); rgb(20, 20, 20)
      pdf.text('Vehicle Report', margin, y + 6)
      setFont(9, 'normal'); rgb(120, 120, 120)
      pdf.text('Generated ' + fmtDate(new Date()), pageW - margin, y + 6, { align: 'right' })
      y += 12

      setFont(16, 'bold'); rgb(30, 64, 175) // blue-700
      pdf.text(vehicle.plate_number, margin, y)
      const subtitle = [vehicle.year_of_manufacture, vehicle.make, vehicle.model]
        .filter(Boolean).join(' ')
      if (subtitle) {
        setFont(11, 'normal'); rgb(90, 90, 90)
        pdf.text(subtitle, margin, y + 6)
      }
      // Status pill (text-only, no background — keeps things crisp)
      setFont(9, 'bold')
      if (inactiveForUser) { rgb(120, 120, 120); pdf.text('INACTIVE', pageW - margin, y, { align: 'right' }) }
      else                 { rgb(22, 163, 74);   pdf.text('ACTIVE',   pageW - margin, y, { align: 'right' }) }
      y += subtitle ? 12 : 8
      grayLine()
      y += 6

      // ── Section 1: Vehicle details ─────────────────────────────────────
      setFont(11, 'bold'); rgb(40, 40, 40)
      pdf.text('Vehicle Details', margin, y)
      y += 6

      const latestMileageVal = history.find(h => h.mileage)?.mileage
      const details = [
        ['Plate Number',  vehicle.plate_number || '—'],
        ['VIN',           vehicle.vin || '—'],
        ['Make',          vehicle.make || '—'],
        ['Model',         vehicle.model || '—'],
        ['Year',          vehicle.year_of_manufacture ? String(vehicle.year_of_manufacture) : '—'],
        ['Color',         vehicle.color || '—'],
        ['Latest Mileage', latestMileageVal ? latestMileageVal.toLocaleString() + ' km' : '—'],
        ['Added',         fmtDate(vehicle.created_at)],
      ]
      if (inactiveForUser && deactivatedAt) {
        details.push(['Removed', fmtDate(deactivatedAt)])
      }

      // Two-column grid
      const colW = contentW / 2
      details.forEach((row, idx) => {
        const col = idx % 2
        const rowY = y + Math.floor(idx / 2) * 10
        const x = margin + col * colW
        setFont(8, 'normal'); rgb(140, 140, 140)
        pdf.text(row[0].toUpperCase(), x, rowY)
        setFont(10, 'normal'); rgb(30, 30, 30)
        pdf.text(String(row[1]), x, rowY + 4.5)
      })
      y += Math.ceil(details.length / 2) * 10 + 4
      grayLine()
      y += 6

      // ── Section 2: Spend summary ───────────────────────────────────────
      if (spend) {
        ensureSpace(28)
        setFont(11, 'bold'); rgb(40, 40, 40)
        pdf.text('Service Spend', margin, y)
        y += 6

        const stats = [
          ['Total Spent',    fmtMoney(spend.all_time_total)],
          ['Services',       String(spend.service_count || 0)],
          ['Last 12 Months', fmtMoney(spend.last_12_months_total)],
        ]
        const sw = contentW / stats.length
        stats.forEach(([label, value], i) => {
          const x = margin + i * sw
          setFont(8, 'normal'); rgb(140, 140, 140)
          pdf.text(label.toUpperCase(), x, y)
          setFont(13, 'bold'); rgb(22, 101, 52) // green-800
          pdf.text(value, x, y + 6)
        })
        y += 14
        grayLine()
        y += 6
      }

      // ── Section 3: Service history ─────────────────────────────────────
      ensureSpace(14)
      setFont(11, 'bold'); rgb(40, 40, 40)
      pdf.text('Service History', margin, y)
      setFont(9, 'normal'); rgb(140, 140, 140)
      pdf.text(history.length + ' event' + (history.length === 1 ? '' : 's'),
        pageW - margin, y, { align: 'right' })
      y += 6

      if (history.length === 0) {
        setFont(10, 'normal'); rgb(140, 140, 140)
        pdf.text('No service events recorded yet.', margin, y + 4)
        y += 8
      } else {
        const EVENT_LABELS = {
          service_completed:      'Service Completed',
          checkin:                'Vehicle Check-in',
          check_in:               'Check-in',
          checkout:               'Vehicle Check-out',
          service_started:        'Service Started',
          quality_check:          'Quality Check',
          rework:                 'Rework',
          diagnosis:              'Diagnosis',
          invoice_generated:      'Invoice Generated',
          issue_found:            'Issue Found',
          recommendation_created: 'Recommendation',
          mileage_recorded:       'Mileage Recorded',
        }

        history.forEach((h) => {
          const eventType = h.event_type || 'service_completed'
          const label     = EVENT_LABELS[eventType] || 'Service Event'
          const provider  = (h.provider || h.service_provider)?.name
          const services  = h.services || []
          const totalAmt  = h.total_amount || h.work_order?.total_amount
          const desc      = h.description || h.work_order?.problem_description || ''
          const wo        = h.work_order

          // Estimate height for this entry: header + lines of wrapped
          // description + tags + footer. We measure after wrapping below,
          // so this is a conservative pre-check to avoid mid-entry splits.
          ensureSpace(20 + (desc ? 8 : 0) + (services.length ? 6 : 0))

          // Date column (left)
          setFont(9, 'bold'); rgb(60, 60, 60)
          pdf.text(fmtDate(h.recorded_at), margin, y)
          setFont(8, 'normal'); rgb(140, 140, 140)
          if (h.mileage) pdf.text(h.mileage.toLocaleString() + ' km', margin, y + 4)

          // Event content (indented)
          const xContent = margin + 32
          const wContent = contentW - 32

          setFont(10, 'bold'); rgb(20, 20, 20)
          pdf.text(label, xContent, y)
          if (provider) {
            setFont(9, 'normal'); rgb(110, 110, 110)
            pdf.text(provider, xContent, y + 4.5)
            y += 9
          } else {
            y += 5
          }

          if (services.length > 0) {
            setFont(8, 'normal'); rgb(22, 101, 52)
            const svcLine = services.join('  •  ')
            const svcLines = pdf.splitTextToSize(svcLine, wContent)
            ensureSpace(svcLines.length * 3.5 + 2)
            pdf.text(svcLines, xContent, y)
            y += svcLines.length * 3.5 + 1
          }

          if (desc) {
            setFont(9, 'normal'); rgb(80, 80, 80)
            const descLines = pdf.splitTextToSize(desc, wContent)
            ensureSpace(descLines.length * 4 + 2)
            pdf.text(descLines, xContent, y)
            y += descLines.length * 4 + 1
          }

          if (wo?.id || totalAmt) {
            setFont(8, 'normal')
            if (wo?.number || wo?.work_order_number) {
              rgb(30, 64, 175)
              pdf.text('WO ' + (wo.number || wo.work_order_number), xContent, y + 3)
            }
            if (totalAmt) {
              rgb(40, 40, 40); setFont(9, 'bold')
              pdf.text(fmtMoney(totalAmt), pageW - margin, y + 3, { align: 'right' })
            }
            y += 5
          }

          y += 3
          pdf.setDrawColor(240, 240, 240)
          pdf.setLineWidth(0.15)
          pdf.line(margin, y, pageW - margin, y)
          y += 4
        })
      }

      // ── Page numbers ───────────────────────────────────────────────────
      const totalPages = pdf.internal.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p)
        setFont(8, 'normal'); rgb(160, 160, 160)
        pdf.text(
          'Page ' + p + ' of ' + totalPages,
          pageW - margin,
          pageH - 6,
          { align: 'right' }
        )
        pdf.text(
          vehicle.plate_number + ' · GariCare Vehicle Report',
          margin,
          pageH - 6
        )
      }

      const fileDate = new Date().toISOString().slice(0, 10)
      pdf.save('Vehicle-Report-' + vehicle.plate_number + '-' + fileDate + '.pdf')
    } catch (err) {
      console.error('PDF error:', err)
      setError('Failed to generate report. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

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
        Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-blue-100 rounded-xl">
          <Car className="w-7 h-7 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{vehicle.plate_number}</h1>
          <p className="text-gray-500">
            {[vehicle.year_of_manufacture, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleDownloadReport}
            disabled={downloading}
            title="Download a full PDF report for this vehicle"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {downloading
              ? <Loader2 size={14} className="animate-spin" />
              : <Download size={14} />}
            <span className="hidden sm:inline">
              {downloading ? 'Generating…' : 'Download Report'}
            </span>
          </button>
          {inactiveForUser ? (
            <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm font-medium rounded-full">
              Inactive
            </span>
          ) : (
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              Active
            </span>
          )}
        </div>
      </div>

      {/* Vehicle inactive notice.
          Surfaced when the vehicle has been deactivated (soft-deleted by
          the owner) or when its ownership row no longer ties it to this
          user. The page becomes read-only: the editable detail card
          shows but its Edit / Delete buttons are hidden, and Book
          Service is suppressed below. Service history stays visible. */}
      {inactiveForUser && (
        <div className="mb-6 rounded-xl border border-gray-300 bg-gray-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="text-gray-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">
                This vehicle is no longer active in your garage
              </p>
              <p className="text-gray-700 text-xs mt-1">
                It was removed
                {deactivatedAt && (
                  <> on {new Date(deactivatedAt).toLocaleDateString('en-KE',
                    { day: 'numeric', month: 'short', year: 'numeric' })}</>
                )}
                . Service history is preserved below for reference.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Details card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Vehicle Details</h2>

          {!editing && !inactiveForUser && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
              >
                <Trash2 size={14} />
                Delete
              </button>
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
            <DetailRow icon={<Hash size={14} />}     label="Plate Number"          value={<span className="font-mono">{vehicle.plate_number}</span>} />
            <DetailRow icon={<Car size={14} />}      label="Make & Model"          value={`${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() || '—'} />
            <DetailRow icon={<Calendar size={14} />} label="Year"                  value={vehicle.year_of_manufacture ?? '—'} />
            <DetailRow icon={<Palette size={14} />}  label="Color"                 value={<span className="capitalize">{vehicle.color ?? '—'}</span>} />
            {vehicle.vin && (
              <DetailRow icon={<Hash size={14} />}   label="VIN"                   value={<span className="font-mono">{vehicle.vin}</span>} span />
            )}
            {latestMileage && (
              <DetailRow icon={<Gauge size={14} />}  label="Last Recorded Mileage" value={`${latestMileage.toLocaleString()} km`} />
            )}
            <DetailRow icon={<Clock size={14} />}    label="Added"                 value={new Date(vehicle.created_at).toLocaleDateString()} />
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
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Make
                  <span className="ml-2 text-gray-400 font-normal">(cannot be changed)</span>
                </label>
                <input
                  type="text"
                  value={editForm.make}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Model
                  <span className="ml-2 text-gray-400 font-normal">(cannot be changed)</span>
                </label>
                <input
                  type="text"
                  value={editForm.model}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Year
                  <span className="ml-2 text-gray-400 font-normal">(cannot be changed)</span>
                </label>
                <input
                  type="number"
                  value={editForm.year_of_manufacture}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg cursor-not-allowed"
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

      {/* Delete confirmation modal */}
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
              Remove <span className="font-semibold">{vehicle.plate_number}</span> from your garage?
            </p>
            <p className="text-gray-500 text-xs mb-5">
              The vehicle will be deactivated (not erased) and its service history is preserved. You can restore it later unless someone else registers it in the meantime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
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

      {/* Per-vehicle spend summary */}
      <VehicleSpendWidget vehicleId={vehicleId} />

      {/* Service history */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Service History</h2>
          {!inactiveForUser && (
            <Link
              href={`/dashboard/bookings/book?vehicle=${vehicleId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Wrench className="w-3.5 h-3.5" />
              Book Service
            </Link>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-10">
            <Wrench className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No service history yet</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-5 top-4 bottom-4 w-px bg-gray-200" />
            <div className="space-y-4">
              {history.map((h, idx) => {
                // Normalise: handle both RPC response and direct query shapes
                const eventType  = h.event_type || 'service_completed'
                const timestamp  = h.recorded_at
                const mileage    = h.mileage
                const provider   = h.provider || h.service_provider
                const wo         = h.work_order
                const services   = h.services || []
                const totalAmt   = h.total_amount || wo?.total_amount
                const desc       = h.description || wo?.problem_description || ''

                const eventConfig = {
                  service_completed:       { dot: 'bg-green-500',  label: 'Service Completed' },
                  checkin:                 { dot: 'bg-blue-500',   label: 'Vehicle Check-in'  },
                  checkout:                { dot: 'bg-blue-400',   label: 'Vehicle Check-out' },
                  issue_found:             { dot: 'bg-orange-500', label: 'Issue Found'       },
                  recommendation_created:  { dot: 'bg-purple-500', label: 'Recommendation'    },
                  mileage_recorded:        { dot: 'bg-gray-400',   label: 'Mileage Recorded'  },
                }[eventType] || { dot: 'bg-gray-300', label: 'Service Event' }

                return (
                  <div key={h.id || idx} className="flex items-start gap-4 pl-10 relative">
                    {/* Timeline dot */}
                    <div className={`absolute left-4 top-4 w-3 h-3 rounded-full border-2 border-white ${eventConfig.dot}`} />

                    <div className="flex-1 bg-gray-50 rounded-lg p-4 border border-gray-100">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{eventConfig.label}</p>
                          {provider?.name && (
                            <p className="text-xs text-gray-500 mt-0.5">{provider.name}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-400">
                            {new Date(timestamp).toLocaleDateString('en-KE', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </p>
                          {mileage && (
                            <p className="text-xs text-gray-500 mt-0.5">{mileage.toLocaleString()} km</p>
                          )}
                        </div>
                      </div>

                      {/* Services list (from service_record) */}
                      {services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {services.map((svc, si) => (
                            <span key={si} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              {svc}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Description */}
                      {desc && (
                        <p className="text-xs text-gray-600 mt-2 leading-relaxed">{desc}</p>
                      )}

                      {/* Footer: WO link + amount */}
                      {(wo?.id || totalAmt) && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                          {wo?.id && (
                            <button
                              onClick={() => router.push('/dashboard/work-orders/' + wo.id)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {wo.number || wo.work_order_number ? 'WO ' + (wo.number || wo.work_order_number) : 'View Work Order'} →
                            </button>
                          )}
                          {totalAmt && (
                            <span className="text-xs font-semibold text-gray-700 ml-auto">
                              KES {Number(totalAmt).toLocaleString()}
                            </span>
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