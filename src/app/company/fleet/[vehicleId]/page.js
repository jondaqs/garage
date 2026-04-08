// src/app/company/fleet/[vehicleId]/page.js
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  ArrowLeft, Truck, Calendar, Gauge, Hash,
  Palette, AlertCircle, Clock, Wrench
} from 'lucide-react'

// Client outside component — preserves session
const supabase = createClient()

export default function FleetVehicleDetailPage() {
  const { vehicleId } = useParams()
  const router = useRouter()

  const [vehicle, setVehicle]   = useState(null)
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (vehicleId) loadVehicle()
  }, [vehicleId])

  const loadVehicle = async () => {
    try {
      // Load vehicle details
      const { data: v, error: vErr } = await supabase
        .from('vehicles')
        .select('id, plate_number, make, model, year_of_manufacture, color, vin, created_at, updated_at')
        .eq('id', vehicleId)
        .single()

      if (vErr) throw vErr
      setVehicle(v)

      // Load service history
      const { data: h } = await supabase
        .from('vehicle_history')
        .select(`
          id, mileage, recorded_at,
          work_order:work_orders(id, problem_description, opened_at, closed_at,
            status:work_order_statuses(display_name, code)
          ),
          service_provider:service_providers(id, name)
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
        <span className="ml-auto px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
          Active
        </span>
      </div>

      {/* Details card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Vehicle Details</h2>
        <div className="grid grid-cols-2 gap-4">

          <div className="flex items-start gap-3">
            <Hash className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Plate Number</p>
              <p className="text-sm font-medium text-gray-900 font-mono">{vehicle.plate_number}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Truck className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Make & Model</p>
              <p className="text-sm font-medium text-gray-900">{vehicle.make} {vehicle.model}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Year</p>
              <p className="text-sm font-medium text-gray-900">{vehicle.year_of_manufacture ?? '—'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Palette className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Color</p>
              <p className="text-sm font-medium text-gray-900 capitalize">{vehicle.color ?? '—'}</p>
            </div>
          </div>

          {vehicle.vin && (
            <div className="flex items-start gap-3 col-span-2">
              <Hash className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">VIN</p>
                <p className="text-sm font-medium text-gray-900 font-mono">{vehicle.vin}</p>
              </div>
            </div>
          )}

          {latestMileage && (
            <div className="flex items-start gap-3">
              <Gauge className="w-4 h-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Last Recorded Mileage</p>
                <p className="text-sm font-medium text-gray-900">{latestMileage.toLocaleString()} km</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Added</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(vehicle.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Service history */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Service History</h2>
          <Link
            href={`/company/bookings/new?vehicleId=${vehicleId}`}
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
                    {h.mileage && (
                      <span className="text-xs text-gray-400">{h.mileage.toLocaleString()} km</span>
                    )}
                    {h.service_provider?.name && (
                      <span className="text-xs text-gray-400">{h.service_provider.name}</span>
                    )}
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