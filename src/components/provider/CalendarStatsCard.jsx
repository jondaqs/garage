// → Drop this file at: src/components/provider/CalendarStatsCard.jsx
'use client'

import { useMemo } from 'react'
import {
  CalendarClock, AlertTriangle, CheckCircle2, Clock, TrendingUp
} from 'lucide-react'

/**
 * CalendarStatsCard
 * ─────────────────
 * Renders 4 KPI tiles + a tiny 14-day bar chart summarising upcoming &
 * "forgotten" bookings for the provider.
 *
 * Props
 *   bookings   — array of booking rows (with .booking_date and .status.code)
 *
 * "Forgotten" = bookings whose date is in the past but whose status is still
 * 'pending' or 'confirmed' (never moved to in_progress/completed/cancelled).
 */
export default function CalendarStatsCard({ bookings = [] }) {

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const in7   = new Date(today); in7.setDate(in7.getDate() + 7)

    const liveCodes = new Set(['pending', 'confirmed', 'in_progress'])
    const openCodes = new Set(['pending', 'confirmed'])

    let todayCount     = 0
    let next7Count     = 0
    let pendingCount   = 0
    let forgottenCount = 0

    // 14-day series: 7 days back, today, 6 days forward (label index 0..13)
    const series = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - 7 + i)
      return { date: d, count: 0, isToday: i === 7, isPast: i < 7 }
    })

    for (const b of bookings) {
      const code = b.status?.code
      const bd   = b.booking_date ? new Date(b.booking_date) : null
      if (!bd) continue
      bd.setHours(0, 0, 0, 0)

      // Today
      if (bd.getTime() === today.getTime() && liveCodes.has(code)) {
        todayCount++
      }
      // Next 7 days (today inclusive → +7 exclusive)
      if (bd >= today && bd < in7 && liveCodes.has(code)) {
        next7Count++
      }
      // Pending awaiting confirmation (future only)
      if (bd >= today && code === 'pending') {
        pendingCount++
      }
      // Forgotten: past date, still pending or confirmed
      if (bd < today && openCodes.has(code)) {
        forgottenCount++
      }
      // Bar-chart bucket
      for (const slot of series) {
        if (bd.getTime() === slot.date.getTime() && liveCodes.has(code)) {
          slot.count++
          break
        }
      }
    }

    return { todayCount, next7Count, pendingCount, forgottenCount, series }
  }, [bookings])

  const maxBar = Math.max(1, ...stats.series.map(s => s.count))

  const tiles = [
    {
      label: 'Today',
      value: stats.todayCount,
      icon:  CalendarClock,
      colorBg: 'bg-blue-50',
      colorFg: 'text-blue-700',
      colorIcon: 'text-blue-600',
    },
    {
      label: 'Next 7 days',
      value: stats.next7Count,
      icon:  TrendingUp,
      colorBg: 'bg-indigo-50',
      colorFg: 'text-indigo-700',
      colorIcon: 'text-indigo-600',
    },
    {
      label: 'Pending confirmation',
      value: stats.pendingCount,
      icon:  Clock,
      colorBg: 'bg-amber-50',
      colorFg: 'text-amber-700',
      colorIcon: 'text-amber-600',
    },
    {
      label: 'Forgotten / overdue',
      value: stats.forgottenCount,
      icon:  AlertTriangle,
      colorBg: stats.forgottenCount > 0 ? 'bg-red-50' : 'bg-emerald-50',
      colorFg: stats.forgottenCount > 0 ? 'text-red-700' : 'text-emerald-700',
      colorIcon: stats.forgottenCount > 0 ? 'text-red-600' : 'text-emerald-600',
    },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {tiles.map(t => {
          const Icon = t.icon
          return (
            <div key={t.label}
              className={`${t.colorBg} rounded-lg p-3 flex items-start gap-3`}>
              <div className={`${t.colorIcon} flex-shrink-0 mt-0.5`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <p className={`text-2xl font-bold ${t.colorFg} leading-tight`}>
                  {t.value}
                </p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">{t.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* 14-day mini bar chart */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Bookings — last 7 / next 7 days
          </p>
          {stats.forgottenCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
              <AlertTriangle size={12} />
              {stats.forgottenCount} overdue
            </span>
          )}
        </div>
        <div className="flex items-end gap-1 h-20">
          {stats.series.map((slot, i) => {
            const h = slot.count === 0 ? 4 : Math.max(8, (slot.count / maxBar) * 72)
            const isFuture = !slot.isPast && !slot.isToday
            const barColor = slot.isToday
              ? 'bg-blue-600'
              : isFuture
                ? 'bg-indigo-400'
                : slot.count > 0
                  ? 'bg-gray-300'
                  : 'bg-gray-100'
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className={`w-full ${barColor} rounded-t transition-all`}
                  style={{ height: `${h}px` }}
                  title={`${slot.date.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}: ${slot.count} booking${slot.count !== 1 ? 's' : ''}`}
                />
                <span className={`text-[10px] ${slot.isToday ? 'text-blue-700 font-bold' : 'text-gray-400'}`}>
                  {slot.date.getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}