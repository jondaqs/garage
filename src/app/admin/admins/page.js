// src/app/admin/admins/page.js
'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Shield, UserPlus, Search, MoreVertical, UserMinus,
  ArrowUpCircle, CheckCircle, AlertCircle, X, Loader2,
} from 'lucide-react'
import { ADMIN_ROLES, ASSIGNABLE_ROLES, ADMIN_ROLE_CODES, getHighestAdminRole } from '@/lib/admin/permissions'

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

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (actions.length === 0) return null

  return (
    <>
      <button ref={btnRef} onClick={toggle} disabled={processing}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
          className="w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] py-1">
          {actions.map(a => {
            const Icon = a.icon
            return (
              <button key={a.key}
                onClick={() => { setOpen(false); onAction(entityId, a.key, entityName) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${a.cls}`}>
                <Icon size={14} /> {a.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function AdminManagementPage() {
  const supabase = createClient()

  const [admins,       setAdmins]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [processing,   setProcessing]   = useState(null)
  const [currentRole,  setCurrentRole]  = useState(null) // caller's highest admin role
  const [showInvite,   setShowInvite]   = useState(false)
  const [inviteEmail,  setInviteEmail]  = useState('')
  const [inviteRole,   setInviteRole]   = useState('admin')
  const [inviting,     setInviting]     = useState(false)
  const [inviteError,  setInviteError]  = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')

  useEffect(() => { loadAdmins() }, [])

  const loadAdmins = async () => {
    setLoading(true)
    try {
      // Get current user's role
      const { data: { user } } = await supabase.auth.getUser()
      const { data: myProfile } = await supabase
        .from('user_profiles')
        .select('id, user_roles(role:user_roles_lookup(code))')
        .eq('auth_user_id', user.id)
        .single()

      const myCodes = myProfile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
      setCurrentRole(getHighestAdminRole(myCodes))

      // Get all admin users
      const { data, error: fetchErr } = await supabase
        .from('user_profiles')
        .select(`
          id, first_name, last_name, email, phone, created_at, is_active, is_suspended,
          user_roles(role:user_roles_lookup(code, display_name))
        `)
        .order('created_at', { ascending: true })

      if (fetchErr) throw fetchErr

      // Filter to only users with at least one admin role
      const adminUsers = (data || []).filter(u =>
        u.user_roles?.some(ur => ADMIN_ROLE_CODES.includes(ur.role?.code))
      )
      setAdmins(adminUsers)
    } catch (err) {
      console.error('Error loading admins:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getAdminRoleCode = (u) => {
    const codes = u.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
    return getHighestAdminRole(codes)
  }

  const isPlatformAdmin = currentRole === 'platform_admin'

  // ── Promote (invite) ──────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteEmail.trim()) { setInviteError('Enter an email address'); return }
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_promote_user', {
        p_email:      inviteEmail.trim(),
        p_admin_role: inviteRole,
      })
      if (rpcErr) throw rpcErr
      if (data && !data.success) throw new Error(data.error)
      setInviteSuccess(`${data.user_name || inviteEmail} promoted to ${ADMIN_ROLES[inviteRole]?.label || inviteRole}`)
      setInviteEmail('')
      await loadAdmins()
      setTimeout(() => setInviteSuccess(''), 5000)
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  // ── Change role ───────────────────────────────────────────────────────────
  const handleChangeRole = async (userId, newRole, userName) => {
    const user = admins.find(u => u.id === userId)
    const email = user?.email
    if (!email) return

    if (!confirm(`Change ${userName}'s role to ${ADMIN_ROLES[newRole]?.label}?`)) return

    setProcessing(userId)
    setError('')
    setSuccess('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_promote_user', {
        p_email:      email,
        p_admin_role: newRole,
      })
      if (rpcErr) throw rpcErr
      if (data && !data.success) throw new Error(data.error)
      setSuccess(`${userName} is now ${ADMIN_ROLES[newRole]?.label}`)
      await loadAdmins()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessing(null)
    }
  }

  // ── Demote ────────────────────────────────────────────────────────────────
  const handleDemote = async (userId, userName) => {
    if (!confirm(`Remove all admin privileges from ${userName}? They will become a regular user.`)) return
    setProcessing(userId)
    setError('')
    setSuccess('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_demote_user', {
        p_user_id: userId,
      })
      if (rpcErr) throw rpcErr
      if (data && !data.success) throw new Error(data.error)
      setSuccess(`${userName} has been removed from admin.`)
      await loadAdmins()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessing(null)
    }
  }

  // ── Actions per row ───────────────────────────────────────────────────────
  const getActions = (u) => {
    if (!isPlatformAdmin) return [] // only platform_admin sees actions
    const roleCode = getAdminRoleCode(u)
    if (roleCode === 'platform_admin') return [] // system admin is protected

    const actions = []

    // Role change options (show roles they DON'T currently have)
    for (const code of ASSIGNABLE_ROLES) {
      if (code !== roleCode) {
        actions.push({
          key: `role_${code}`,
          label: `Change to ${ADMIN_ROLES[code]?.label}`,
          icon: ArrowUpCircle,
          cls: 'text-blue-700 hover:bg-blue-50',
        })
      }
    }

    // Demote (remove from admin entirely)
    actions.push({
      key: 'demote',
      label: 'Remove from admin',
      icon: UserMinus,
      cls: 'text-red-700 hover:bg-red-50',
    })

    return actions
  }

  const handleAction = (userId, actionKey, userName) => {
    if (actionKey === 'demote') {
      handleDemote(userId, userName)
    } else if (actionKey.startsWith('role_')) {
      const newRole = actionKey.replace('role_', '')
      handleChangeRole(userId, newRole, userName)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
          <p className="text-gray-500 mt-1">{admins.length} platform administrator{admins.length === 1 ? '' : 's'}</p>
        </div>
        {isPlatformAdmin && (
          <button onClick={() => { setShowInvite(true); setInviteError(''); setInviteSuccess('') }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium self-start sm:self-auto">
            <UserPlus size={16} /> Invite Admin
          </button>
        )}
      </div>

      {!isPlatformAdmin && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <Shield size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            Only the System Administrator can invite, promote, or demote admin users.
            You are viewing the admin roster in read-only mode.
          </p>
        </div>
      )}

      {/* Status messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-sm">
          <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Invite Existing User as Admin</h2>
            <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-4">
            The user must already have an account on the platform. Enter their registered email and select an admin role.
          </p>

          {inviteError && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div className="mb-3 p-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {inviteSuccess}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="email" value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>

            <select value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[160px]">
              {ASSIGNABLE_ROLES.map(code => (
                <option key={code} value={code}>{ADMIN_ROLES[code]?.label}</option>
              ))}
            </select>

            <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium whitespace-nowrap">
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {inviting ? 'Promoting…' : 'Promote'}
            </button>
          </div>

          {/* Role descriptions */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ASSIGNABLE_ROLES.map(code => {
              const role = ADMIN_ROLES[code]
              return (
                <div key={code}
                  className={`p-2.5 rounded-lg border text-xs ${inviteRole === code ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                  <span className={`inline-block px-1.5 py-0.5 rounded font-medium mb-1 ${role.color}`}>
                    {role.label}
                  </span>
                  <p className="text-gray-600">{role.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Admins table */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-[700px] w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Added</th>
                {isPlatformAdmin && (
                  <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase w-20">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={isPlatformAdmin ? 6 : 5} className="px-6 py-12 text-center text-gray-400">
                    <Shield className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                    No admins found
                  </td>
                </tr>
              ) : (
                admins.map(u => {
                  const roleCode = getAdminRoleCode(u)
                  const role     = ADMIN_ROLES[roleCode] || { label: roleCode, color: 'bg-gray-100 text-gray-700' }
                  const name     = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
                  const actions  = getActions(u)
                  const isSystem = roleCode === 'platform_admin'

                  return (
                    <tr key={u.id} className={`hover:bg-gray-50 ${processing === u.id ? 'opacity-50 pointer-events-none' : ''}`}>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSystem ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-600'
                          }`}>
                            {(u.first_name?.[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-900">{name}</span>
                            {isSystem && (
                              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 rounded">
                                <Shield size={10} /> Protected
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-600 truncate max-w-[200px]">{u.email || '—'}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${role.color}`}>
                          {role.label}
                        </span>
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
                      {isPlatformAdmin && (
                        <td className="px-4 sm:px-6 py-4 text-right">
                          <ActionMenu
                            actions={actions}
                            onAction={handleAction}
                            entityId={u.id}
                            entityName={name}
                            processing={processing === u.id}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role legend */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Role Reference</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.values(ADMIN_ROLES).map(role => (
            <div key={role.code} className="flex items-start gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap mt-0.5 ${role.color}`}>
                {role.label}
              </span>
              <p className="text-xs text-gray-500">{role.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}