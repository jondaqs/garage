// → Drop this file at: src/lib/calendar/providerCalendarColors.js

/**
 * Color palette + legend definitions for the provider calendar.
 *
 * Coloring rules (in priority order, applied per-event):
 *   1. If the booking has an active (non-terminal) work order → BLUE
 *   2. If the booking has a closed/completed work order      → GREEN
 *   3. Otherwise → use the booking-status colour
 *
 * Work-order events (standalone, not derived from a booking) get their own
 * neutral cyan tone so they don't fight with the booking palette.
 */

export const STATUS_COLORS = {
  // Booking statuses
  pending:     { bg: '#f59e0b', border: '#d97706', tag: 'Pending'     },
  confirmed:   { bg: '#3b82f6', border: '#2563eb', tag: 'Confirmed'   },
  in_progress: { bg: '#8b5cf6', border: '#7c3aed', tag: 'In Progress' },
  completed:   { bg: '#10b981', border: '#059669', tag: 'Completed'   },
  cancelled:   { bg: '#ef4444', border: '#dc2626', tag: 'Cancelled'   },
  no_show:     { bg: '#6b7280', border: '#4b5563', tag: 'No Show'     },
}

export const WO_LINKED_COLORS = {
  active: { bg: '#2563eb', border: '#1d4ed8', tag: 'Has Active WO' },
  closed: { bg: '#16a34a', border: '#15803d', tag: 'Has Closed WO' },
}

export const STANDALONE_WO_COLOR =
  { bg: '#06b6d4', border: '#0891b2', tag: 'Work Order' }

const FALLBACK = { bg: '#6b7280', border: '#4b5563' }

const TERMINAL_WO_CODES = new Set(['completed', 'cancelled', 'closed'])

/**
 * Pick a colour for a calendar event.
 *
 * @param {Object} event   — calendar event with .kind and .resource
 * @returns {{bg:string, border:string}}
 */
export function pickEventColor(event) {
  if (!event) return FALLBACK

  // Standalone work-order event
  if (event.kind === 'work_order') {
    return STANDALONE_WO_COLOR
  }

  // Booking event — check its linked work order first
  const wo = event.resource?.work_order
  if (wo?.status?.code) {
    return TERMINAL_WO_CODES.has(wo.status.code)
      ? WO_LINKED_COLORS.closed
      : WO_LINKED_COLORS.active
  }

  // Fall through to booking-status colour
  return STATUS_COLORS[event.status] || FALLBACK
}

/**
 * Build the legend rows to display below the filters.
 */
export const LEGEND = [
  { label: 'Pending',         color: STATUS_COLORS.pending.bg     },
  { label: 'Confirmed',       color: STATUS_COLORS.confirmed.bg   },
  { label: 'In Progress',     color: STATUS_COLORS.in_progress.bg },
  { label: 'Completed',       color: STATUS_COLORS.completed.bg   },
  { label: 'Cancelled',       color: STATUS_COLORS.cancelled.bg   },
  { label: 'Has Active WO',   color: WO_LINKED_COLORS.active.bg   },
  { label: 'Has Closed WO',   color: WO_LINKED_COLORS.closed.bg   },
  { label: 'Work Order',      color: STANDALONE_WO_COLOR.bg       },
]