// src/lib/calendar/addToCalendar.js
// Utility functions for adding bookings to external calendars

/**
 * Generate Google Calendar URL
 */
export function addToGoogleCalendar(booking) {
  const startDateTime = formatGoogleDateTime(booking.booking_date, booking.booking_time_start)
  const endDateTime = formatGoogleDateTime(booking.booking_date, booking.booking_time_end)
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Carfix-Connect Booking - ${booking.vehicle?.plate_number}`,
    dates: `${startDateTime}/${endDateTime}`,
    details: `Booking at ${booking.service_provider?.name}\n\nVehicle: ${booking.vehicle?.plate_number} ${booking.vehicle?.make} ${booking.vehicle?.model}\n\nServices: ${booking.booking_services?.map(bs => bs.service?.name).join(', ')}\n\nProblem: ${booking.problem_description}`,
    location: `${booking.shop?.name}, ${booking.shop?.town}, ${booking.shop?.county}${booking.shop?.street ? ', ' + booking.shop?.street : ''}`,
    ctz: 'Africa/Nairobi'
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Generate Apple Calendar URL (webcal)
 */
export function addToAppleCalendar(booking) {
  const icsContent = generateICS(booking)
  const blob = new Blob([icsContent], { type: 'text/calendar' })
  const url = window.URL.createObjectURL(blob)
  
  // Create download link
  const link = document.createElement('a')
  link.href = url
  link.download = `Carfix-Connect-booking-${booking.booking_number}.ics`
  link.click()
  
  window.URL.revokeObjectURL(url)
}

/**
 * Generate Outlook Calendar URL
 */
export function addToOutlookCalendar(booking) {
  const startDateTime = formatOutlookDateTime(booking.booking_date, booking.booking_time_start)
  const endDateTime = formatOutlookDateTime(booking.booking_date, booking.booking_time_end)
  
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: `Carfix-Connect Booking - ${booking.vehicle?.plate_number}`,
    startdt: startDateTime,
    enddt: endDateTime,
    body: `Booking at ${booking.service_provider?.name}\n\nVehicle: ${booking.vehicle?.plate_number} ${booking.vehicle?.make} ${booking.vehicle?.model}\n\nServices: ${booking.booking_services?.map(bs => bs.service?.name).join(', ')}\n\nProblem: ${booking.problem_description}`,
    location: `${booking.shop?.name}, ${booking.shop?.town}, ${booking.shop?.county}`
  })

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

/**
 * Download ICS file (works for all calendar apps)
 */
export function downloadICS(booking) {
  const icsContent = generateICS(booking)
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `Carfix-Connect-booking-${booking.booking_number}.ics`
  link.click()
  
  window.URL.revokeObjectURL(url)
}

/**
 * Generate ICS file content
 */
function generateICS(booking) {
  const startDateTime = formatICSDateTime(booking.booking_date, booking.booking_time_start)
  const endDateTime = formatICSDateTime(booking.booking_date, booking.booking_time_end)
  const now = formatICSDateTime(new Date())
  
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carfix-Connect//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Carfix-Connect Bookings',
    'X-WR-TIMEZONE:Africa/Nairobi',
    'BEGIN:VEVENT',
    `UID:${booking.id}@carfix-connect.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${startDateTime}`,
    `DTEND:${endDateTime}`,
    `SUMMARY:Carfix-Connect - ${booking.vehicle?.plate_number}`,
    `DESCRIPTION:Booking at ${booking.service_provider?.name}\\n\\nVehicle: ${booking.vehicle?.plate_number} ${booking.vehicle?.make} ${booking.vehicle?.model}\\n\\nServices: ${booking.booking_services?.map(bs => bs.service?.name).join(', ')}\\n\\nProblem: ${booking.problem_description?.replace(/\n/g, '\\n')}`,
    `LOCATION:${booking.shop?.name}, ${booking.shop?.town}, ${booking.shop?.county}${booking.shop?.street ? ', ' + booking.shop?.street : ''}`,
    `STATUS:${booking.status?.code === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
    `SEQUENCE:0`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder: Carfix-Connect booking in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  return icsContent
}

/**
 * Format datetime for Google Calendar
 */
function formatGoogleDateTime(date, time) {
  const [hours, minutes] = time.split(':')
  const dateObj = new Date(date)
  dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0)
  
  return dateObj.toISOString().replace(/-|:|\.\d+/g, '')
}

/**
 * Format datetime for Outlook Calendar
 */
function formatOutlookDateTime(date, time) {
  const [hours, minutes] = time.split(':')
  const dateObj = new Date(date)
  dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0)
  
  return dateObj.toISOString()
}

/**
 * Format datetime for ICS file
 */
function formatICSDateTime(date, time) {
  if (typeof date === 'string' && time) {
    const [hours, minutes] = time.split(':')
    const dateObj = new Date(date)
    dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0)
    date = dateObj
  }
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const mins = String(date.getMinutes()).padStart(2, '0')
  const secs = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}${month}${day}T${hours}${mins}${secs}`
}

/**
 * Get all calendar options with handlers
 */
export function getCalendarOptions(booking) {
  return [
    {
      name: 'Google Calendar',
      icon: '📅',
      color: 'bg-blue-600 hover:bg-blue-700',
      action: () => {
        window.open(addToGoogleCalendar(booking), '_blank')
      }
    },
    {
      name: 'Apple Calendar',
      icon: '🍎',
      color: 'bg-gray-800 hover:bg-gray-900',
      action: () => {
        addToAppleCalendar(booking)
      }
    },
    {
      name: 'Outlook',
      icon: '📧',
      color: 'bg-blue-500 hover:bg-blue-600',
      action: () => {
        window.open(addToOutlookCalendar(booking), '_blank')
      }
    },
    {
      name: 'Download .ics',
      icon: '📥',
      color: 'bg-green-600 hover:bg-green-700',
      action: () => {
        downloadICS(booking)
      }
    }
  ]
}