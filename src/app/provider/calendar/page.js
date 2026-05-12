'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Calendar as CalendarIcon, Filter, Download, Plus,
  Car, Store, Loader2, ChevronRight, BellRing, X
} from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import CalendarStatsCard      from '@/components/provider/CalendarStatsCard'
import BookCustomerModal      from '@/components/provider/BookCustomerModal'
import useReminderScanner     from '@/hooks/useReminderScanner'
import { pickEventColor, LEGEND } from '@/lib/calendar/providerCalendarColors'

const localizer = momentLocalizer(moment)

export default function ProviderCalendarPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [provider,      setProvider]      = useState(null)
  const [bookings,      setBookings]      = useState([])
  const [workOrders,    setWorkOrders]    = useState([])
  const [shops,         setShops]         = useState([])
  const [vehicles,      setVehicles]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [view,          setView]          = useState('month')
  const [date,          setDate]          = useState(new Date())
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [vehicleFilter, setVehicleFilter] = useState('all')
  const [shopFilter,    setShopFilter]    = useState('all')
  const [showWOs,       setShowWOs]       = useState(true)
  const [pastDateMsg,   setPastDateMsg]   = useState(false)

  // ── Book-customer modal state ───────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDate, setModalDate] = useState(null)
  const [toastMsg,  setToastMsg]  = useState('')

  // ── Phase 3: reminder scanner ───────────────────────────────────────────
  const {
    lastFiredBookings,
    scanning: scanInFlight,
    dismissBanner,
  } = useReminderScanner({ enabled: !!provider?.id })

  useEffect(() => { loadAll() }, [])

  // Refresh bookings after any reminder fires so reminder_sent_at is current
  useEffect(() => {
    if (lastFiredBookings.length > 0) {
      loadAll()
      const t = setTimeout(() => dismissBanner(), 10_000)
      return () => clearTimeout(t)
    }
  }, [lastFiredBookings, dismissBanner])

  // ── Resolve provider + load data ────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles').select('id')
        .eq('auth_user_id', user.id).single()

      const { data: prov } = await supabase
        .from('service_providers')
        .select('id, name')
        .eq('owner_user_id', profile.id)
        .single()
      if (!prov) return
      setProvider(prov)

      const { data: shopRows } = await supabase
        .from('shops').select('id, name, town')
        .eq('service_provider_id', prov.id)
        .order('name')
      setShops(shopRows || [])

      const { data: bData } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, booking_date, booking_time_start, booking_time_end,
          problem_description, work_order_id, reminder_sent_at, customer_phone,
          customer_email,
          customer:user_profiles!customer_user_id(id, first_name, last_name, phone),
          vehicle:vehicles(id, plate_number, make, model),
          shop:shops(id, name, town),
          status:booking_statuses(code, display_name, color_code),
          work_order:work_orders!bookings_work_order_id_fkey(
            id, status:work_order_statuses(code, display_name)
          )
        `)
        .eq('service_provider_id', prov.id)
        .order('booking_date', { ascending: true })
      setBookings(bData || [])

      const seen = new Map()
      ;(bData || []).forEach(b => {
        if (b.vehicle?.id && !seen.has(b.vehicle.id)) seen.set(b.vehicle.id, b.vehicle)
      })
      setVehicles(Array.from(seen.values()))

      const { data: termStatuses } = await supabase
        .from('work_order_statuses').select('id')
        .in('code', ['completed', 'cancelled', 'closed'])
      const termIds = termStatuses?.map(s => s.id) || []
      const linkedWoIds = new Set((bData || []).map(b => b.work_order_id).filter(Boolean))
      const { data: woData } = await supabase
        .from('work_orders')
        .select(`
          id, work_order_number, opened_at, updated_at, scheduled_start,
          vehicle:vehicles(id, plate_number, make, model),
          status:work_order_statuses(code, display_name)
        `)
        .eq('service_provider_id', prov.id)
        .not('status_id', 'in', termIds.length > 0 ? `(${termIds.join(',')})` : '(null)')

      setWorkOrders((woData || []).filter(wo => !linkedWoIds.has(wo.id)))
    } catch (err) {
      console.error('Provider calendar load error:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  // ── Build calendar events ────────────────────────────────────────────────
  const events = useMemo(() => {
    const bookingEvents = bookings
      .filter(b => {
        if (statusFilter  !== 'all' && b.status?.code !== statusFilter)    return false
        if (vehicleFilter !== 'all' && b.vehicle?.id  !== vehicleFilter)   return false
        if (shopFilter    !== 'all' && b.shop?.id     !== shopFilter)      return false
        return true
      })
      .map(b => {
        const [sh, sm] = (b.booking_time_start || '08:00').split(':')
        const [eh, em] = (b.booking_time_end   || '09:00').split(':')
        const start = new Date(b.booking_date); start.setHours(parseInt(sh), parseInt(sm), 0)
        const end   = new Date(b.booking_date); end.setHours(parseInt(eh), parseInt(em), 0)
        const cust  = b.customer
          ? `${b.customer.first_name || ''} ${b.customer.last_name || ''}`.trim() || 'Customer'
          : 'Customer'
        return {
          id:       b.id,
          title:    `${b.vehicle?.plate_number || '—'} · ${cust}`,
          start, end,
          resource: b,
          kind:     'booking',
          status:   b.status?.code,
        }
      })

    const woEvents = showWOs
      ? workOrders
          .filter(wo => vehicleFilter === 'all' || wo.vehicle?.id === vehicleFilter)
          .map(wo => {
            const d = new Date(wo.scheduled_start || wo.opened_at || wo.updated_at)
            const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
            const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
            return {
              id:       wo.id,
              title:    `🔧 ${wo.work_order_number || ''} · ${wo.vehicle?.plate_number || '—'}`,
              start, end, allDay: true,
              resource: wo,
              kind:     'work_order',
              status:   wo.status?.code,
            }
          })
      : []

    return [...bookingEvents, ...woEvents]
  }, [bookings, workOrders, statusFilter, vehicleFilter, shopFilter, showWOs])

  const eventStyleGetter = (event) => {
    const c = pickEventColor(event)
    return {
      style: {
        backgroundColor: c.bg,
        borderColor:     c.border,
        borderRadius:    '4px',
        opacity:         0.92,
        color:           'white',
        border:          `2px solid ${c.border}`,
        fontSize:        '12px',
        padding:         '2px 5px',
      }
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const slotPropGetter = (slotDate) => {
    if (slotDate < today) {
      return { style: { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } }
    }
    return {}
  }

  const handleSelectEvent = (event) => {
    if (event.kind === 'work_order') {
      router.push(`/provider/work-orders/${event.id}`)
    } else {
      const wo = event.resource?.work_order
      if (wo?.id) router.push(`/provider/work-orders/${wo.id}`)
      else        router.push(`/provider/bookings/${event.id}`)
    }
  }

  const handleSelectSlot = ({ start }) => {
    if (start < today) {
      setPastDateMsg(true)
      setTimeout(() => setPastDateMsg(false), 3000)
      return
    }
    setModalDate(moment(start).format('YYYY-MM-DD'))
    setModalOpen(true)
  }

  const handleBookingCreated = (result) => {
    setToastMsg(`Booking ${result.bookingNumber} created`)
    setTimeout(() => setToastMsg(''), 4000)
    loadAll()
  }

  const exportCalendar = () => {
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Motiifix//Provider Calendar//EN\n'
    events.forEach(ev => {
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
        const b = ev.resource
        ics += `DESCRIPTION:Booking ${b.booking_number || ''} - ${b.status?.display_name || ''}\n`
        if (b.shop?.name) ics += `LOCATION:${b.shop.name}${b.shop.town ? `, ${b.shop.town}` : ''}\n`
      } else {
        ics += `DESCRIPTION:Work Order ${ev.resource.work_order_number} - ${ev.resource.status?.display_name}\n`
      }
      ics += 'END:VEVENT\n'
    })
    ics += 'END:VCALENDAR'

    const blob = new Blob([ics], { type: 'text/calendar' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = 'motiifix-provider-calendar.ics'; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin h-10 w-10 text-green-600" />
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-6 space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon size={24} className="text-green-600" />
            Calendar
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''} ·{' '}
            {workOrders.length} active work order{workOrders.length !== 1 ? 's' : ''}
            {scanInFlight && <span className="ml-2 text-xs text-gray-400">· scanning reminders…</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCalendar}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
            <Download size={16} /> Export
          </button>
          <button
            onClick={() => {
              setModalDate(moment().format('YYYY-MM-DD'))
              setModalOpen(true)
            }}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            <Plus size={16} /> Book Customer
          </button>
        </div>
      </div>

      {/* Phase 3 — Reminder-fired banner */}
      {lastFiredBookings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <BellRing className="text-amber-600 animate-pulse" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Reminders sent — {lastFiredBookings.length} booking{lastFiredBookings.length !== 1 ? 's' : ''} starting in the next 24h
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Customer{lastFiredBookings.length !== 1 ? 's have' : ' has'} been notified by email and SMS.{' '}
              {lastFiredBookings.slice(0, 3).map(b => b.booking_number).join(', ')}
              {lastFiredBookings.length > 3 ? `, +${lastFiredBookings.length - 3} more` : ''}
            </p>
          </div>
          <button onClick={dismissBanner}
            className="p-1 text-amber-600 hover:text-amber-900 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Stats summary card */}
      <CalendarStatsCard bookings={bookings} />

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400 flex-shrink-0" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>
        </div>

        {vehicles.length > 1 && (
          <div className="flex items-center gap-2">
            <Car size={16} className="text-gray-400 flex-shrink-0" />
            <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500 max-w-[180px]">
              <option value="all">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.plate_number}{v.make ? ` · ${v.make}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {shops.length > 1 && (
          <div className="flex items-center gap-2">
            <Store size={16} className="text-gray-400 flex-shrink-0" />
            <select value={shopFilter} onChange={e => setShopFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500 max-w-[180px]">
              <option value="all">All Shops</option>
              {shops.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.town ? ` · ${s.town}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={showWOs}
            onChange={e => setShowWOs(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
          <span className="text-sm text-gray-600">Show standalone work orders</span>
        </label>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm p-3 flex flex-wrap gap-x-4 gap-y-2">
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: l.color }} />
            <span className="text-xs text-gray-600">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6" style={{ height: '700px' }}>
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
          selectable
          eventPropGetter={eventStyleGetter}
          slotPropGetter={slotPropGetter}
          views={['month', 'week', 'day', 'agenda']}
          popup
          tooltipAccessor={ev => {
            if (ev.kind === 'work_order') {
              return `WO ${ev.resource.work_order_number || ''}\n${ev.resource.status?.display_name || ''}`
            }
            const b = ev.resource
            const wo = b.work_order
            const woLine = wo ? `\nWO: ${wo.status?.display_name || 'linked'}` : ''
            const remLine = b.reminder_sent_at ? '\n⏰ Reminder sent' : ''
            return `${b.booking_number || ''}\n${b.status?.display_name || ''}${woLine}${remLine}`
          }}
          messages={{
            next: 'Next', previous: 'Prev', today: 'Today',
            month: 'Month', week: 'Week', day: 'Day', agenda: 'Agenda',
            noEventsInRange: 'No events in this range',
          }}
          style={{ height: '100%' }}
        />
      </div>

      {/* Tip */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <ChevronRight className="text-green-600 mt-0.5 flex-shrink-0" size={18} />
        <p className="text-sm text-green-900">
          <strong>Tip:</strong> Click any booking to open it (or its active work order if one exists).
          Click an empty future date to <strong>book a customer</strong> — search by plate or VIN to find them.
          Bookings in <span className="font-medium text-blue-700">blue</span> have active work orders;
          <span className="font-medium text-green-700"> green</span> means the work order is closed.
          Reminders fire automatically <strong>24 hours</strong> before each booking.
        </p>
      </div>

      {/* Toasts */}
      {pastDateMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                        flex items-center gap-2 px-5 py-3 bg-gray-900 text-white
                        text-sm font-medium rounded-xl shadow-xl">
          <CalendarIcon size={16} className="text-yellow-400 flex-shrink-0" />
          Please choose today or a future date.
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                        flex items-center gap-2 px-5 py-3 bg-green-600 text-white
                        text-sm font-medium rounded-xl shadow-xl">
          <CalendarIcon size={16} />
          {toastMsg}
        </div>
      )}

      {/* Book Customer Modal */}
      <BookCustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedDate={modalDate}
        providerId={provider?.id}
        onCreated={handleBookingCreated}
        onOpenBooking={(bookingId) => {
          setModalOpen(false)
          router.push(`/provider/bookings/${bookingId}`)
        }}
      />
    </div>
  )
}