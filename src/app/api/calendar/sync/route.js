// FILE LOCATION: src/app/api/calendar/sync/route.js
// API route for syncing bookings with Google Calendar

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { writeLimiter } from '@/lib/rateLimiters'

export async function POST(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const { token, bookings } = await request.json()

    // ── Auth check ────────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    if (!token || !bookings) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Sync each booking to Google Calendar
    const results = []
    
    for (const booking of bookings) {
      try {
        const event = {
          summary: `Carfix-Connect - ${booking.vehicle?.plate_number}`,
          description: `Booking at ${booking.service_provider?.name}\n\n` +
                      `Vehicle: ${booking.vehicle?.plate_number} ${booking.vehicle?.make} ${booking.vehicle?.model}\n\n` +
                      `Services: ${booking.booking_services?.map(bs => bs.service?.name).join(', ')}\n\n` +
                      `Problem: ${booking.problem_description}`,
          location: `${booking.shop?.name}, ${booking.shop?.town}, ${booking.shop?.county}${booking.shop?.street ? ', ' + booking.shop?.street : ''}`,
          start: {
            dateTime: `${booking.booking_date}T${booking.booking_time_start}:00`,
            timeZone: 'Africa/Nairobi'
          },
          end: {
            dateTime: `${booking.booking_date}T${booking.booking_time_end}:00`,
            timeZone: 'Africa/Nairobi'
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 60 },
              { method: 'popup', minutes: 30 }
            ]
          },
          status: booking.status?.code === 'confirmed' ? 'confirmed' : 'tentative',
          extendedProperties: {
            private: {
              carfixConnectBookingId: booking.id,
              carfixConnectBookingNumber: booking.booking_number
            }
          }
        }

        // Create event in Google Calendar
        const response = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to create event: ${response.statusText}`)
        }

        const createdEvent = await response.json()
        results.push({ bookingId: booking.id, eventId: createdEvent.id, success: true })
      } catch (error) {
        console.error(`Error syncing booking ${booking.id}:`, error)
        results.push({ bookingId: booking.id, success: false, error: 'Internal server error' })
      }
    }

    const successCount = results.filter(r => r.success).length

    return NextResponse.json({
      success: true,
      count: successCount,
      total: bookings.length,
      results
    })
  } catch (error) {
    console.error('Error in sync API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Update event in Google Calendar
export async function PUT(request) {
  const limited2 = writeLimiter.check(request)
  if (limited2) return limited2

  try {
    const { token, eventId, booking } = await request.json()

    const event = {
      summary: `Carfix-Connect - ${booking.vehicle?.plate_number}`,
      description: `Booking at ${booking.service_provider?.name}\n\n` +
                  `Vehicle: ${booking.vehicle?.plate_number} ${booking.vehicle?.make} ${booking.vehicle?.model}\n\n` +
                  `Services: ${booking.booking_services?.map(bs => bs.service?.name).join(', ')}\n\n` +
                  `Problem: ${booking.problem_description}`,
      location: `${booking.shop?.name}, ${booking.shop?.town}, ${booking.shop?.county}`,
      start: {
        dateTime: `${booking.booking_date}T${booking.booking_time_start}:00`,
        timeZone: 'Africa/Nairobi'
      },
      end: {
        dateTime: `${booking.booking_date}T${booking.booking_time_end}:00`,
        timeZone: 'Africa/Nairobi'
      },
      status: booking.status?.code === 'confirmed' ? 'confirmed' : 'tentative'
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to update event: ${response.statusText}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating event:', error)
    return NextResponse.json(
      { error: 'Failed to update event' },
      { status: 500 }
    )
  }
}

// Delete event from Google Calendar
export async function DELETE(request) {
  const limited3 = writeLimiter.check(request)
  if (limited3) return limited3

  try {
    const { token, eventId } = await request.json()

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete event: ${response.statusText}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting event:', error)
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    )
  }
}