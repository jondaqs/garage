'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Check, X, RefreshCw, AlertCircle } from 'lucide-react'

export default function GoogleCalendarSync() {
  const supabase = createClient()
  const [isConnected, setIsConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [autoSync, setAutoSync] = useState(false)

  useEffect(() => {
    checkConnectionStatus()
  }, [])

  const checkConnectionStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Check if user has Google Calendar token stored
      const { data } = await supabase
        .from('user_profiles_secure')
        .select('google_calendar_token')
        .eq('auth_user_id', user.id)
        .single()

      setIsConnected(!!data?.google_calendar_token)
      setAutoSync(!!data?.google_calendar_auto_sync)
    } catch (error) {
      console.error('Error checking connection:', error)
    }
  }

  const connectGoogleCalendar = async () => {
    try {
      // Initialize Google OAuth
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      
      if (!clientId) {
        setError('Google Calendar is not configured. Please contact support.')
        return
      }

      const scopes = 'https://www.googleapis.com/auth/calendar.events'
      const redirectUri = `${window.location.origin}/api/auth/callback/google`
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `access_type=offline&` +
        `prompt=consent`

      // Open auth window
      window.location.href = authUrl
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error)
      setError('Failed to connect to Google Calendar')
    }
  }

  const disconnectGoogleCalendar = async () => {
    if (!confirm('Are you sure you want to disconnect Google Calendar? Your bookings will no longer sync.')) {
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      await supabase
        .from('user_profiles')
        .update({ 
          google_calendar_token: null,
          google_calendar_auto_sync: false
        })
        .eq('auth_user_id', user.id)

      setIsConnected(false)
      setAutoSync(false)
      setSuccess('Google Calendar disconnected successfully')
    } catch (error) {
      console.error('Error disconnecting:', error)
      setError('Failed to disconnect Google Calendar')
    }
  }

  const syncNow = async () => {
    setSyncing(true)
    setError('')
    setSuccess('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id, google_calendar_token')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile.google_calendar_token) {
        setError('Please connect Google Calendar first')
        return
      }

      // Get all upcoming bookings
      const { data: bookings } = await supabase
        .from('bookings_secure')
        .select(`
          *,
          service_provider:service_providers(name),
          shop:shops(name, town, county, street),
          vehicle:vehicles(plate_number, make, model),
          status:booking_statuses(code, display_name),
          booking_services(service:services(name))
        `)
        .eq('customer_user_id', profile.id)
        .gte('booking_date', new Date().toISOString().split('T')[0])
        .in('status.code', ['pending', 'confirmed', 'in_progress'])

      // Call API to sync with Google Calendar
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: profile.google_calendar_token,
          bookings
        })
      })

      if (!response.ok) throw new Error('Sync failed')

      const result = await response.json()
      setSuccess(`Synced ${result.count} bookings to Google Calendar`)
    } catch (error) {
      console.error('Error syncing:', error)
      setError('Failed to sync with Google Calendar')
    } finally {
      setSyncing(false)
    }
  }

  const toggleAutoSync = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const newValue = !autoSync

      await supabase
        .from('user_profiles')
        .update({ google_calendar_auto_sync: newValue })
        .eq('auth_user_id', user.id)

      setAutoSync(newValue)
      setSuccess(`Auto-sync ${newValue ? 'enabled' : 'disabled'}`)
    } catch (error) {
      console.error('Error toggling auto-sync:', error)
      setError('Failed to update auto-sync setting')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Calendar size={24} />
            Google Calendar Integration
          </h2>
          <p className="text-sm text-gray-600">
            Automatically sync your bookings with Google Calendar
          </p>
        </div>
        
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          isConnected 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {isConnected ? (
            <span className="flex items-center gap-1">
              <Check size={14} /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <X size={14} /> Not Connected
            </span>
          )}
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <Check className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {!isConnected ? (
        <div className="text-center py-8">
          <div className="mb-4">
            <Calendar className="mx-auto text-gray-400 mb-3" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Connect Google Calendar
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Keep your bookings synced with Google Calendar automatically
            </p>
          </div>

          <button
            onClick={connectGoogleCalendar}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
            </svg>
            Connect Google Calendar
          </button>

          <div className="mt-6 text-xs text-gray-500">
            <p>By connecting, you allow GariCare to:</p>
            <ul className="mt-2 space-y-1">
              <li>• Create events for your bookings</li>
              <li>• Update events when bookings change</li>
              <li>• Delete events when bookings are cancelled</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Auto-sync Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Automatic Sync</h3>
              <p className="text-sm text-gray-600">
                Automatically sync new and updated bookings
              </p>
            </div>
            <button
              onClick={toggleAutoSync}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoSync ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoSync ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Manual Sync Button */}
          <div>
            <button
              onClick={syncNow}
              disabled={syncing}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 font-medium disabled:opacity-50"
            >
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Manually sync all upcoming bookings to Google Calendar
            </p>
          </div>

          {/* Disconnect Button */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={disconnectGoogleCalendar}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Disconnect Google Calendar
            </button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">How it works</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• New bookings are automatically added to your Google Calendar</li>
          <li>• When a booking is confirmed, the calendar event is updated</li>
          <li>• Cancelled bookings are removed from your calendar</li>
          <li>• You'll receive calendar reminders 1 hour before each booking</li>
        </ul>
      </div>
    </div>
  )
}