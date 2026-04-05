'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, X, Check, CheckCheck, Building2, Store, Users } from 'lucide-react'

// Notification type → icon + colour
function NotificationIcon({ type, isRead }) {
  const base = 'p-2 rounded-full flex-shrink-0'
  const active = isRead ? 'bg-gray-100' : 'bg-blue-100'
  const iconCls = isRead ? 'text-gray-500' : 'text-blue-600'

  if (type?.includes('company')) {
    return (
      <div className={`${base} ${isRead ? 'bg-gray-100' : 'bg-indigo-100'}`}>
        <Building2 size={16} className={isRead ? 'text-gray-500' : 'text-indigo-600'} />
      </div>
    )
  }
  if (type?.includes('provider') || type?.includes('team')) {
    return (
      <div className={`${base} ${isRead ? 'bg-gray-100' : 'bg-green-100'}`}>
        <Store size={16} className={isRead ? 'text-gray-500' : 'text-green-600'} />
      </div>
    )
  }
  if (type?.includes('invitation') || type?.includes('invite')) {
    return (
      <div className={`${base} ${isRead ? 'bg-gray-100' : 'bg-purple-100'}`}>
        <Users size={16} className={isRead ? 'text-gray-500' : 'text-purple-600'} />
      </div>
    )
  }
  return (
    <div className={`${base} ${active}`}>
      <Bell size={16} className={iconCls} />
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────
// isAdmin: boolean — when true, also fetches recipient_type='admin' notifications
export default function NotificationBell({ isAdmin = false }) {
  const supabase = createClient()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileId, setProfileId] = useState(null)

  useEffect(() => {
    resolveProfile()
  }, [])

  useEffect(() => {
    if (profileId) {
      loadNotifications()
      const channel = supabase
        .channel(`notifications-${profileId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
          loadNotifications()
        })
        .subscribe()
      return () => supabase.removeChannel(channel)
    }
  }, [profileId])

  const resolveProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (profile) setProfileId(profile.id)
  }

  const loadNotifications = async () => {
    if (!profileId) return
    try {
      // Personal notifications — addressed directly to this user
      // (covers: recipient_user_id OR user_id matching this profile)
      const { data: personal } = await supabase
        .from('notifications')
        .select('*')
        .or(`recipient_user_id.eq.${profileId},user_id.eq.${profileId}`)
        .order('created_at', { ascending: false })
        .limit(20)

      let all = personal || []

      // Admin broadcast notifications — recipient_type='admin', no specific user_id
      // Only fetched when the bell is rendered in an admin context
      if (isAdmin) {
        const { data: adminBroadcast } = await supabase
          .from('notifications')
          .select('*')
          .eq('recipient_type', 'admin')
          .is('recipient_user_id', null)
          .is('user_id', null)
          .order('created_at', { ascending: false })
          .limit(20)

        if (adminBroadcast) {
          // Merge and deduplicate by id, sort newest first
          const merged = [...all, ...adminBroadcast]
          const seen = new Set()
          all = merged
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
    // Target by id — works for both personal and broadcast notifications.
    // Requires the notifications_update RLS policy to include is_user_admin()
    // for broadcast rows (recipient_user_id IS NULL).
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) console.error('markAsRead error:', error)
    else loadNotifications()
  }

  const markAllAsRead = async () => {
    if (!profileId) return
    const now = new Date().toISOString()

    // Personal notifications — matched by recipient_user_id or user_id
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .or(`recipient_user_id.eq.${profileId},user_id.eq.${profileId}`)
      .eq('is_read', false)

    // Broadcast admin notifications — no user binding, must target by id.
    // The notifications_update RLS policy allows this via is_user_admin().
    if (isAdmin) {
      const broadcastIds = notifications
        .filter(n => n.recipient_type === 'admin' && !n.recipient_user_id && !n.user_id && !n.is_read)
        .map(n => n.id)
      if (broadcastIds.length > 0) {
        const { error } = await supabase
          .from('notifications')
          .update({ is_read: true, read_at: now })
          .in('id', broadcastIds)
        if (error) console.error('markAllAsRead (broadcast) error:', error)
      }
    }
    loadNotifications()
  }

  const deleteNotification = async (id) => {
    // Target by id — works for personal and broadcast rows.
    // Requires the notifications_delete RLS policy to include is_user_admin().
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
    if (error) console.error('deleteNotification error:', error)
    else loadNotifications()
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    return d.toLocaleDateString()
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
                  <Bell size={40} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/60' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <NotificationIcon type={n.notification_type || n.type} isRead={n.is_read} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
                              {n.message}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{formatTime(n.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!n.is_read && (
                            <button
                              onClick={() => markAsRead(n.id)}
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                              title="Mark as read"
                            >
                              <Check size={14} className="text-gray-500" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteNotification(n.id)}
                            className="p-1 hover:bg-red-100 rounded transition-colors"
                            title="Delete"
                          >
                            <X size={14} className="text-red-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}