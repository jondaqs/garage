'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar as CalendarIcon, Filter, Download, Plus,
  Car, Store, Loader2, ChevronRight, ArrowLeft, AlertCircle,
  BellRing, X, Shield
} from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import CalendarStatsCard      from '@/components/provider/CalendarStatsCard'
import BookCustomerModal      from '@/components/provider/BookCustomerModal'
import useReminderScanner     from '@/hooks/useReminderScanner'
import { pickEventColor, LEGEND } from '@/lib/calendar/providerCalendarColors'

const localizer = momentLocalizer(moment)

export default function MemberProviderCalendarPage() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()

  const providerId = params.providerId

  // ── State ───────────────────────────────────────────────────────────────
  const [authChecked,   setAuthChecked]   = useState(false)
  const [authError,     setAuthError]     = useState('')
  const [provider,      setProvider]      = useState(null)
  const [membership,    setMembership]    = useState(null) // { source, role, can_approve_work }
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
  const [noPermMsg,     setNoPermMsg]     = useState(false)
  const [toastMsg,      setToastMsg]      = useState('')

  // ── Book-customer modal state ───────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDate, setModalDate] = useState(null)

  // ── Reminder scanner — only fires when member has can_approve_work ──────
  const canApproveWork = !!membership?.can_approve_work
  const {
    lastFiredBookings,
    scanning: scanInFlight,
    dismissBanner,
  } = useReminderScanner({
    enabled: !!provider?.id && canApproveWork,
  })

  // Refresh data after the scanner fires reminders
  useEffect(() => {
    if (lastFiredBookings.length > 0) {
      loadData()
      const t = setTimeout(() => dismissBanner(), 10_000)
      return () => clearTimeout(t)
    }
  }, [lastFiredBookings, dismissBanner])

  // ── First: authorise this user as a member of THIS provider ─────────────
  useEffect(() => {
    if (!providerId) return
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }

        const { data: profile } = await supabase
          .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
        if (!profile) {
          setAuthError('Profile not found')
          setAuthChecked(true)
          return
        }

        // Try service_provider_users first (admin/manager/accountant/mechanic-as-spu)
        const { data: spu } = await supabase
          .from('service_provider_users')
          .select('role, is_active, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice, can_chat')
          .eq('service_provider_id', providerId)
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle()

        // Also pull the mechanic record (some permissions live there)
        const { data: mech } = await supabase
          .from('mechanics')
          .select('role, is_active, can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates, can_send_invoice, can_chat')
          .eq('service_provider_id', providerId)
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle()

        if (!spu && !mech) {
          setAuthError("You aren't a member of this service provider.")
          setAuthChecked(true)
          return
        }

        // Merge permissions — either source grants the flag
        const merged = {
          source: spu ? 'spu' : 'mechanic',
          role:   spu?.role || mech?.role || 'mechanic',
          can_approve_work:    !!(spu?.can_approve_work     || mech?.can_approve_work),
          can_send_estimates:  !!(spu?.can_send_estimates   || mech?.can_send_estimates),
          can_send_invoice:    !!(spu?.can_send_invoice     || mech?.can_send_invoice),
          can_chat:            !!(spu?.can_chat             || mech?.can_chat),
        }
        setMembership(merged)

        // Provider basics
        const { data: prov } = await supabase
          .from('service_providers_secure')
          .select('id, name, status')
          .eq('id', providerId)
          .maybeSingle()
        setProvider(prov)

        setAuthChecked(true)
        loadData()
      } catch (e) {
        setAuthError(e.message)
        setAuthChecked(true)
      }
    })()
  }, [providerId, router])

  // ── Load bookings, work orders, vehicles, shops ─────────────────────────
  // Note: we intentionally do NOT setLoading(true) here. The initial spinner
  // is driven by the initial-state value (loading=true) which flips false in
  // this function's finally block on first run. Subsequent refetches (after
  // booking creation, after reminder scans, after permission denials) update
  // the page silently — flipping `loading` back to true would unmount the
  // main JSX tree (including the booking modal), so a user who just saw the
  // "Booking Created" success screen would have the modal yanked from under
  // them and re-mounted in its empty Step-0 state.
  const loadData = useCallback(async () => {
    if (!providerId) return
    try {
      const { data: shopRows } = await supabase
        .from('shops_secure').select('id, name, town')
        .eq('service_provider_id', providerId)
        .order('name')
      setShops(shopRows || [])

      const { data: bData } = await supabase
        .from('bookings_secure')
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
        .eq('service_provider_id', providerId)
        .order('booking_date', { ascending: true })
      setBookings(bData || [])

      const seen = new Map()
      ;(bData || []).forEach(b => {
        if (b.vehicle?.id && !seen.has(b.vehicle.id)) seen.set(b.vehicle.id, b.vehicle)
      })
      setVehicles(Array.from(seen.values()))

      // Active standalone work orders
      const { data: termStatuses } = await supabase
        .from('work_order_statuses').select('id')
        .in('code', ['completed', 'cancelled', 'closed'])
      const termIds = termStatuses?.map(s => s.id) || []
      const linkedWoIds = new Set((bData || []).map(b => b.work_order_id).filter(Boolean))
      const { data: woData } = await supabase
        .from('work_orders_secure')
        .select(`
          id, work_order_number, opened_at, updated_at, scheduled_start,
          vehicle:vehicles(id, plate_number, make, model),
          status:work_order_statuses(code, display_name)
        `)
        .eq('service_provider_id', providerId)
        .not('status_id', 'in', termIds.length > 0 ? `(${termIds.join(',')})` : '(null)')
      setWorkOrders((woData || []).filter(wo => !linkedWoIds.has(wo.id)))
    } catch (err) {
      console.error('Member calendar load error:', err)
    } finally {
      setLoading(false)
    }
  }, [providerId])

  // ── Build calendar events (same shape as provider page) ─────────────────
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

  // ── Calendar event + slot styling ──────────────────────────────────────
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

  // ── Event click — members route to the member-side work-order page ─────
  const handleSelectEvent = (event) => {
    if (event.kind === 'work_order') {
      router.push(`/dashboard/my-teams/work-order/${event.id}`)
    } else {
      const wo = event.resource?.work_order
      if (wo?.id) router.push(`/dashboard/my-teams/work-order/${wo.id}`)
      else        router.push(`/dashboard/my-teams/provider/${providerId}/bookings/${event.id}`)
    }
  }

  // ── Empty slot — only allow Book Customer when can_approve_work ────────
  const handleSelectSlot = ({ start }) => {
    if (start < today) {
      setPastDateMsg(true)
      setTimeout(() => setPastDateMsg(false), 3000)
      return
    }
    if (!canApproveWork) {
      setNoPermMsg(true)
      setTimeout(() => setNoPermMsg(false), 3500)
      return
    }
    setModalDate(moment(start).format('YYYY-MM-DD'))
    setModalOpen(true)
  }

  const handleBookingCreated = (result) => {
    setToastMsg(`Booking ${result.bookingNumber} created`)
    setTimeout(() => setToastMsg(''), 4000)
    loadData()
  }

  const exportCalendar = () => {
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Motiifix//Member Calendar//EN\n'
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
    a.download = `motiifix-calendar-${(provider?.name || 'provider').replace(/\W+/g,'-').toLowerCase()}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render gates ───────────────────────────────────────────────────────
  if (!authChecked) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin h-10 w-10 text-blue-600" />
    </div>
  )

  if (authError) return (
    <div className="max-w-2xl mx-auto p-6">
      <button
        onClick={() => router.push('/dashboard/my-teams')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm"
      >
        <ArrowLeft size={16} /> Back to My Teams
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
        <div>
          <p className="font-semibold text-red-900">Access denied</p>
          <p className="text-sm text-red-700 mt-1">{authError}</p>
        </div>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin h-10 w-10 text-blue-600" />
    </div>
  )

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-6 space-y-4">

      {/* Back link */}
      <button
        onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={15} /> Back to {provider?.name || 'Provider'}
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon size={24} className="text-blue-600" />
            Calendar
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500 mt-0.5">
            <span className="font-medium text-gray-700 truncate">{provider?.name}</span>
            <span>·</span>
            <span className="capitalize">{membership?.role?.replace(/_/g, ' ')}</span>
            {canApproveWork && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold flex items-center gap-1">
                <Shield size={9} /> WO access
              </span>
            )}
            {scanInFlight && <span className="text-xs text-gray-400">· scanning reminders…</span>}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''} ·{' '}
            {workOrders.length} active work order{workOrders.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCalendar}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
            <Download size={16} /> Export
          </button>
          {canApproveWork ? (
            <button
              onClick={() => { setModalDate(moment().format('YYYY-MM-DD')); setModalOpen(true) }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus size={16} /> Book Customer
            </button>
          ) : (
            <button
              disabled
              title="Booking requires the 'WO access' permission"
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium cursor-not-allowed">
              <Plus size={16} /> Book Customer
            </button>
          )}
        </div>
      </div>

      {/* Permission note — only when member CANNOT book */}
      {!canApproveWork && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-sm">
          <Shield className="text-blue-600 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-blue-900">
            You can view bookings and work orders, but creating new bookings requires
            <strong> WO access</strong> on your membership. Ask a team admin to grant it.
          </p>
        </div>
      )}

      {/* Reminder-fired banner — only when this member is firing them */}
      {canApproveWork && lastFiredBookings.length > 0 && (
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

      {/* Stats summary card (reused from provider) */}
      <CalendarStatsCard bookings={bookings} />

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center gap-3 sm:gap-4">
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
            <option value="no_show">No Show</option>
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

        {shops.length > 1 && (
          <div className="flex items-center gap-2">
            <Store size={16} className="text-gray-400 flex-shrink-0" />
            <select value={shopFilter} onChange={e => setShopFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 max-w-[180px]">
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
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
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
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ChevronRight className="text-blue-600 mt-0.5 flex-shrink-0" size={18} />
        <p className="text-sm text-blue-900">
          <strong>Tip:</strong> Click any booking to open it (or its active work order if one exists).
          {canApproveWork
            ? ' Click an empty future date to book a customer — search by plate or VIN to find them.'
            : ''}
          {' '}Bookings in <span className="font-medium text-blue-700">blue</span> have active work orders;
          <span className="font-medium text-green-700"> green</span> means the work order is closed.
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

      {noPermMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                        flex items-center gap-2 px-5 py-3 bg-gray-900 text-white
                        text-sm font-medium rounded-xl shadow-xl">
          <Shield size={16} className="text-amber-400 flex-shrink-0" />
          You need <strong>WO access</strong> permission to book customers.
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

      {/* Book Customer Modal — reused from provider side */}
      {canApproveWork && (
        <BookCustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedDate={modalDate}
        providerId={providerId}
        onCreated={handleBookingCreated}
        onOpenBooking={(bookingId) => {
            setModalOpen(false)
            router.push(`/dashboard/my-teams/provider/${providerId}/bookings/${bookingId}`)
        }}
        />
     )}
    </div>
  )
}