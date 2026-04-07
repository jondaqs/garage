'use client'
import { useState, useEffect } from 'react'
import { UserPlus, Mail, Pencil, Check, X, Shield, User } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'driver',        label: 'Driver'        },
  { value: 'fleet_manager', label: 'Fleet Manager' },
  { value: 'accountant',    label: 'Accountant'    },
  { value: 'mechanic',      label: 'Mechanic'      },
  { value: 'other',         label: 'Other'         },
]

export default function TeamPage() {
  const [members,         setMembers]         = useState([])
  const [invitations,     setInvitations]     = useState([])
  const [loading,         setLoading]         = useState(true)
  const [showInviteForm,  setShowInviteForm]  = useState(false)
  const [inviting,        setInviting]        = useState(false)
  const [editingId,       setEditingId]       = useState(null)   // company_users.id being edited
  const [editForm,        setEditForm]        = useState({})
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState(null)

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
    } catch (err) {
      setError('Failed to load team')
    } finally {
      setLoading(false)
    }
  }

  // ── Invite ────────────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteForm.email.trim()) return
    setInviting(true)
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
        fetchTeam()
      } else {
        alert(data.error || 'Failed to send invitation')
      }
    } catch {
      alert('Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
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
        alert(data.error || 'Failed to update member')
      }
    } catch {
      alert('Failed to update member')
    } finally {
      setSaving(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const roleLabel = (role) =>
    ROLE_OPTIONS.find(r => r.value === role)?.label ?? (role || 'Member')

  const inp = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

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
          <p className="text-sm text-gray-500 mt-0.5">{members.length} active member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <UserPlus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-yellow-900 mb-3">
            Pending Invitations ({invitations.length})
          </h3>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                <span className="text-yellow-800 font-medium">{inv.email}</span>
                <span className="text-yellow-600 capitalize">· {inv.staff_role}</span>
                {inv.is_admin && (
                  <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">Admin</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
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
                    /* ── Edit mode ── */
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
                          <select
                            value={editForm.staffRole}
                            onChange={e => setEditForm(f => ({ ...f, staffRole: e.target.value }))}
                            className={inp}
                          >
                            {ROLE_OPTIONS.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                          <select
                            value={editForm.isActive ? 'active' : 'inactive'}
                            onChange={e => setEditForm(f => ({ ...f, isActive: e.target.value === 'active' }))}
                            className={inp}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.isAdmin}
                          onChange={e => setEditForm(f => ({ ...f, isAdmin: e.target.checked }))}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-gray-700">Admin access</span>
                      </label>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSave(member.id)}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── View mode ── */
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
                        </div>
                      </div>

                      {/* Don't allow editing the owner row */}
                      {member.staff_role !== 'owner' && (
                        <button
                          onClick={() => startEdit(member)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 flex-shrink-0"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Invite Team Member</h2>
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
                  className={inp} placeholder="jane@company.com" required />
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
              <button onClick={() => setShowInviteForm(false)}
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