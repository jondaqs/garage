'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
  CalendarDays as CalendarIcon, Filter, Download, Plus,
  Car, Loader2, Building2
} from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = momentLocalizer(moment)

const STATUS_COLORS = {
  pending:             { bg: '#f59e0b', border: '#d97706' },
  confirmed:           { bg: '#3b82f6', border: '#2563eb' },
  in_progress:         { bg: '#8b5cf6', border: '#7c3aed' },
  completed:           { bg: '#10b981', border: '#059669' },
  cancelled:           { bg: '#ef4444', border: '#dc2626' },
  diagnosing:          { bg: '#06b6d4', border: '#0891b2' },
  awaiting_approval:   { bg: '#f97316', border: '#ea580c' },
  approved:            { bg: '#0ea5e9', border: '#0284c7' },
  quality_check:       { bg: '#a855f7', border: '#9333ea' },
  rework:              { bg: '#f43f5e', border: '#e11d48' },
}
const statusColor = (code) => STATUS_COLORS[code] || { bg: '#6b7280', border: '#4b5563' }

export default function MemberCompanyCalendarPage() {
  const router    = useRouter()
  const { companyId } = useParams()
  const supabase  = createClient()

  const [bookings,     setBookings]     = useState([])
  const [workOrders,   setWorkOrders]   = useState([])
  const [vehicles,     setVehicles]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('month')
  const [date,         setDate]         = useState(new Date())
  const [statusFilter, setStatusFilter] = useState('all')
  const [vehicleFilter,setVehicleFilter]= useState('all')
  const [showWOs,      setShowWOs]      = useState(true)
  const [pastDateMsg,  setPastDateMsg]  = useState(false)
  const [canBook,      setCanBook]      = useState(false)
  const [companyName,  setCompanyName]  = useState('')

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

      // Verify membership
      const { data: mem } = await supabase
        .from('company_users')
        .select('id, is_admin, can_manage_fleet')
        .eq('user_id', profile.id).eq('company_id', companyId).eq('is_active', true)
        .maybeSingle()
      if (!mem) { setLoading(false); return }
      setCanBook(!!(mem.can_manage_fleet || mem.is_admin))

      // Company name
      const { data: co } = await supabase
        .from('company_profiles_secure').select('name').eq('id', companyId).maybeSingle()
      setCompanyName(co?.name || '')

      // Fleet vehicles
      const { data: fleet } = await supabase
        .from('vehicle_ownership').select('vehicle_id').eq('owner_company_id', companyId)
      const vehicleIds = fleet?.map(f => f.vehicle_id) || []
      if (vehicleIds.length === 0) { setLoading(false); return }

      // Vehicle details for filter
      const { data: vData } = await supabase
        .from('vehicles_secure').select('id, plate_number, make, model')
        .in('id', vehicleIds).order('plate_number')
      setVehicles(vData || [])

      // Bookings
      const { data: bData } = await supabase
        .from('bookings_secure')
        .select(`
          id, booking_date, booking_time_start, booking_time_end,
          problem_description,
          vehicle:vehicles_secure(id, plate_number, make, model),
          provider:service_providers_secure(id, name),
          shop:shops_secure(name, town),
          status:booking_statuses(code, display_name, color_code)
        `)
        .in('vehicle_id', vehicleIds)
        .order('booking_date', { ascending: true })
      setBookings(bData || [])

      // Work orders — fetch all, filter terminal client-side to avoid 400
      const { data: woData } = await supabase
        .from('work_orders_secure')
        .select(`
          id, work_order_number, opened_at, updated_at,
          vehicle:vehicles_secure(id, plate_number, make, model),
          provider:service_providers_secure(name),
          status:work_order_statuses(code, display_name)
        `)
        .in('vehicle_id', vehicleIds)
        .order('opened_at', { ascending: false })

      // Filter out terminal statuses client-side (avoids 400 from empty ID array)
      const terminal = ['completed', 'cancelled', 'closed']
      setWorkOrders((woData || []).filter(wo => !terminal.includes(wo.status?.code)))

    } catch (err) {
      console.error('Member calendar error:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  // ── Events ────────────────────────────────────────────────────────────────
  const events = useMemo(() => {
    const bookingEvents = bookings
      .filter(b => {
        if (statusFilter !== 'all' && b.status?.code !== statusFilter) return false
        if (vehicleFilter !== 'all' && b.vehicle?.id !== vehicleFilter) return false
        return true
      })
      .map(b => {
        const [sh, sm] = (b.booking_time_start || '08:00').split(':')
        const [eh, em] = (b.booking_time_end   || '09:00').split(':')
        const start = new Date(b.booking_date); start.setHours(+sh, +sm, 0)
        const end   = new Date(b.booking_date); end.setHours(+eh, +em, 0)
        return {
          id: b.id, title: `${b.vehicle?.plate_number || '—'} · ${b.provider?.name || '—'}`,
          start, end, resource: b, kind: 'booking', status: b.status?.code,
        }
      })

    const woEvents = showWOs
      ? workOrders
          .filter(wo => vehicleFilter === 'all' || wo.vehicle?.id === vehicleFilter)
          .map(wo => {
            const d     = new Date(wo.opened_at || wo.updated_at)
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
            const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
            return {
              id: wo.id, title: `🔧 ${wo.vehicle?.plate_number || '—'} · ${wo.status?.display_name}`,
              start, end, allDay: true, resource: wo, kind: 'work_order', status: wo.status?.code,
            }
          })
      : []

    return [...bookingEvents, ...woEvents]
  }, [bookings, workOrders, statusFilter, vehicleFilter, showWOs])

  const slotPropGetter = (slotDate) => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    if (slotDate < t) return { style: { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } }
    return {}
  }

  const eventStyleGetter = (event) => {
    const c = statusColor(event.status)
    return { style: {
      backgroundColor: c.bg, borderColor: c.border, borderRadius: '4px',
      opacity: 0.9, color: 'white', border: `2px solid ${c.border}`,
      fontSize: '12px', padding: '2px 5px',
    }}
  }

  const handleSelectEvent = (event) => {
    if (event.kind === 'work_order') {
      router.push(`/dashboard/company/${companyId}/work-orders/${event.id}`)
    } else {
      router.push(`/dashboard/company/${companyId}/bookings/${event.id}`)
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const handleSelectSlot = ({ start }) => {
    if (!canBook) return
    if (start < today) {
      setPastDateMsg(true)
      setTimeout(() => setPastDateMsg(false), 3000)
      return
    }
    sessionStorage.setItem('selectedBookingDate', moment(start).format('YYYY-MM-DD'))
    router.push(`/dashboard/company/${companyId}/bookings/book`)
  }

  const exportCalendar = () => {
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//GariCare//Company Fleet//EN\n'
    events.forEach(ev => {
      const b = ev.resource
      ics += 'BEGIN:VEVENT\n'
      ics += `UID:${ev.id}\n`
      ics += `DTSTAMP:${moment().format('YYYYMMDDTHHmmss')}Z\n`
      if (ev.allDay) {
        ics += `DTSTART;VALUE=DATE:${moment(ev.start).format('YYYYMMDD')}\n`
        ics += `DTEND;VALUE=DATE:${moment(ev.end).format('YYYYMMDD')}\n`
      } else {
        ics += `DTSTART:${moment(ev.start).format('YYYYMMDDTHHmmss')}\n`
        ics += `DTEND:${moment(ev.end).format('YYYYMMDDTHHmmss')}\n`
      }
      ics += `SUMMARY:${ev.title}\n`
      if (ev.kind === 'booking') {
        ics += `DESCRIPTION:Booking at ${b.shop?.name || b.provider?.name}, ${b.shop?.town || ''}\n`
        ics += `LOCATION:${b.shop?.name || ''}, ${b.shop?.town || ''}\n`
      } else {
        ics += `DESCRIPTION:Work Order ${b.work_order_number} - ${b.status?.display_name}\n`
      }
      ics += 'END:VEVENT\n'
    })
    ics += 'END:VCALENDAR'
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = 'fleet-calendar.ics'; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin h-10 w-10 text-blue-600" />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon size={24} className="text-blue-600" /> Fleet Calendar
          </h1>
          {companyName && (
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
              <Building2 size={13} className="text-gray-400" />
              {companyName} · {bookings.length} booking{bookings.length !== 1 ? 's' : ''} · {workOrders.length} active WO{workOrders.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCalendar}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            <Download size={16} /> Export
          </button>
          {canBook && (
            <button onClick={() => router.push(`/dashboard/company/${companyId}/bookings/book`)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus size={16} /> New Booking
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400 flex-shrink-0" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        {vehicles.length > 1 && (
          <div className="flex items-center gap-2">
            <Car size={16} className="text-gray-400 flex-shrink-0" />
            <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 max-w-[180px]">
              <option value="all">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}{v.make ? ` · ${v.make}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={showWOs}
            onChange={e => setShowWOs(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm text-gray-600">Show active work orders</span>
        </label>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Pending',     color: 'bg-amber-500'  },
          { label: 'Confirmed',   color: 'bg-blue-500'   },
          { label: 'In Progress', color: 'bg-purple-500' },
          { label: 'Completed',   color: 'bg-green-500'  },
          { label: 'Cancelled',   color: 'bg-red-500'    },
          { label: 'WO Active',   color: 'bg-cyan-500'   },
          { label: 'WO Awaiting', color: 'bg-orange-500' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
            <span className="text-xs text-gray-600">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6" style={{ height: '700px' }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable={canBook}
          eventPropGetter={eventStyleGetter}
          slotPropGetter={slotPropGetter}
          views={['month', 'week', 'day', 'agenda']}
          popup
          tooltipAccessor={ev =>
            ev.kind === 'work_order'
              ? `WO: ${ev.resource.work_order_number}\n${ev.resource.status?.display_name}`
              : `${ev.title}\n${ev.resource.status?.display_name}`
          }
          messages={{
            next: 'Next', previous: 'Prev', today: 'Today',
            month: 'Month', week: 'Week', day: 'Day', agenda: 'Agenda',
            noEventsInRange: 'No fleet events in this range',
          }}
          style={{ height: '100%' }}
        />
      </div>

      {/* Tip */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>💡 Tip:</strong> Click any booking to view details.
          {canBook && ' Click an empty date to schedule a new fleet service booking.'}
          {' '}Work order events (all-day banners) link to the work order page.
        </p>
      </div>

      {/* Past date toast */}
      {pastDateMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                        flex items-center gap-2 px-5 py-3 bg-gray-900 text-white
                        text-sm font-medium rounded-xl shadow-xl">
          <CalendarIcon size={16} className="text-yellow-400 flex-shrink-0" />
          Please choose today or a future date to book a service.
        </div>
      )}

    </div>
  )
}