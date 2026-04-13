'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { 
  Users, UserPlus, Search, Mail, Shield, Award, 
  Clock, Check, X, AlertCircle, MoreVertical, Trash2,
  Settings as SettingsIcon
} from 'lucide-react'

export default function ProviderTeamPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [searchEmail, setSearchEmail] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  
  const [inviteForm, setInviteForm] = useState({
    role: 'mechanic',
    specialization: '',
    experience_years: 0
  })

  const [editingMember, setEditingMember]   = useState(null)
  const [editMemberForm, setEditMemberForm] = useState({})
  const [savingMember, setSavingMember]     = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // Get service provider
      const { data: providerData } = await supabase
        .from('service_providers')
        .select('*')
        .eq('owner_user_id', profile.id)
        .single()

      if (!providerData) {
        router.push('/dashboard')
        return
      }

      setProvider(providerData)

      // Load team members using the new approach
      await loadTeamMembers(user.id)
      
      // Load invitations
      await loadInvitations(providerData.id)

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTeamMembers = async (authUserId) => {
    try {
      // Get mechanics data first
      const { data: mechanicsData, error: mechanicsError } = await supabase
        .from('mechanics')
        .select('*')
        .eq('service_provider_id', provider?.id || (await getProviderId()))
        .order('created_at', { ascending: false })

      if (mechanicsError) {
        console.error('Error loading mechanics:', mechanicsError)
        return
      }

      if (!mechanicsData || mechanicsData.length === 0) {
        setTeamMembers([])
        return
      }

      // Use the security definer function to get user profiles
      const { data: userProfiles, error: profilesError } = await supabase
        .rpc('get_team_member_profiles', {
          provider_owner_auth_id: authUserId
        })

      if (profilesError) {
        console.error('Error loading profiles via function:', profilesError)
        // Fallback: show mechanics with "Unknown User"
        setTeamMembers(mechanicsData.map(m => ({
          ...m,
          user: {
            id: m.user_id,
            first_name: 'Unknown',
            last_name: 'User',
            phone: null,
            email: null
          }
        })))
        return
      }

      // Combine mechanics with user profiles
      const membersWithUsers = mechanicsData.map(mechanic => {
        const userProfile = userProfiles?.find(up => up.user_id_from_mechanics === mechanic.user_id)
        
        return {
          ...mechanic,
          user: userProfile ? {
            id: userProfile.id,
            first_name: userProfile.first_name,
            last_name: userProfile.last_name,
            phone: userProfile.phone,
            email: userProfile.email
          } : {
            id: mechanic.user_id,
            first_name: 'Unknown',
            last_name: 'User',
            phone: null,
            email: null
          }
        }
      })

      setTeamMembers(membersWithUsers)

    } catch (error) {
      console.error('Error in loadTeamMembers:', error)
      setTeamMembers([])
    }
  }

  const getProviderId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    
    const { data: providerData } = await supabase
      .from('service_providers')
      .select('id')
      .eq('owner_user_id', profile.id)
      .single()
    
    return providerData?.id
  }

  const loadInvitations = async (providerId) => {
    const { data, error } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('service_provider_id', providerId)
      .in('status', ['pending', 'accepted', 'rejected'])
      .order('invited_at', { ascending: false })

    if (error) {
      console.error('Error loading invitations:', error)
      return
    }

    setInvitations(data || [])
  }

  const handleInviteUser = (user) => {
    setSelectedUser(user)
    setShowInviteModal(true)
  }

  const submitInvitation = async () => {
    if (!selectedUser) return

    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedUser.email,
          ...inviteForm
        })
      })

      const data = await response.json()

      if (response.ok) {
        alert('Invitation sent successfully!')
        setShowInviteModal(false)
        setSelectedUser(null)
        setSearchEmail('')
        setInviteForm({ role: 'mechanic', specialization: '', experience_years: 0 })
        await loadInvitations(provider.id)
      } else {
        alert(data.error || 'Failed to send invitation')
      }
    } catch (error) {
      console.error('Invitation error:', error)
      alert('Failed to send invitation')
    }
  }

  const cancelInvitation = async (invitationId) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return

    try {
      const { error } = await supabase
        .from('team_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId)

      if (error) throw error

      alert('Invitation cancelled')
      await loadInvitations(provider.id)
    } catch (error) {
      console.error('Cancel error:', error)
      alert('Failed to cancel invitation')
    }
  }

  const startEditMember = (member) => {
    setEditingMember(member.id)
    setEditMemberForm({
      role:                 member.role                 || 'mechanic',
      specialization:       member.specialization       || '',
      experience_years:     member.experience_years     || 0,
      can_approve_work:     member.can_approve_work     || false,
      can_manage_inventory: member.can_manage_inventory || false,
      can_manage_team:      member.can_manage_team      || false,
    })
  }

  const saveMemberEdit = async () => {
    setSavingMember(true)
    try {
      const { error } = await supabase
        .from('mechanics')
        .update({
          role:                 editMemberForm.role,
          specialization:       editMemberForm.specialization || null,
          experience_years:     parseInt(editMemberForm.experience_years) || 0,
          can_approve_work:     editMemberForm.can_approve_work,
          can_manage_inventory: editMemberForm.can_manage_inventory,
          can_manage_team:      editMemberForm.can_manage_team,
          updated_at:           new Date().toISOString(),
        })
        .eq('id', editingMember)
      if (error) throw error
      setEditingMember(null)
      const { data: { user } } = await supabase.auth.getUser()
      await loadTeamMembers(user.id)
    } catch (e) { alert('Failed to save: ' + e.message) }
    finally { setSavingMember(false) }
  }

  const toggleMemberStatus = async (mechanicId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('mechanics')
        .update({ is_active: !currentStatus })
        .eq('id', mechanicId)

      if (error) {
        console.error('Toggle error:', error)
        alert('Failed to update status')
        return
      }

      // Update local state immediately
      setTeamMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === mechanicId 
            ? { ...member, is_active: !currentStatus }
            : member
        )
      )

      alert(`Team member ${!currentStatus ? 'activated' : 'deactivated'}`)

    } catch (error) {
      console.error('Toggle status error:', error)
      alert('Failed to update status')
    }
  }

  const verifyMember = async (mechanicId) => {
    try {
      const { error } = await supabase
        .from('mechanics')
        .update({ is_verified: true })
        .eq('id', mechanicId)

      if (error) {
        console.error('Verify error:', error)
        alert('Failed to verify member')
        return
      }

      setTeamMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === mechanicId 
            ? { ...member, is_verified: true }
            : member
        )
      )

      alert('Team member verified')
    } catch (error) {
      console.error('Verify error:', error)
      alert('Failed to verify member')
    }
  }

  const removeMember = async (mechanicId) => {
    if (!confirm('Are you sure you want to remove this team member?')) return

    try {
      const { error } = await supabase
        .from('mechanics')
        .delete()
        .eq('id', mechanicId)

      if (error) {
        console.error('Remove error:', error)
        alert('Failed to remove member')
        return
      }

      alert('Team member removed')
      const { data: { user } } = await supabase.auth.getUser()
      await loadTeamMembers(user.id)
    } catch (error) {
      console.error('Remove error:', error)
      alert('Failed to remove member')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Team Management</h1>
        <p className="text-gray-600">Manage your team members and invitations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Members</p>
              <p className="text-3xl font-bold text-gray-900">
                {teamMembers.filter(m => m.is_active).length}
              </p>
            </div>
            <Users className="text-blue-600" size={40} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Invites</p>
              <p className="text-3xl font-bold text-gray-900">
                {invitations.filter(i => i.status === 'pending').length}
              </p>
            </div>
            <Mail className="text-yellow-600" size={40} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Verified</p>
              <p className="text-3xl font-bold text-gray-900">
                {teamMembers.filter(m => m.is_verified).length}
              </p>
            </div>
            <Shield className="text-green-600" size={40} />
          </div>
        </div>
      </div>

      {/* Search Users */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserPlus size={20} />
          Invite Team Member
        </h2>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-4">
            Enter the email address of the user you want to invite. They must have a registered account on the platform.
          </p>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="email"
                placeholder="user@example.com"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => {
                if (searchEmail && searchEmail.includes('@')) {
                  handleInviteUser({ email: searchEmail, can_invite: true })
                } else {
                  alert('Please enter a valid email address')
                }
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <UserPlus size={20} />
              Send Invite
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            The user must be registered on the platform with this email address.
          </p>
        </div>
      </div>

      {/* Team Members */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Team Members ({teamMembers.length})</h2>

        {teamMembers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600">No team members yet</p>
            <p className="text-sm text-gray-500">Search for users and invite them to join your team</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="font-medium">
                      {member.user?.first_name || 'Unknown'} {member.user?.last_name || 'User'}
                    </p>
                    {member.is_verified && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        Verified
                      </span>
                    )}
                    {!member.is_active && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  {member.user?.phone && (
                    <p className="text-sm text-gray-600">📞 {member.user.phone}</p>
                  )}
                  {member.user?.email && (
                    <p className="text-sm text-gray-600">✉️ {member.user.email}</p>
                  )}
                  {member.specialization && (
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <Award size={14} />
                      {member.specialization}
                      {member.experience_years > 0 && ` • ${member.experience_years} years experience`}
                    </p>
                  )}
                  {member.bio && (
                    <p className="text-sm text-gray-500 mt-1 italic">"{member.bio}"</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Permissions badges */}
                  <div className="flex gap-1 mr-2">
                    {member.can_approve_work && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium" title="Can approve work">WO</span>
                    )}
                    {member.can_manage_inventory && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium" title="Can manage inventory">INV</span>
                    )}
                    {member.can_manage_team && (
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium" title="Can manage team">TEAM</span>
                    )}
                  </div>
                  <button
                    onClick={() => startEditMember(member)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                  >
                    <SettingsIcon size={13} /> Edit
                  </button>
                  {!member.is_verified && (
                    <button
                      onClick={() => verifyMember(member.id)}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Verify
                    </button>
                  )}
                  <button
                    onClick={() => toggleMemberStatus(member.id, member.is_active)}
                    className={`px-3 py-1 text-sm rounded ${
                      member.is_active
                        ? 'bg-gray-600 text-white hover:bg-gray-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {member.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invitations - keeping same as before */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Invitations</h2>

        {invitations.length === 0 ? (
          <p className="text-center text-gray-600 py-8">No invitations sent yet</p>
        ) : (
          <div className="space-y-3">
            {invitations.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-medium">{invite.invited_email}</p>
                    <span className={`px-2 py-1 text-xs rounded ${
                      invite.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      invite.status === 'accepted' ? 'bg-green-100 text-green-700' :
                      invite.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {invite.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <Clock size={12} />
                    Sent {new Date(invite.invited_at).toLocaleDateString()}
                    {invite.status === 'pending' && ` • Expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                  </p>
                  {invite.role && (
                    <p className="text-xs text-gray-600 mt-1">
                      Role: {invite.role}
                      {invite.specialization && ` • ${invite.specialization}`}
                    </p>
                  )}
                </div>

                {invite.status === 'pending' && (
                  <button
                    onClick={() => cancelInvitation(invite.id)}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Edit Team Member</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={editMemberForm.role}
                  onChange={e => setEditMemberForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                  <option value="mechanic">Mechanic</option>
                  <option value="senior_mechanic">Senior Mechanic</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Experience (yrs)</label>
                <input type="number" min="0" value={editMemberForm.experience_years}
                  onChange={e => setEditMemberForm(f => ({ ...f, experience_years: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
              <input type="text" value={editMemberForm.specialization}
                onChange={e => setEditMemberForm(f => ({ ...f, specialization: e.target.value }))}
                placeholder="e.g. Engine Specialist, Electrician"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
              <div className="space-y-2">
                {[
                  { key: 'can_approve_work',     label: 'Can approve work orders',     desc: 'Can advance WO status and approve service quality' },
                  { key: 'can_manage_inventory', label: 'Can manage inventory',         desc: 'Can add, edit, and adjust stock levels' },
                  { key: 'can_manage_team',      label: 'Can manage team',              desc: 'Can view and manage other team members' },
                ].map(p => (
                  <label key={p.key} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={editMemberForm[p.key] || false}
                      onChange={e => setEditMemberForm(f => ({ ...f, [p.key]: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.label}</p>
                      <p className="text-xs text-gray-500">{p.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingMember(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={saveMemberEdit} disabled={savingMember}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {savingMember ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal - keeping same as before */}
      {showInviteModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Invite Team Member</h3>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">Email:</p>
              <p className="font-medium">{selectedUser.email}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="mechanic">Mechanic</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Specialization
                </label>
                <input
                  type="text"
                  value={inviteForm.specialization}
                  onChange={(e) => setInviteForm({ ...inviteForm, specialization: e.target.value })}
                  placeholder="e.g., Engine Specialist, Electrician"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Years of Experience
                </label>
                <input
                  type="number"
                  value={inviteForm.experience_years}
                  onChange={(e) => setInviteForm({ ...inviteForm, experience_years: parseInt(e.target.value) || 0 })}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowInviteModal(false)
                  setSelectedUser(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitInvitation}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}