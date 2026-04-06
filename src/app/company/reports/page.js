'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, Truck, Users, TrendingUp, AlertCircle } from 'lucide-react'

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bookingStats, setBookingStats] = useState([])
  const [vehicleStats, setVehicleStats] = useState([])
  const [teamStats, setTeamStats] = useState([])
  const [totalSpend, setTotalSpend] = useState(0)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    const supabase = createClient()
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // Resolve company
      let cId = null
      const { data: owned } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('owner_user_id', profile.id)
        .maybeSingle()

      if (owned) {
        cId = owned.id
      } else {
        const { data: member } = await supabase
          .from('company_users')
          .select('company_id')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle()
        if (member) cId = member.company_id
      }

      if (!cId) { setError('No company found'); setLoading(false); return }

      // Get fleet vehicle IDs
      const { data: fleetRows } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id, vehicle:vehicles(id, plate_number, make, model)')
        .eq('owner_company_id', cId)

      const vehicleIds = (fleetRows || []).map(r => r.vehicle_id)

      // Get team members
      const { data: members } = await supabase
        .from('company_users')
        .select(`
          id, staff_role, is_admin,
          user:user_profiles!company_users_user_id_fkey(first_name, last_name)
        `)
        .eq('company_id', cId)
        .eq('is_active', true)

      setTeamStats(members || [])

      if (vehicleIds.length === 0) {
        setLoading(false)
        return
      }

      // Get all bookings for fleet
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id, vehicle_id, final_cost, estimated_cost,
          status:booking_statuses(code, display_name)
        `)
        .in('vehicle_id', vehicleIds)

      if (!bookings || bookings.length === 0) {
        setLoading(false)
        return
      }

      // ── Bookings by status ──
      const statusMap = {}
      bookings.forEach(b => {
        const code = b.status?.code || 'unknown'
        const label = b.status?.display_name || code
        if (!statusMap[code]) statusMap[code] = { code, label, count: 0 }
        statusMap[code].count++
      })
      setBookingStats(Object.values(statusMap).sort((a, b) => b.count - a.count))

      // ── Spend by vehicle ──
      const vehicleMap = {}
      bookings.forEach(b => {
        const cost = parseFloat(b.final_cost || b.estimated_cost || 0)
        if (!vehicleMap[b.vehicle_id]) vehicleMap[b.vehicle_id] = { vehicleId: b.vehicle_id, spend: 0, bookings: 0 }
        vehicleMap[b.vehicle_id].spend += cost
        vehicleMap[b.vehicle_id].bookings++
      })

      // Attach vehicle info
      const vehicleStatsList = Object.values(vehicleMap).map(vs => {
        const fleetRow = (fleetRows || []).find(r => r.vehicle_id === vs.vehicleId)
        return {
          ...vs,
          plate: fleetRow?.vehicle?.plate_number || '—',
          label: fleetRow?.vehicle ? `${fleetRow.vehicle.make} ${fleetRow.vehicle.model}` : '—',
        }
      }).sort((a, b) => b.spend - a.spend).slice(0, 8)

      setVehicleStats(vehicleStatsList)
      setTotalSpend(vehicleStatsList.reduce((sum, v) => sum + v.spend, 0))

    } catch (err) {
      console.error('Reports error:', err)
      setError('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  const statusColors = {
    completed:   'bg-green-500',
    confirmed:   'bg-blue-500',
    in_progress: 'bg-purple-500',
    pending:     'bg-yellow-500',
    cancelled:   'bg-red-400',
  }

  const maxVehicleSpend = vehicleStats.length > 0 ? vehicleStats[0].spend : 1

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of fleet activity, spend and team</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Bookings', value: bookingStats.reduce((s, b) => s + b.count, 0), icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Fleet Spend', value: `KES ${totalSpend.toLocaleString()}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Active Team Members', value: teamStats.length, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bookings by status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Bookings by Status</h2>
          {bookingStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No booking data yet</p>
          ) : (
            <div className="space-y-3">
              {bookingStats.map(({ code, label, count }) => {
                const total = bookingStats.reduce((s, b) => s + b.count, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={code}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 capitalize">{label}</span>
                      <span className="font-medium text-gray-900">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${statusColors[code] || 'bg-gray-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Spend by vehicle */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Spend by Vehicle</h2>
          {vehicleStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No spend data yet</p>
          ) : (
            <div className="space-y-3">
              {vehicleStats.map((v) => {
                const pct = maxVehicleSpend > 0 ? Math.round((v.spend / maxVehicleSpend) * 100) : 0
                return (
                  <div key={v.vehicleId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">{v.plate}</span>
                      <span className="text-gray-500">
                        KES {v.spend.toLocaleString()} · {v.bookings} booking{v.bookings !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{v.label}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Team roster */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Team Members</h2>
          {teamStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No team members yet</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {teamStats.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-blue-700">
                      {m.user?.first_name?.[0]}{m.user?.last_name?.[0]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.user?.first_name} {m.user?.last_name}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {m.staff_role}{m.is_admin ? ' · Admin' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}