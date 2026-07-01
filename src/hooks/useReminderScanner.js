// → Drop this file at: src/hooks/useReminderScanner.js
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useReminderScanner
 * ──────────────────
 * Hits POST /api/bookings/reminders/scan on a fixed interval while the page
 * is open + visible. The scan endpoint is scope-restricted server-side to the
 * authenticated provider, so this is safe to call from anywhere a provider is
 * signed in.
 *
 * The hook is paused when the document is hidden (tab in background) so
 * reminders don't fire from idle tabs.
 *
 * Returns:
 *   {
 *     lastFiredBookings  — array of bookings the most recent scan acted on
 *                          (status === 'fired'), useful for surfacing a
 *                          banner on the calendar page
 *     lastScanAt         — ISO timestamp of the most recent scan
 *     scanning           — boolean, true while a scan is in flight
 *     runNow             — () => Promise — manually trigger a scan
 *   }
 *
 * Props:
 *   enabled       — gate the scanner on/off (default: true)
 *   intervalMs    — poll interval (default: 5 minutes)
 *   runOnMount    — kick off a scan immediately when the hook mounts
 */
export default function useReminderScanner({
  enabled    = true,
  intervalMs = 5 * 60 * 1000,
  runOnMount = true,
} = {}) {
  const [scanning,          setScanning]          = useState(false)
  const [lastScanAt,        setLastScanAt]        = useState(null)
  const [lastFiredBookings, setLastFiredBookings] = useState([])
  const inFlightRef = useRef(false)

  const runNow = useCallback(async () => {
    if (inFlightRef.current) return null
    inFlightRef.current = true
    setScanning(true)
    try {
      const resp = await fetch('/api/bookings/reminders/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    '{}',
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data?.success) {
        const fired = (data.bookings || []).filter(b => b.status === 'fired')
        if (fired.length > 0) setLastFiredBookings(fired)
        setLastScanAt(new Date().toISOString())
        return data
      }
      return null
    } catch (e) {
      console.warn('[useReminderScanner] scan failed:')
      return null
    } finally {
      inFlightRef.current = false
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let timer = null

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      runNow()
    }

    if (runOnMount) tick()
    timer = setInterval(tick, intervalMs)

    const handleVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', handleVis)

    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVis)
    }
  }, [enabled, intervalMs, runOnMount, runNow])

  const dismissBanner = useCallback(() => setLastFiredBookings([]), [])

  return { scanning, lastScanAt, lastFiredBookings, runNow, dismissBanner }
}