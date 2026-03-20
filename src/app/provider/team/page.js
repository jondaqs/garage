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
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  
  const [inviteForm, setInviteForm] = useState({
    role: 'mechanic',
    specialization: '',
    experience_years: 0
  })

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

      // Load team members
      await loadTeamMembers(providerData.id)
      
      // Load invitations
      await loadInvitations(providerData.id)

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTeamMembers = async (providerId) => {
    const { data, error } = await supabase
      .from('mechanics')
      .select(`
        *,
        user:user_profiles(id, first_name, last_name, phone, email:auth_user_id)
      `)
      .eq('service_provider_id', providerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading team members:', error)
      return
    }

    // Get email for each user
    const membersWithEmail = await Promise.all(
      data.map(async (member) => {
        const { data: authUser } = await supabase.auth.admin.getUserById(
          member.user.email
        )
        return {
          ...member,
          user: {
            ...member.user,
            email: authUser?.user?.email
          }
        }
      })
    )

    setTeamMembers(membersWithEmail)
  }

  const loadInvitations = async (providerId) => {
    const { data, error } = await supabase
      .from('team_invitations')
      .select(`
        *,
        invited_user:user_profiles(first_name, last_name)
      `)
      .eq('service_provider_id', providerId)
      .in('status', ['pending', 'accepted', 'rejected'])
      .order('invited_at', { ascending: false })

    if (error) {
      console.error('Error loading invitations:', error)
      return
    }

    setInvitations(data || [])
  }

  const handleSearch = async () => {
    if (!searchEmail || searchEmail.length < 3) {
      alert('Please enter at least 3 characters')
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/team/search-users?email=${encodeURIComponent(searchEmail)}`)
      const data = await response.json()

      if (response.ok) {
        setSearchResults(data.users || [])
      } else {
        alert(data.error || 'Search failed')
      }
    } catch (error) {
      console.error('Search error:', error)
      alert('Failed to search users')
    } finally {
      setSearching(false)
    }
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
        setSearchResults([])
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

  const toggleMemberStatus = async (mechanicId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('mechanics')
        .update({ is_active: !currentStatus })
        .eq('id', mechanicId)

      if (error) throw error

      alert(`Team member ${!currentStatus ? 'activated' : 'deactivated'}`)
      await loadTeamMembers(provider.id)
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

      if (error) throw error

      alert('Team member verified')
      await loadTeamMembers(provider.id)
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

      if (error) throw error

      alert('Team member removed')
      await loadTeamMembers(provider.id)
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

        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="email"
              placeholder="Search by email address..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            <Search size={20} />
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 font-medium">Search Results:</p>
            {searchResults.map((user, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-medium">
                    {user.first_name} {user.last_name}
                    {!user.can_invite && (
                      <span className="ml-2 text-xs text-red-600">(Inactive/Suspended)</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600">{user.email}</p>
                  {user.is_team_member && (
                    <span className="text-xs text-green-600">Already a team member</span>
                  )}
                  {user.has_pending_invite && (
                    <span className="text-xs text-yellow-600">Pending invitation</span>
                  )}
                </div>
                <button
                  onClick={() => handleInviteUser(user)}
                  disabled={!user.can_invite || user.is_team_member || user.has_pending_invite}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Invite
                </button>
              </div>
            ))}
          </div>
        )}
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
                      {member.user.first_name} {member.user.last_name}
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
                  <p className="text-sm text-gray-600">{member.user.email}</p>
                  {member.specialization && (
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <Award size={14} />
                      {member.specialization}
                      {member.experience_years > 0 && ` • ${member.experience_years} years experience`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
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

      {/* Invitations */}
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
                  {invite.invited_user && (
                    <p className="text-sm text-gray-600">
                      {invite.invited_user.first_name} {invite.invited_user.last_name}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <Clock size={12} />
                    Sent {new Date(invite.invited_at).toLocaleDateString()}
                    {invite.status === 'pending' && ` • Expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                  </p>
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

      {/* Invite Modal */}
      {showInviteModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Invite Team Member</h3>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">Email:</p>
              <p className="font-medium">{selectedUser.email}</p>
              <p className="text-sm text-gray-600 mt-1">
                {selectedUser.first_name} {selectedUser.last_name}
              </p>
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