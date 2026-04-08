// src/app/dashboard/vehicles/[vehicleId]/page.js
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  ArrowLeft, Car, Calendar, Gauge, Hash, Palette,
  AlertCircle, Clock, Wrench, Pencil, Trash2, X, Check
} from 'lucide-react'

const supabase = createClient()

export default function VehicleDetailPage() {
  const { vehicleId } = useParams()
  const router = useRouter()

  const [vehicle, setVehicle]   = useState(null)
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Edit state
  const [editing, setEditing]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')

  // Delete state
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  useEffect(() => {
    if (vehicleId) loadData()
  }, [vehicleId])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Load vehicle — RLS vehicles_select_personal allows this
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

      // Load service history
      const { data: h } = await supabase
        .from('vehicle_history')
        .select(`
          id, mileage, recorded_at,
          work_order:work_orders(id, problem_description,
            status:work_order_statuses(display_name)
          ),
          service_provider:service_providers(name)
        `)
        .eq('vehicle_id', vehicleId)
        .order('recorded_at', { ascending: false })
        .limit(20)

      setHistory(h ?? [])
    } catch (err) {
      console.error(err)
      setError('Failed to load vehicle details.')
    } finally {
      setLoading(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setEditError('')

    const kenyaPlate = /^[A-Z]{3}\s?\d{3}[A-Z]?$/i
    if (!kenyaPlate.test(editForm.plate_number.trim())) {
      setEditError('Invalid plate number format. Expected e.g. KAA 123A')
      setSaving(false)
      return
    }

    try {
      const { error: rpcErr } = await supabase.rpc('update_personal_vehicle', {
        p_vehicle_id:          vehicleId,
        p_plate_number:        editForm.plate_number.trim().toUpperCase(),
        p_make:                editForm.make,
        p_model:               editForm.model,
        p_year_of_manufacture: editForm.year_of_manufacture ? parseInt(editForm.year_of_manufacture) : null,
        p_color:               editForm.color || null,
        p_vin:                 editForm.vin.trim() || null,
      })

      if (rpcErr) throw rpcErr

      setVehicle(prev => ({
        ...prev,
        ...editForm,
        plate_number:        editForm.plate_number.toUpperCase(),
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
        <span className="ml-auto px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
          Active
        </span>
      </div>

      {/* Details card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Vehicle Details</h2>

          {!editing && (
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Plate Number *</label>
              <input
                type="text"
                value={editForm.plate_number}
                onChange={e => field('plate_number', e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono uppercase tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <label className="block text-xs font-medium text-gray-500 mb-1">VIN <span className="font-normal">(optional)</span></label>
              <input
                type="text"
                value={editForm.vin}
                onChange={e => field('vin', e.target.value.toUpperCase())}
                maxLength={17}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono uppercase text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <p className="text-gray-600 text-sm mb-5">
              Are you sure you want to remove <span className="font-semibold">{vehicle.plate_number}</span>? This cannot be undone.
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

      {/* Service history */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Service History</h2>
          <Link
            href={`/dashboard/bookings/book?vehicle=${vehicleId}`}
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
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.id} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="p-2 bg-white border border-gray-200 rounded-lg">
                  <Wrench className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {h.work_order?.problem_description ?? h.service_provider?.name ?? 'Service record'}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {h.mileage && <span className="text-xs text-gray-400">{h.mileage.toLocaleString()} km</span>}
                    {h.service_provider?.name && <span className="text-xs text-gray-400">{h.service_provider.name}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {h.work_order?.status && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                      {h.work_order.status.display_name}
                    </span>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(h.recorded_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
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