'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, Upload, Mail, Pencil, Check, X, Shield, Loader2, AlertCircle, Clock, Ban, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import useOwnerCompanyAccess from '@/hooks/useOwnerCompanyAccess'
import WriteGate from '@/components/WriteGate'
import CompanyAccessBanner from '@/components/CompanyAccessBanner'

const ROLE_OPTIONS = [
  { value: 'driver',        label: 'Driver'        },
  { value: 'fleet_manager', label: 'Fleet Manager' },
  { value: 'accountant',    label: 'Accountant'    },
  { value: 'mechanic',      label: 'Mechanic'      },
  { value: 'other',         label: 'Other'         },
]

export default function TeamPage() {
  const router = useRouter()
  const [members,        setMembers]        = useState([])
  const ownerAccess = useOwnerCompanyAccess()
  const [invitations,    setInvitations]    = useState([])
  const [loading,        setLoading]        = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviting,       setInviting]       = useState(false)
  const [editingId,      setEditingId]      = useState(null)
  const [editForm,       setEditForm]       = useState({})
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState(null)
  const [success,        setSuccess]        = useState(null)
  const [cancellingId,   setCancellingId]   = useState(null)  // invite id being cancelled
  const [confirmCancel,  setConfirmCancel]  = useState(null)  // invite id awaiting confirm
  const [rolesModal,     setRolesModal]     = useState(null)
  const [rolesForm,      setRolesForm]      = useState({})
  const [savingRoles,    setSavingRoles]    = useState(false)
  const [rolesError,     setRolesError]     = useState('')

  const [inviteForm, setInviteForm] = useState({
    email: '', firstName: '', lastName: '', staffRole: 'driver', isAdmin: false,
  })

  useEffect(() => { fetchTeam() }, [])

  const fetchTeam = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/company/team/members')
      const data = await res.json()
      if (data.success) {
        setMembers(data.members || [])
        setInvitations(data.pendingInvitations || [])
      } else {
        setError(data.error || 'Failed to load team')
      }
    } catch {
      setError('Failed to load team')
    } finally {
      setLoading(false)
    }
  }

  // ── Invite ────────────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteForm.email.trim()) return
    setInviting(true)
    setError(null)
    try {
      const res  = await fetch('/api/company/team/invite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(inviteForm),
      })
      const data = await res.json()
      if (data.success) {
        setShowInviteForm(false)
        setInviteForm({ email: '', firstName: '', lastName: '', staffRole: 'driver', isAdmin: false })
        setSuccess(`Invitation sent to ${inviteForm.email}`)
        fetchTeam()
        setTimeout(() => setSuccess(null), 4000)
      } else {
        setError(data.error || 'Failed to send invitation')
      }
    } catch {
      setError('Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  // ── Cancel invitation ─────────────────────────────────────────────────────
  const handleCancelInvitation = async (inviteId) => {
    setCancellingId(inviteId)
    setError(null)
    try {
      const res  = await fetch(`/api/company/team/invite/${inviteId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to cancel')
      setSuccess(data.message || 'Invitation cancelled')
      setConfirmCancel(null)
      setInvitations(prev => prev.filter(i => i.id !== inviteId))
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setCancellingId(null)
    }
  }

  // ── Edit member ───────────────────────────────────────────────────────────
  const startEdit = (member) => {
    setEditingId(member.id)
    setEditForm({ staffRole: member.staff_role, isAdmin: member.is_admin, isActive: member.is_active })
  }

  const cancelEdit = () => { setEditingId(null); setEditForm({}) }

  const handleSave = async (memberId) => {
    setSaving(true)
    try {
      const res  = await fetch('/api/company/team/members', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          memberId,
          staffRole: editForm.staffRole,
          isAdmin:   editForm.isAdmin,
          isActive:  editForm.isActive,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEditingId(null)
        fetchTeam()
      } else {
        setError(data.error || 'Failed to update member')
      }
    } catch {
      setError('Failed to update member')
    } finally {
      setSaving(false)
    }
  }

  const supabase = createClient()

  const PERM_DEFS = [
    { key: 'can_approve_work',      label: 'Approve Work Orders',   desc: 'Can approve work to proceed on fleet vehicles'   },
    { key: 'can_manage_team',       label: 'Manage Team',           desc: 'Can add, edit, and suspend team members'         },
    { key: 'can_manage_fleet',      label: 'Manage Fleet',          desc: 'Can add/edit/assign fleet vehicles'              },
    { key: 'can_approve_estimates', label: 'Approve Estimates',     desc: 'Can approve service estimates from providers'    },
    { key: 'can_approve_checkout',  label: 'Approve Checkout',      desc: 'Can accept or decline vehicle checkout'          },
    { key: 'can_approve_payment',   label: 'Approve Payments',      desc: 'Can confirm and approve invoice payments'        },
    { key: 'can_chat',              label: 'Chat with Providers',   desc: 'Can message service providers via the chat'      },
  ]

  const roleLabel = (role) =>
    ROLE_OPTIONS.find(r => r.value === role)?.label ?? (role || 'Member')

  const openRolesModal = (member) => {
    setRolesForm({
      can_approve_work:      !!member.can_approve_work,
      can_manage_team:       !!member.can_manage_team,
      can_manage_fleet:      !!member.can_manage_fleet,
      can_approve_estimates: !!member.can_approve_estimates,
      can_approve_checkout:  !!member.can_approve_checkout,
      can_approve_payment:   !!member.can_approve_payment,
      can_chat:              !!member.can_chat,
    })
    setRolesError('')
    setRolesModal(member)
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
        p_can_chat:               rolesForm.can_chat,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      setRolesModal(null)
      fetchTeam()
    } catch (e) {
      setRolesError(e.message)
    } finally {
      setSavingRoles(false)
    }
  }

  const inp = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  const formatDate = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  if (loading) return (
    <div className="flex justify-center items-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {members.length} active member{members.length !== 1 ? 's' : ''}
            {invitations.length > 0 && ` · ${invitations.length} pending invitation${invitations.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <WriteGate canWrite={ownerAccess.canWrite} state={ownerAccess.state}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setError(null); setShowInviteForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <UserPlus className="w-4 h-4" /> Invite Member
          </button>
          <button
            onClick={() => router.push('/company/team/invite')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            <Upload className="w-4 h-4" /> Bulk Upload
          </button>
        </div>
        </WriteGate>
      </div>

      {!ownerAccess.loading && <CompanyAccessBanner {...ownerAccess} companyId={ownerAccess.companyId} />}

      {/* Feedback */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2 text-sm text-green-700">
          <Check className="w-4 h-4 shrink-0 mt-0.5" /> {success}
        </div>
      )}

      {/* ── Pending Invitations ──────────────────────────────────────────── */}
      {invitations.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3.5 border-b border-yellow-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <h3 className="text-sm font-semibold text-yellow-900">
              Pending Invitations ({invitations.length})
            </h3>
          </div>

          <div className="divide-y divide-yellow-100">
            {invitations.map(inv => {
              const isCancelling = cancellingId === inv.id
              const isConfirming = confirmCancel === inv.id

              return (
                <div key={inv.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Invitation info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 bg-yellow-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-yellow-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-yellow-900">
                            {inv.first_name || inv.last_name
                              ? `${inv.first_name || ''} ${inv.last_name || ''}`.trim()
                              : inv.email}
                          </p>
                          {inv.is_admin && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-medium rounded-full">
                              <Shield className="w-2.5 h-2.5" /> Admin
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-yellow-700 truncate">{inv.email}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-xs text-yellow-600 capitalize">
                            {roleLabel(inv.staff_role)}
                          </span>
                          {inv.created_at && (
                            <span className="text-xs text-yellow-500">
                              · Sent {formatDate(inv.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Cancel button / confirm flow */}
                    <div className="flex-shrink-0">
                      {!isConfirming ? (
                        <button
                          onClick={() => setConfirmCancel(inv.id)}
                          disabled={isCancelling}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-yellow-300 bg-white text-yellow-700 rounded-lg text-xs font-medium hover:bg-yellow-100 hover:border-yellow-400 transition-colors disabled:opacity-50"
                        >
                          <Ban className="w-3 h-3" /> Cancel Invite
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">Cancel this invitation?</span>
                          <button
                            onClick={() => handleCancelInvitation(inv.id)}
                            disabled={isCancelling}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            {isCancelling
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <X className="w-3 h-3" />
                            }
                            {isCancelling ? 'Cancelling…' : 'Yes, cancel'}
                          </button>
                          <button
                            onClick={() => setConfirmCancel(null)}
                            disabled={isCancelling}
                            className="px-2.5 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50"
                          >
                            Keep
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Team Members ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Members</h2>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No team members yet. Invite your first member above.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {members.map(member => {
              const isEditing = editingId === member.id
              const name = [member.user?.first_name, member.user?.last_name]
                .filter(Boolean).join(' ') || '—'
              const email = member.user?.email || '—'

              return (
                <div key={member.id} className="px-6 py-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-sm font-semibold flex-shrink-0">
                          {(member.user?.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{name}</p>
                          <p className="text-xs text-gray-400">{email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                          <select value={editForm.staffRole}
                            onChange={e => setEditForm(f => ({ ...f, staffRole: e.target.value }))}
                            className={inp}>
                            {ROLE_OPTIONS.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                          <select value={editForm.isActive ? 'active' : 'inactive'}
                            onChange={e => setEditForm(f => ({ ...f, isActive: e.target.value === 'active' }))}
                            className={inp}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={editForm.isAdmin}
                          onChange={e => setEditForm(f => ({ ...f, isAdmin: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300" />
                        <span className="text-gray-700">Admin access</span>
                      </label>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => handleSave(member.id)} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                          <Check className="w-3.5 h-3.5" />
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={cancelEdit} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-sm font-semibold flex-shrink-0">
                          {(member.user?.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">{name}</p>
                            {member.is_admin && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                <Shield className="w-2.5 h-2.5" /> Admin
                              </span>
                            )}
                            {!member.is_active && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">Inactive</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{email}</p>
                          <p className="text-xs text-gray-400 capitalize mt-0.5">{roleLabel(member.staff_role)}</p>
                          {/* Permission badges */}
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {member.can_approve_work && (
                              <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium" title="Can approve work orders">WO</span>
                            )}
                            {member.can_approve_estimates && (
                              <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium" title="Can approve estimates">EST</span>
                            )}
                            {member.can_approve_payment && (
                              <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium" title="Can approve payments">PAY</span>
                            )}
                            {member.can_manage_fleet && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium" title="Can manage fleet">FLEET</span>
                            )}
                            {member.can_manage_team && (
                              <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium" title="Can manage team">TEAM</span>
                            )}
                            {member.can_approve_checkout && (
                              <span className="text-xs px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium" title="Can approve checkout">CHKOUT</span>
                            )}
                            {member.can_chat && (
                              <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium" title="Can chat with providers">CHAT</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {member.staff_role !== 'owner' && (
                        <WriteGate canWrite={ownerAccess.canWrite} state={ownerAccess.state} inline>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => startEdit(member)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50">
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button onClick={() => openRolesModal(member)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 text-indigo-600 bg-indigo-50 rounded-lg text-xs font-medium hover:bg-indigo-100">
                            <Settings className="w-3 h-3" /> Manage Roles
                          </button>
                        </div>
                        </WriteGate>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>


      {/* ── Manage Roles Modal ─────────────────────────────────────────── */}
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

      {/* ── Invite Modal ─────────────────────────────────────────────────── */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Invite Team Member</h2>

            {/* Error inside modal */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                  <input type="text" value={inviteForm.firstName}
                    onChange={e => setInviteForm(f => ({ ...f, firstName: e.target.value }))}
                    className={inp} placeholder="Jane" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                  <input type="text" value={inviteForm.lastName}
                    onChange={e => setInviteForm(f => ({ ...f, lastName: e.target.value }))}
                    className={inp} placeholder="Doe" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email Address *</label>
                <input type="email" value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  className={inp} placeholder="jane@company.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={inviteForm.staffRole}
                  onChange={e => setInviteForm(f => ({ ...f, staffRole: e.target.value }))}
                  className={inp}>
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={inviteForm.isAdmin}
                  onChange={e => setInviteForm(f => ({ ...f, isAdmin: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300" />
                <span className="text-gray-700">Grant admin access</span>
              </label>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleInvite} disabled={inviting || !inviteForm.email.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {inviting ? 'Sending…' : 'Send Invitation'}
              </button>
              <button onClick={() => { setShowInviteForm(false); setError(null) }}
                className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}