'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { CalendarDays, Car, Wrench, Loader2, Filter, Building2, Plus } from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = momentLocalizer(moment)

const EVENT_COLORS = {
  booking:    { bg: '#3b82f6', border: '#2563eb' },  // blue
  work_order: { bg: '#8b5cf6', border: '#7c3aed' },  // purple
  completed:  { bg: '#10b981', border: '#059669' },  // green
  cancelled:  { bg: '#ef4444', border: '#dc2626' },  // red
}

export default function CompanyCalendarPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const companyId = params.companyId

  const [bookings,    setBookings]    = useState([])
  const [workOrders,  setWorkOrders]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [view,        setView]        = useState('month')
  const [date,        setDate]        = useState(new Date())
  const [filter,      setFilter]      = useState('all')  // all | bookings | work_orders
  const [companyName, setCompanyName] = useState('')
  const [canBook,     setCanBook]     = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      // Verify membership
      const { data: mem } = await supabase
        .from('company_users').select('id, is_admin, staff_role, can_manage_fleet')
        .eq('user_id', profile.id).eq('company_id', companyId).eq('is_active', true).maybeSingle()
      if (!mem) { setError('Access denied.'); setLoading(false); return }
      setCanBook(!!(mem.can_manage_fleet || mem.is_admin))

      // Company name
      const { data: co } = await supabase
        .from('company_profiles').select('name').eq('id', companyId).maybeSingle()
      setCompanyName(co?.name || '')

      // Fleet vehicle IDs
      const { data: fleet } = await supabase
        .from('vehicle_ownership').select('vehicle_id').eq('owner_company_id', companyId)
      const vehicleIds = fleet?.map(f => f.vehicle_id) || []
      if (vehicleIds.length === 0) { setLoading(false); return }

      // Bookings for fleet vehicles
      const { data: bookingData } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_date, scheduled_time, status,
          vehicle:vehicles(plate_number, make, model),
          provider:service_providers(name)
        `)
        .in('vehicle_id', vehicleIds)
        .not('status', 'in', '("cancelled")')
        .order('scheduled_date')
      setBookings(bookingData || [])

      // Work orders for fleet vehicles
      const { data: woData } = await supabase
        .from('work_orders')
        .select(`
          id, work_order_number, opened_at, completed_at,
          status:work_order_statuses(code, display_name),
          vehicle:vehicles(plate_number, make, model),
          provider:service_providers(name)
        `)
        .in('vehicle_id', vehicleIds)
        .order('opened_at', { ascending: false })
      setWorkOrders(woData || [])

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const events = useMemo(() => {
    const evts = []

    if (filter !== 'work_orders') {
      bookings.forEach(b => {
        if (!b.scheduled_date) return
        const start = new Date(`${b.scheduled_date}T${b.scheduled_time || '08:00'}`)
        const end   = new Date(start.getTime() + 60 * 60 * 1000)
        const isCancelled = b.status === 'cancelled'
        evts.push({
          id:       `booking-${b.id}`,
          title:    `🚗 ${b.vehicle?.plate_number} — ${b.provider?.name || 'Booking'}`,
          start,
          end,
          resource: { type: 'booking', booking: b },
          color:    isCancelled ? EVENT_COLORS.cancelled : EVENT_COLORS.booking,
        })
      })
    }

    if (filter !== 'bookings') {
      workOrders.forEach(wo => {
        if (!wo.opened_at) return
        const start    = new Date(wo.opened_at)
        const end      = wo.completed_at ? new Date(wo.completed_at) : new Date(start.getTime() + 8 * 60 * 60 * 1000)
        const code     = wo.status?.code
        const isComplete = ['completed','closed'].includes(code)
        evts.push({
          id:       `wo-${wo.id}`,
          title:    `🔧 ${wo.vehicle?.plate_number} — ${wo.provider?.name || 'Work Order'}`,
          start,
          end,
          resource: { type: 'work_order', wo },
          color:    isComplete ? EVENT_COLORS.completed : EVENT_COLORS.work_order,
        })
      })
    }

    return evts
  }, [bookings, workOrders, filter])

  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor: event.color?.bg || '#6b7280',
      borderColor:     event.color?.border || '#4b5563',
      borderRadius:    '6px',
      color:           '#fff',
      border:          'none',
      padding:         '2px 6px',
      fontSize:        '12px',
    }
  })

  const handleSelectSlot = ({ start }) => {
    if (!canBook) return
    const dateStr = start.toISOString().split('T')[0]
    sessionStorage.setItem('selectedBookingDate', dateStr)
    router.push(`/dashboard/company/${companyId}/bookings/book`)
  }

  const handleSelectEvent = (event) => {
    const { type, booking, wo } = event.resource
    if (type === 'booking')    router.push(`/dashboard/company/${companyId}/bookings/${booking.id}`)
    if (type === 'work_order') router.push(`/dashboard/company/${companyId}/work-orders/${wo.id}`)
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays size={22} className="text-blue-600" /> Fleet Calendar
          </h1>
          {companyName && (
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
              <Building2 size={13} className="text-gray-400" /> {companyName}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            {[
              { value: 'all',         label: 'All'         },
              { value: 'bookings',    label: 'Bookings'    },
              { value: 'work_orders', label: 'Work Orders' },
            ].map(f => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          {canBook && (
            <button
              onClick={() => router.push(`/dashboard/company/${companyId}/bookings/book`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              <Plus size={15} /> Book Service
            </button>
          )}
        </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {filter !== 'work_orders' && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full" style={{ background: EVENT_COLORS.booking.bg }} />
            Booking
          </span>
        )}
        {filter !== 'bookings' && (
          <>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-full" style={{ background: EVENT_COLORS.work_order.bg }} />
              Work Order (Active)
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-full" style={{ background: EVENT_COLORS.completed.bg }} />
              Work Order (Complete)
            </span>
          </>
        )}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4"
        style={{ height: 620 }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable={canBook}
          popup
          style={{ height: '100%' }}
          views={['month', 'week', 'day', 'agenda']}
          tooltipAccessor={e => e.title}
        />
        {canBook && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            💡 Click on a booking to view details. Click an empty date to book a service for that day.
          </p>
        )}
      </div>
    </div>
  </div>
  )
}