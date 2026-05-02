'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Users, AlertCircle, Shield, UserCheck, Pencil,
  Check, X, Settings, Loader2, UserPlus, Mail
} from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'driver',        label: 'Driver'        },
  { value: 'fleet_manager', label: 'Fleet Manager' },
  { value: 'accountant',    label: 'Accountant'    },
  { value: 'mechanic',      label: 'Mechanic'      },
  { value: 'other',         label: 'Member'        },
]

const PERM_DEFS = [
  { key: 'can_approve_work',      label: 'Approve Work Orders',  desc: 'Can approve work on fleet vehicles'         },
  { key: 'can_manage_team',       label: 'Manage Team',          desc: 'Can add, edit, and suspend team members'   },
  { key: 'can_manage_fleet',      label: 'Manage Fleet',         desc: 'Can add/edit/assign fleet vehicles'        },
  { key: 'can_approve_estimates', label: 'Approve Estimates',    desc: 'Can approve service estimates'             },
  { key: 'can_approve_checkout',  label: 'Approve Checkout',     desc: 'Can accept or decline vehicle checkout'   },
  { key: 'can_approve_payment',   label: 'Approve Payments',     desc: 'Can confirm and approve invoice payments' },
]

export default function MemberTeamPage() {
  const { companyId } = useParams()
  const router        = useRouter()
  const supabase      = createClient()

  const [members,     setMembers]     = useState([])
  const [membership,  setMembership]  = useState(null)   // current user's membership row
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  // Edit state
  const [editingId,   setEditingId]   = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [saving,      setSaving]      = useState(false)
  const [editError,   setEditError]   = useState('')

  // Roles modal state
  const [rolesModal,  setRolesModal]  = useState(null)
  const [showInvite,  setShowInvite]  = useState(false)
  const [inviteForm,  setInviteForm]  = useState({ email: '', firstName: '', lastName: '', phone: '', role: 'driver', isAdmin: false })
  const [inviting,    setInviting]    = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess,setInviteSuccess] = useState('')
  const [rolesForm,   setRolesForm]   = useState({})
  const [savingRoles, setSavingRoles] = useState(false)
  const [rolesError,  setRolesError]  = useState('')

  useEffect(() => { fetchData() }, [companyId])

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      if (!profile) return

      // Verify membership — fetch caller's own row
      const { data: mem } = await supabase
        .from('company_users')
        .select('id, is_admin, staff_role, can_manage_team')
        .eq('user_id', profile.id).eq('company_id', companyId).eq('is_active', true)
        .maybeSingle()
      if (!mem) { setError('You are not a member of this company.'); setLoading(false); return }
      setMembership(mem)

      // Fetch all active members with permission columns
      const { data: membersData, error: membersErr } = await supabase
        .from('company_users')
        .select(`
          id, staff_role, is_admin, is_active, created_at,
          can_approve_work, can_manage_team, can_manage_fleet,
          can_approve_estimates, can_approve_checkout, can_approve_payment,
          user:user_profiles!company_users_user_id_fkey(
            id, first_name, last_name, email, phone
          )
        `)
        .eq('company_id', companyId).eq('is_active', true)
        .order('created_at', { ascending: true })

      if (membersErr) throw membersErr
      setMembers(membersData ?? [])
    } catch (err) {
      setError('Failed to load team.')
    } finally {
      setLoading(false)
    }
  }

  const isAdmin   = membership?.is_admin || membership?.staff_role === 'owner' || membership?.can_manage_team
  const canInvite = !!(membership?.can_manage_team || membership?.is_admin)

  const roleLabel = (role) =>
    ROLE_OPTIONS.find(r => r.value === role)?.label ?? (role === 'owner' ? 'Owner' : role ?? 'Member')

  // ── Edit member ──────────────────────────────────────────────────────────────
  const startEdit = (m) => {
    setEditForm({ staffRole: m.staff_role, isAdmin: m.is_admin, isActive: m.is_active })
    setEditError('')
    setEditingId(m.id)
  }
  const cancelEdit = () => { setEditingId(null); setEditForm({}) }

  const handleSaveEdit = async (memberId) => {
    setSaving(true); setEditError('')
    try {
      const { error: updErr } = await supabase
        .from('company_users')
        .update({
          staff_role: editForm.staffRole,
          is_admin:   editForm.isAdmin,
          is_active:  editForm.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memberId)
      if (updErr) throw updErr
      cancelEdit()
      fetchData()
    } catch (e) {
      setEditError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Manage Roles ─────────────────────────────────────────────────────────────
  const openRolesModal = (m) => {
    setRolesForm({
      can_approve_work:      !!m.can_approve_work,
      can_manage_team:       !!m.can_manage_team,
      can_manage_fleet:      !!m.can_manage_fleet,
      can_approve_estimates: !!m.can_approve_estimates,
      can_approve_checkout:  !!m.can_approve_checkout,
      can_approve_payment:   !!m.can_approve_payment,
    })
    setRolesError('')
    setRolesModal(m)
  }

  const handleSaveRoles = async () => {
    if (!rolesModal) return
    setSavingRoles(true); setRolesError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('update_company_member_roles', {
        p_member_id:              rolesModal.id,
        p_caller_auth_uid:        user.id,
        p_can_approve_work:       rolesForm.can_approve_work,
        p_can_manage_team:        rolesForm.can_manage_team,
        p_can_manage_fleet:       rolesForm.can_manage_fleet,
        p_can_approve_estimates:  rolesForm.can_approve_estimates,
        p_can_approve_checkout:   rolesForm.can_approve_checkout,
        p_can_approve_payment:    rolesForm.can_approve_payment,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setRolesModal(null)
      fetchData()
    } catch (e) {
      setRolesError(e.message)
    } finally {
      setSavingRoles(false)
    }
  }

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" /><p>{error}</p>
    </div>
  )

  const showActions = isAdmin   // Actions column visible to admins

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            {members.length} active member{members.length !== 1 ? 's' : ''}
            {isAdmin && <span className="ml-2 text-xs text-blue-600 font-medium">· Admin view</span>}
          </p>
        </div>
        {canInvite && (
          <button onClick={() => { setShowInvite(true); setInviteError(''); setInviteSuccess('') }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Users className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No team members found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Role & Permissions', 'Email', 'Status', ...(showActions ? ['Actions'] : [])].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(m => {
                const isEditing = editingId === m.id
                const isOwner   = m.staff_role === 'owner'
                const fullName  = [m.user?.first_name, m.user?.last_name].filter(Boolean).join(' ') || '—'

                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">

                    {/* Name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-sm font-semibold flex-shrink-0">
                          {(m.user?.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{fullName}</p>
                          {m.user?.phone && <p className="text-xs text-gray-400">{m.user.phone}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Role + badges */}
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <div className="space-y-2 min-w-[200px]">
                          <select value={editForm.staffRole}
                            onChange={e => setEditForm(f => ({ ...f, staffRole: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={editForm.isAdmin}
                              onChange={e => setEditForm(f => ({ ...f, isAdmin: e.target.checked }))}
                              className="w-3.5 h-3.5 rounded" />
                            Admin access
                          </label>
                          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={editForm.isActive}
                              onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))}
                              className="w-3.5 h-3.5 rounded" />
                            Active
                          </label>
                          {editError && <p className="text-xs text-red-600">{editError}</p>}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="text-sm text-gray-700 capitalize">{roleLabel(m.staff_role)}</span>
                            {m.is_admin && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                <Shield size={10} /> Admin
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {m.can_approve_work      && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium" title="Can approve work orders">WO</span>}
                            {m.can_approve_estimates && <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium" title="Can approve estimates">EST</span>}
                            {m.can_approve_payment   && <span className="text-xs px-1.5 py-0.5 bg-green-100  text-green-700  rounded font-medium" title="Can approve payments">PAY</span>}
                            {m.can_manage_fleet      && <span className="text-xs px-1.5 py-0.5 bg-blue-100   text-blue-700   rounded font-medium" title="Can manage fleet">FLEET</span>}
                            {m.can_manage_team       && <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium" title="Can manage team">TEAM</span>}
                            {m.can_approve_checkout  && <span className="text-xs px-1.5 py-0.5 bg-teal-100   text-teal-700   rounded font-medium" title="Can approve checkout">CHKOUT</span>}
                          </div>
                        </>
                      )}
                    </td>

                    {/* Email */}
                    <td className="px-6 py-4 text-sm text-gray-500">{m.user?.email || '—'}</td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                        <UserCheck size={11} /> Active
                      </span>
                    </td>

                    {/* Actions — admin only, not for owners */}
                    {showActions && (
                      <td className="px-6 py-4">
                        {(isOwner || m.is_admin) ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : isEditing ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleSaveEdit(m.id)} disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Save
                            </button>
                            <button onClick={cancelEdit} disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-50">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => startEdit(m)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50">
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                            <button onClick={() => openRolesModal(m)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 text-indigo-600 bg-indigo-50 rounded-lg text-xs font-medium hover:bg-indigo-100">
                              <Settings className="w-3 h-3" /> Manage Roles
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" /> Invite Member
              </h2>
              <button onClick={() => setShowInvite(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {inviteSuccess ? (
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
                <Check className="w-5 h-5 text-green-600 flex-shrink-0" /> {inviteSuccess}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">First Name</label>
                    <input type="text" value={inviteForm.firstName} onChange={e => setInviteForm(f => ({ ...f, firstName: e.target.value }))}
                      placeholder="First name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Last Name</label>
                    <input type="text" value={inviteForm.lastName} onChange={e => setInviteForm(f => ({ ...f, lastName: e.target.value }))}
                      placeholder="Last name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="member@company.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
                  <input type="tel" value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+254..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
                  <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={inviteForm.isAdmin} onChange={e => setInviteForm(f => ({ ...f, isAdmin: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-gray-700">Grant admin privileges</span>
                </label>
                {inviteError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {inviteError}
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button onClick={handleInvite} disabled={inviting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {inviting ? 'Sending…' : 'Send Invitation'}
                  </button>
                  <button onClick={() => setShowInvite(false)}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 text-gray-600">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

            {/* ── Manage Roles Modal ─────────────────────────────────────────────── */}
      {rolesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-600" /> Manage Roles
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {rolesModal.user?.first_name} {rolesModal.user?.last_name}
                  {rolesModal.staff_role && (
                    <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                      {roleLabel(rolesModal.staff_role)}
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setRolesModal(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 mb-5">
              {PERM_DEFS.map(p => (
                <label key={p.key}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    rolesForm[p.key] ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                    rolesForm[p.key] ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'
                  }`}>
                    {rolesForm[p.key] && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input type="checkbox" className="sr-only"
                    checked={!!rolesForm[p.key]}
                    onChange={e => setRolesForm(f => ({ ...f, [p.key]: e.target.checked }))} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${rolesForm[p.key] ? 'text-indigo-900' : 'text-gray-700'}`}>{p.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{p.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {rolesError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{rolesError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSaveRoles} disabled={savingRoles}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {savingRoles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {savingRoles ? 'Saving…' : 'Save Roles'}
              </button>
              <button onClick={() => setRolesModal(null)}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 text-gray-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}