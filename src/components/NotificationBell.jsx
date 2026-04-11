'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Bell, X, Check, CheckCheck, Building2, Store, Users,
  ClipboardList, DollarSign, CheckCircle, XCircle,
  MessageSquare, Wrench, Car, FileText
} from 'lucide-react'

// ─── Notification type → icon + colour + deep-link ──────────────────────────

const TYPE_CONFIG = {
  // Work order — customer/company side
  estimate_ready:              { icon: DollarSign,    bg: 'bg-yellow-100', iconCls: 'text-yellow-600', label: 'Estimate Ready' },
  awaiting_approval:           { icon: DollarSign,    bg: 'bg-yellow-100', iconCls: 'text-yellow-600', label: 'Needs Approval' },

  // Work order — provider side
  estimate_approved:           { icon: CheckCircle,   bg: 'bg-green-100',  iconCls: 'text-green-600',  label: 'Approved'       },
  estimate_rejected:           { icon: XCircle,       bg: 'bg-red-100',    iconCls: 'text-red-600',    label: 'Rejected'       },
  estimate_changes_requested:  { icon: MessageSquare, bg: 'bg-amber-100',  iconCls: 'text-amber-600',  label: 'Changes Needed' },

  // Invoice & payment
  invoice_issued:              { icon: FileText,     bg: 'bg-blue-100',   iconCls: 'text-blue-600',   label: 'Invoice Ready'  },
  payment_received:            { icon: DollarSign,   bg: 'bg-green-100',  iconCls: 'text-green-600',  label: 'Payment Received' },

  // Work order lifecycle
  work_order_created:          { icon: ClipboardList, bg: 'bg-blue-100',   iconCls: 'text-blue-600',   label: 'WO Created'     },
  work_order_completed:        { icon: Wrench,        bg: 'bg-green-100',  iconCls: 'text-green-600',  label: 'WO Complete'    },
  booking_accepted:            { icon: Car,           bg: 'bg-blue-100',   iconCls: 'text-blue-600',   label: 'Booking Accepted' },

  // Existing types
  company:                     { icon: Building2,     bg: 'bg-indigo-100', iconCls: 'text-indigo-600', label: 'Company'        },
  provider:                    { icon: Store,         bg: 'bg-green-100',  iconCls: 'text-green-600',  label: 'Provider'       },
  team:                        { icon: Store,         bg: 'bg-green-100',  iconCls: 'text-green-600',  label: 'Team'           },
  invitation:                  { icon: Users,         bg: 'bg-purple-100', iconCls: 'text-purple-600', label: 'Invitation'     },
  invite:                      { icon: Users,         bg: 'bg-purple-100', iconCls: 'text-purple-600', label: 'Invitation'     },
  default:                     { icon: Bell,          bg: 'bg-blue-100',   iconCls: 'text-blue-600',   label: ''               },
}

function getTypeConfig(type) {
  if (!type) return TYPE_CONFIG.default
  // Exact match first
  if (TYPE_CONFIG[type]) return TYPE_CONFIG[type]
  // Prefix match
  for (const key of Object.keys(TYPE_CONFIG)) {
    if (type.includes(key)) return TYPE_CONFIG[key]
  }
  return TYPE_CONFIG.default
}

/** Derive the deep-link URL from notification fields */
function getNotificationHref(n, isProvider, isCompany) {
  const refType = n.reference_type
  const refId   = n.reference_id
  const type    = n.notification_type || n.type || ''

  if (!refId) return null

  if (refType === 'invoice' || type.includes('invoice') || type.includes('payment')) {
    if (isProvider) return `/provider/work-orders/${refId}`  // route to WO, not separate invoice page for provider
    if (isCompany)  return `/company/work-orders/${refId}`
    return `/dashboard/invoices/${refId}`
  }
  if (refType === 'receipt' || type === 'payment_received') {
    if (isProvider) return null   // provider gets WO context already
    return null
  }
  if (refType === 'work_order' || type.includes('work_order') || type.includes('estimate')) {
    if (isProvider) return `/provider/work-orders/${refId}`
    if (isCompany)  return `/company/work-orders/${refId}`
    return `/dashboard/work-orders/${refId}`
  }
  if (refType === 'booking' || type.includes('booking')) {
    if (isProvider) return `/provider/bookings/${refId}`
    if (isCompany)  return `/company/bookings/${refId}`
    return `/dashboard/bookings/${refId}`
  }
  return null
}

// ─── Notification icon component ─────────────────────────────────────────────

function NotifIcon({ type, isRead }) {
  const cfg  = getTypeConfig(type)
  const Icon = cfg.icon
  return (
    <div className={`p-2 rounded-full flex-shrink-0 ${isRead ? 'bg-gray-100' : cfg.bg}`}>
      <Icon size={15} className={isRead ? 'text-gray-400' : cfg.iconCls} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Props:
 *  isAdmin    — fetch admin broadcast notifications too
 *  isProvider — affects deep-link routing (work orders go to /provider/...)
 *  isCompany  — affects deep-link routing (work orders go to /company/...)
 */
export default function NotificationBell({ isAdmin = false, isProvider = false, isCompany = false }) {
  const supabase = createClient()
  const router   = useRouter()

  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [isOpen, setIsOpen]               = useState(false)
  const [loading, setLoading]             = useState(true)
  const [profileId, setProfileId]         = useState(null)

  useEffect(() => { resolveProfile() }, [])

  useEffect(() => {
    if (!profileId) return
    loadNotifications()
    const channel = supabase
      .channel(`notifications-${profileId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => loadNotifications()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profileId])

  const resolveProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
    if (profile) setProfileId(profile.id)
  }

  const loadNotifications = async () => {
    if (!profileId) return
    try {
      const { data: personal } = await supabase
        .from('notifications')
        .select('*')
        .or(`recipient_user_id.eq.${profileId},user_id.eq.${profileId}`)
        .order('created_at', { ascending: false })
        .limit(25)

      let all = personal || []

      if (isAdmin) {
        const { data: broadcast } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_type', 'admin')
          .is('recipient_user_id', null)
          .is('user_id', null)
          .order('created_at', { ascending: false })
          .limit(20)

        if (broadcast) {
          const seen = new Set()
          all = [...all, ...broadcast]
            .filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 30)
        }
      }

      setNotifications(all)
      setUnreadCount(all.filter(n => !n.is_read).length)
    } catch (err) {
      console.error('Error loading notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id) => {
    await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    loadNotifications()
  }

  const markAllAsRead = async () => {
    if (!profileId) return
    const now = new Date().toISOString()
    await supabase.from('notifications')
      .update({ is_read: true, read_at: now })
      .or(`recipient_user_id.eq.${profileId},user_id.eq.${profileId}`)
      .eq('is_read', false)

    if (isAdmin) {
      const broadcastIds = notifications
        .filter(n => n.recipient_type === 'admin' && !n.recipient_user_id && !n.user_id && !n.is_read)
        .map(n => n.id)
      if (broadcastIds.length > 0) {
        await supabase.from('notifications')
          .update({ is_read: true, read_at: now })
          .in('id', broadcastIds)
      }
    }
    loadNotifications()
  }

  const deleteNotification = async (id) => {
    await supabase.from('notifications').delete().eq('id', id)
    loadNotifications()
  }

  const handleNotifClick = async (n) => {
    if (!n.is_read) await markAsRead(n.id)
    const href = getNotificationHref(n, isProvider, isCompany)
    if (href) {
      setIsOpen(false)
      router.push(href)
    }
  }

  const formatTime = (ts) => {
    const diffMs   = Date.now() - new Date(ts)
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1)  return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24)  return `${diffHrs}h ago`
    return new Date(ts).toLocaleDateString()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={22} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-[520px] overflow-hidden flex flex-col">

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Bell size={36} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((n) => {
                    const type = n.notification_type || n.type
                    const href = getNotificationHref(n, isProvider, isCompany)
                    const isClickable = !!href
                    return (
                      <div
                        key={n.id}
                        onClick={() => isClickable && handleNotifClick(n)}
                        className={`px-4 py-3 transition-colors ${
                          !n.is_read ? 'bg-blue-50/60' : ''
                        } ${isClickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <NotifIcon type={type} isRead={n.is_read} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                              {n.title}
                            </p>
                            {n.message && (
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
                                {n.message}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-gray-400">{formatTime(n.created_at)}</p>
                              {isClickable && (
                                <span className="text-xs text-blue-500 font-medium">View →</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!n.is_read && (
                              <button
                                onClick={e => { e.stopPropagation(); markAsRead(n.id) }}
                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                                title="Mark as read"
                              >
                                <Check size={13} className="text-gray-500" />
                              </button>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); deleteNotification(n.id) }}
                              className="p-1 hover:bg-red-100 rounded transition-colors"
                              title="Delete"
                            >
                              <X size={13} className="text-red-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}