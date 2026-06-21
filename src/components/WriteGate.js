'use client'

import { Lock } from 'lucide-react'

/**
 * WriteGate
 *
 * Wraps write-action buttons/forms on pages that remain accessible
 * in read-only mode (fleet, team, bookings, work orders).
 *
 * When canWrite is false, the children are rendered with opacity
 * and pointer-events disabled, plus an inline message.
 *
 * Usage:
 *   <WriteGate canWrite={access.canWrite} state={access.state}>
 *     <button onClick={handleAddVehicle}>Add Vehicle</button>
 *   </WriteGate>
 *
 * Or wrap an entire action bar:
 *   <WriteGate canWrite={access.canWrite} state={access.state} inline>
 *     <div className="flex gap-2">
 *       <button>Invite Member</button>
 *       <button>Change Roles</button>
 *     </div>
 *   </WriteGate>
 */
export default function WriteGate({
  canWrite,
  state,
  children,
  inline = false,
  message,
}) {
  if (canWrite) return <>{children}</>

  const defaultMessage = state === 'suspended'
    ? 'Subscription suspended — action unavailable'
    : 'Subscribe to unlock this action'

  if (inline) {
    return (
      <div className="relative">
        <div className="opacity-40 pointer-events-none select-none">
          {children}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <Lock size={11} className="text-gray-400" />
          <span className="text-xs text-gray-400">{message || defaultMessage}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative inline-flex items-center">
      <div className="opacity-40 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center" title={message || defaultMessage}>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1 shadow-sm border border-gray-200">
          <Lock size={10} className="text-gray-400" />
          <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">
            {state === 'suspended' ? 'Suspended' : 'Subscribe'}
          </span>
        </div>
      </div>
    </div>
  )
}