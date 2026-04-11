'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  History, Car, Wrench, ChevronRight, Loader2,
  AlertCircle, Calendar, Gauge, FileText,
  CheckCircle, Clock, MapPin
} from 'lucide-react'

// Colour + label per event_type
const EVENT_CONFIG = {
  check_in:           { dot: 'bg-blue-500',   label: 'Check-in',          icon: MapPin      },
  service_started:    { dot: 'bg-yellow-500', label: 'Service Started',   icon: Wrench      },
  service_completed:  { dot: 'bg-green-500',  label: 'Service Completed', icon: CheckCircle },
  quality_check:      { dot: 'bg-purple-500', label: 'Quality Check',     icon: CheckCircle },
  rework:             { dot: 'bg-orange-500', label: 'Rework',            icon: Wrench      },
  diagnosis:          { dot: 'bg-cyan-500',   label: 'Diagnosis',         icon: FileText    },
  invoice_generated:  { dot: 'bg-indigo-500', label: 'Invoice',           icon: FileText    },
  default:            { dot: 'bg-gray-400',   label: 'Event',             icon: Clock       },
}

const eventCfg = (type) => EVENT_CONFIG[type] || EVENT_CONFIG.default

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'

const relativeTime = (d) => {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 30)  return `${diff} days ago`
  if (diff < 365) return `${Math.floor(diff / 30)} months ago`
  return `${Math.floor(diff / 365)} yr${Math.floor(diff / 365) > 1 ? 's' : ''} ago`
}

export default function HistoryPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [vehicles,        setVehicles]        = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [timeline,        setTimeline]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [historyLoading,  setHistoryLoading]  = useState(false)
  const [error,           setError]           = useState('')

  useEffect(() => { loadVehicles() }, [])

  useEffect(() => {
    if (selectedVehicle) loadHistory(selectedVehicle.id)
  }, [selectedVehicle])

  const loadVehicles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile  } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      const { data, error: err } = await supabase
        .from('vehicle_ownership')
        .select(`
          vehicle_id,
          vehicle:vehicles(id, plate_number, make, model, year, color)
        `)
        .eq('owner_user_id', profile.id)

      if (err) throw err
      const list = (data || []).map(v => v.vehicle).filter(Boolean)
      setVehicles(list)
      if (list.length > 0) setSelectedVehicle(list[0])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async (vehicleId) => {
    setHistoryLoading(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: err } = await supabase.rpc(
        'get_vehicle_history_timeline',
        { p_vehicle_id: vehicleId, p_requesting_user: user.id, p_limit: 100 }
      )
      if (err) throw err
      if (!result?.success) throw new Error(result?.error || 'Failed to load history')
      setTimeline(result.timeline || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <History size={24} className="text-blue-600" /> Service History
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Full service timeline across all your vehicles
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {vehicles.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Car className="mx-auto text-gray-300 mb-4" size={44} />
          <h3 className="text-base font-medium text-gray-900 mb-2">No vehicles yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            Add a vehicle to start tracking its service history.
          </p>
          <button
            onClick={() => router.push('/dashboard/vehicles/add')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Add Vehicle
          </button>
        </div>
      ) : (
        <>
          {/* Vehicle selector */}
          {vehicles.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {vehicles.map(v => {
                const active = selectedVehicle?.id === v.id
                return (
                  <button key={v.id}
                    onClick={() => setSelectedVehicle(v)}
                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}>
                    <Car size={14} />
                    {v.plate_number}
                    {v.make && <span className={active ? 'opacity-80' : 'text-gray-400'}>
                      · {v.make} {v.model}
                    </span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Selected vehicle card */}
          {selectedVehicle && (
            <div className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Car size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {selectedVehicle.plate_number}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model, selectedVehicle.color]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push(`/dashboard/vehicles/${selectedVehicle.id}`)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0"
              >
                View details <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Timeline */}
          {historyLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : timeline.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <Wrench className="mx-auto text-gray-300 mb-4" size={36} />
              <p className="text-base font-medium text-gray-900 mb-1">No history yet</p>
              <p className="text-gray-500 text-sm">
                Service events will appear here once this vehicle has been serviced.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-xs text-gray-500 mb-4">
                {timeline.length} event{timeline.length !== 1 ? 's' : ''} recorded
              </p>

              {/* Vertical timeline */}
              <div className="relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />

                <div className="space-y-5 pl-7">
                  {timeline.map((entry, i) => {
                    const cfg      = eventCfg(entry.event_type)
                    const Icon     = cfg.icon
                    const hasWO    = !!entry.work_order?.id
                    const services = entry.services || []

                    return (
                      <div key={i} className="relative">
                        {/* Timeline dot */}
                        <div className={`absolute -left-7 top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${cfg.dot}`} />

                        <div className="group">
                          {/* Row header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900">
                                {cfg.label}
                              </span>
                              {entry.provider?.name && (
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  <MapPin size={10} /> {entry.provider.name}
                                </span>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="text-xs text-gray-400">
                                {relativeTime(entry.recorded_at)}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {fmt(entry.recorded_at)}
                              </p>
                            </div>
                          </div>

                          {/* Description */}
                          {entry.description && (
                            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                              {entry.description}
                            </p>
                          )}

                          {/* Services list */}
                          {services.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {services.map((svc, j) => (
                                <span key={j}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 text-xs rounded-full">
                                  <Wrench size={9} /> {svc.name}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            {entry.mileage && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Gauge size={11} /> {entry.mileage.toLocaleString()} km
                              </span>
                            )}
                            {entry.work_order?.total_amount > 0 && (
                              <span className="text-xs text-gray-500">
                                KES {Number(entry.work_order.total_amount).toLocaleString()}
                              </span>
                            )}
                            {hasWO && (
                              <button
                                onClick={() => router.push(`/dashboard/work-orders/${entry.work_order.id}`)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                              >
                                <FileText size={11} />
                                WO {entry.work_order.number}
                                <ChevronRight size={10} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}