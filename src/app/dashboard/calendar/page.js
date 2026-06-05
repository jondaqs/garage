'use client'

import { useState, useEffect, useMemo } from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Calendar as CalendarIcon, Filter, Download, Plus } from 'lucide-react'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = momentLocalizer(moment)

export default function BookingsCalendarPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('month')
  const [date, setDate] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState('all')
  const [pastDateMsg, setPastDateMsg] = useState(false)

  useEffect(() => {
    loadBookings()
  }, [])

  const loadBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { data, error } = await supabase
        .from('bookings_secure')
        .select(`
          *,
          service_provider:service_providers_secure(name),
          shop:shops_secure(name, town),
          vehicle:vehicles_secure(plate_number, make, model),
          status:booking_statuses(code, display_name, color_code)
        `)
        .eq('customer_user_id', profile.id)
        .order('booking_date', { ascending: true })

      if (error) throw error
      setBookings(data || [])
    } catch (error) {
      console.error('Error loading bookings:', error)
    } finally {
      setLoading(false)
    }
  }

  // Transform bookings into calendar events
  const events = useMemo(() => {
    return bookings
      .filter(booking => {
        if (statusFilter === 'all') return true
        return booking.status?.code === statusFilter
      })
      .map(booking => {
        const [startHour, startMin] = booking.booking_time_start.split(':')
        const [endHour, endMin] = booking.booking_time_end.split(':')
        
        const start = new Date(booking.booking_date)
        start.setHours(parseInt(startHour), parseInt(startMin), 0)
        
        const end = new Date(booking.booking_date)
        end.setHours(parseInt(endHour), parseInt(endMin), 0)

        return {
          id: booking.id,
          title: `${booking.vehicle?.plate_number} - ${booking.service_provider?.name}`,
          start,
          end,
          resource: booking,
          status: booking.status?.code
        }
      })
  }, [bookings, statusFilter])

  // Event style based on status
  const eventStyleGetter = (event) => {
    const statusColors = {
      pending: { backgroundColor: '#f59e0b', borderColor: '#d97706' },
      confirmed: { backgroundColor: '#3b82f6', borderColor: '#2563eb' },
      in_progress: { backgroundColor: '#8b5cf6', borderColor: '#7c3aed' },
      completed: { backgroundColor: '#10b981', borderColor: '#059669' },
      cancelled: { backgroundColor: '#ef4444', borderColor: '#dc2626' }
    }

    const style = statusColors[event.status] || { backgroundColor: '#6b7280', borderColor: '#4b5563' }
    
    return {
      style: {
        ...style,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: `2px solid ${style.borderColor}`,
        display: 'block',
        fontSize: '12px',
        padding: '2px 5px'
      }
    }
  }

  const slotPropGetter = (slotDate) => {
    if (slotDate < today) {
      return {
        style: {
          backgroundColor: '#f3f4f6',
          cursor: 'not-allowed',
        }
      }
    }
    return {}
  }

  const handleSelectEvent = (event) => {
    router.push(`/dashboard/bookings/${event.id}`)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const handleSelectSlot = ({ start }) => {
    // Block past dates — show friendly message
    if (start < today) {
      setPastDateMsg(true)
      setTimeout(() => setPastDateMsg(false), 3000)
      return
    }
    const dateStr = moment(start).format('YYYY-MM-DD')
    sessionStorage.setItem('selectedBookingDate', dateStr)
    router.push('/dashboard/bookings/book')
  }

  const exportCalendar = () => {
    // Create .ics file content
    let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//GariCare//Bookings//EN\n'
    
    events.forEach(event => {
      const booking = event.resource
      icsContent += 'BEGIN:VEVENT\n'
      icsContent += `UID:${event.id}\n`
      icsContent += `DTSTAMP:${moment().format('YYYYMMDDTHHmmss')}Z\n`
      icsContent += `DTSTART:${moment(event.start).format('YYYYMMDDTHHmmss')}\n`
      icsContent += `DTEND:${moment(event.end).format('YYYYMMDDTHHmmss')}\n`
      icsContent += `SUMMARY:${event.title}\n`
      icsContent += `DESCRIPTION:Booking at ${booking.shop?.name}, ${booking.shop?.town}\n`
      icsContent += `LOCATION:${booking.shop?.name}, ${booking.shop?.town}\n`
      icsContent += `STATUS:${booking.status?.display_name}\n`
      icsContent += 'END:VEVENT\n'
    })
    
    icsContent += 'END:VCALENDAR'

    // Download file
    const blob = new Blob([icsContent], { type: 'text/calendar' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'garicare-bookings.ics'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bookings Calendar</h1>
            <p className="text-gray-600">{bookings.length} total bookings</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportCalendar}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Download size={20} />
              Export Calendar
            </button>
            <button
              onClick={() => router.push('/dashboard/bookings')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={20} />
              New Booking
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Status Legend */}
          <div className="flex-1 flex items-center gap-4 ml-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-xs text-gray-600">Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-xs text-gray-600">Confirmed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
              <span className="text-xs text-gray-600">In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-600">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-xs text-gray-600">Cancelled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-lg shadow-sm p-6" style={{ height: '700px' }}>
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
          tooltipAccessor={(event) => `${event.title}\n${event.resource.status?.display_name}`}
          messages={{
            next: "Next",
            previous: "Previous",
            today: "Today",
            month: "Month",
            week: "Week",
            day: "Day",
            agenda: "Agenda",
            noEventsInRange: "No bookings in this date range"
          }}
          style={{ height: '100%' }}
        />
      </div>

      {/* Help Text */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>💡 Tip:</strong> Click on a booking to view details. Click on an empty date to create a new booking for that day 
          (you'll select your vehicle and provider, then the date will be pre-filled).
        </p>
      </div>
      {/* Past date toast */}
      {pastDateMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                        flex items-center gap-2 px-5 py-3 bg-gray-900 text-white
                        text-sm font-medium rounded-xl shadow-xl animate-fade-in">
          <CalendarIcon size={16} className="text-yellow-400 flex-shrink-0" />
          Please choose today or a future date to book a service.
        </div>
      )}
    </div>
  )
}