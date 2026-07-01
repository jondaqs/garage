// src/app/admin/users/page.js
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Users, MoreVertical, ShieldOff, ShieldCheck, Power, PowerOff } from 'lucide-react'
import Pagination from '@/components/admin/Pagination'
import { banUser, unbanUser } from '@/lib/admin/banUser'

const PAGE_SIZE = 20

/* ── Fixed-position action menu ──────────────────────────────────────────── */
function ActionMenu({ actions, onAction, entityId, entityName, processing }) {
  const [open, setOpen]   = useState(false)
  const [pos, setPos]     = useState({ top: 0, left: 0 })
  const btnRef            = useRef(null)
  const menuRef           = useRef(null)

  const toggle = useCallback(() => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.right })
    }
    setOpen(o => !o)
  }, [open])

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('mousedown', (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) close()
    })
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (actions.length === 0) return null

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={processing}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
          className="w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] py-1"
        >
          {actions.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.key}
                onClick={() => { setOpen(false); onAction(entityId, a.key, entityName) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${a.cls}`}
              >
                <Icon size={14} /> {a.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function AdminUsersPage() {
  const supabase = createClient()
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [page,       setPage]       = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalAll,   setTotalAll]   = useState(0)
  const [processing, setProcessing] = useState(null)

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => { setPage(1) }, [debouncedSearch])
  useEffect(() => { loadUsers() }, [page, debouncedSearch])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const from = (page - 1) * PAGE_SIZE

      // PII-safe search via server-side RPC (decrypts + filters on server)
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        'admin_search_users',
        {
          p_search: debouncedSearch || null,
          p_limit: PAGE_SIZE,
          p_offset: from,
        }
      )

      if (rpcErr) throw rpcErr
      if (!rpcResult?.success) throw new Error(rpcResult?.error || 'Search failed')

      const userRows = rpcResult.rows || []
      const count = rpcResult.total || 0

      // Fetch roles for the returned user IDs
      const userIds = userRows.map(u => u.id)
      let rolesMap = {}
      if (userIds.length > 0) {
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('user_id, role:user_roles_lookup(code, display_name)')
          .in('user_id', userIds)

        if (rolesData) {
          rolesMap = rolesData.reduce((acc, r) => {
            if (!acc[r.user_id]) acc[r.user_id] = []
            acc[r.user_id].push(r.role)
            return acc
          }, {})
        }
      }

      // Merge roles into user rows (matches the shape the UI expects)
      const data = userRows.map(u => ({
        ...u,
        user_roles: (rolesMap[u.id] || []).map(r => ({ role: r }))
      }))

      setUsers(data)
      setTotalCount(count)
      if (page === 1 && !debouncedSearch) setTotalAll(count)
    } catch (err) {
      console.error('Error loading users:')
    } finally {
      setLoading(false)
    }
  }

  const getRoles = (u) =>
    u.user_roles?.map(ur => ur.role?.display_name).filter(Boolean).join(', ') || 'User'

  const handleAction = async (userId, action, userName) => {
    const labels = {
      suspend:    `Suspend ${userName}?`,
      unsuspend:  `Unsuspend ${userName}?`,
      deactivate: `Deactivate ${userName}? They will no longer be able to log in.`,
      activate:   `Activate ${userName}?`,
    }
    if (!confirm(labels[action])) return

    setProcessing(userId)
    try {
      const { data, error } = await supabase.rpc('admin_update_user_status', {
        p_user_id: userId,
        p_action:  action,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error)

      // Auth-level ban/unban — prevents JWT refresh (belt-and-suspenders)
      const user = users.find(u => u.id === userId)
      if (user?.auth_user_id) {
        if (action === 'suspend' || action === 'deactivate') {
          await banUser(user.auth_user_id)
        } else {
          await unbanUser(user.auth_user_id)
        }
      }

      await loadUsers()
    } catch (err) {
      console.error(`${action} failed:`)
      alert(`Failed to ${action} user: ${err.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const getActions = (u) => {
    const actions = []
    if (u.is_suspended) {
      actions.push({ key: 'unsuspend', label: 'Unsuspend', icon: ShieldCheck, cls: 'text-green-700 hover:bg-green-50' })
    } else if (u.is_active) {
      actions.push({ key: 'suspend',    label: 'Suspend',    icon: ShieldOff, cls: 'text-yellow-700 hover:bg-yellow-50' })
      actions.push({ key: 'deactivate', label: 'Deactivate', icon: PowerOff,  cls: 'text-red-700 hover:bg-red-50' })
    } else {
      actions.push({ key: 'activate', label: 'Activate', icon: Power, cls: 'text-green-700 hover:bg-green-50' })
    }
    return actions
  }

  if (loading && page === 1 && !users.length) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-gray-500 mt-1">{totalAll || totalCount} registered users</p>
      </div>

      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search name, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Phone</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roles</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Joined</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    No users found
                  </td>
                </tr>
              ) : (
                users.map(u => {
                  const name    = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
                  const actions = getActions(u)

                  return (
                    <tr key={u.id} className={`hover:bg-gray-50 ${processing === u.id ? 'opacity-50 pointer-events-none' : ''}`}>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                            {(u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900 truncate max-w-[150px]">{name}</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-600 truncate max-w-[180px]">{u.email || '—'}</td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-600 hidden md:table-cell">{u.phone || '—'}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className="text-xs text-gray-500">{getRoles(u)}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        {u.is_suspended ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Suspended</span>
                        ) : u.is_active ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <ActionMenu
                          actions={actions}
                          onAction={handleAction}
                          entityId={u.id}
                          entityName={name}
                          processing={processing === u.id}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
      </div>
    </div>
  )
}