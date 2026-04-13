'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, Building2, Calendar, Award, Phone, Mail, AlertCircle, LogOut, Edit2, MapPin } from 'lucide-react'

export default function MyTeamsPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [leaving, setLeaving] = useState(null)
  const [editing, setEditing] = useState(null)
  const [editData, setEditData] = useState({})
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [responding, setResponding] = useState(null)   // invitation id being responded to

  useEffect(() => {
    loadTeams()
    loadPendingInvitations()
  }, [])

  const loadTeams = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) return

      // Get all team memberships with provider info
      const { data, error } = await supabase
        .from('mechanics')
        .select(`
          id,
          user_id,
          service_provider_id,
          specialization,
          experience_years,
          bio,
          is_verified,
          is_active,
          role,
          created_at,
          service_provider:service_providers(
            id,
            name,
            phone,
            email,
            country
          )
        `)
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading teams:', error)
        return
      }

      // Now fetch shop details for each provider
      const teamsWithShops = await Promise.all(
        (data || []).map(async (mechanic) => {
          // Get primary shop details (first active shop)
          const { data: shop } = await supabase
            .from('shops')
            .select('id, name, phone, email, town, county, street, country')
            .eq('service_provider_id', mechanic.service_provider_id)
            .eq('is_active', true)
            .limit(1)
            .single()

          return {
            ...mechanic,
            shop: shop
          }
        })
      )

      setTeams(teamsWithShops)

    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPendingInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('team_invitations')
        .select(`
          id, role, specialization, experience_years, invited_at, expires_at,
          service_provider:service_providers(id, name, email, phone)
        `)
        .eq('invited_email', user.email)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('invited_at', { ascending: false })
      setPendingInvitations(data || [])
    } catch (e) { console.error('loadPendingInvitations error:', e) }
  }

  const respondToInvitation = async (invitationId, action) => {
    setResponding(invitationId)
    try {
      const res  = await fetch('/api/team/respond-invitation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ invitation_id: invitationId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to respond')
      setPendingInvitations(prev => prev.filter(i => i.id !== invitationId))
      if (action === 'accept') loadTeams()
    } catch (e) { alert(e.message) }
    finally { setResponding(null) }
  }

  const handleLeaveTeam = async (mechanicId, providerName) => {
    if (!confirm(`Are you sure you want to leave ${providerName}? This action cannot be undone.`)) {
      return
    }

    setLeaving(mechanicId)

    try {
      const { error } = await supabase
        .from('mechanics')
        .update({ is_active: false })
        .eq('id', mechanicId)

      if (error) {
        console.error('Error leaving team:', error)
        alert('Failed to leave team. Please try again.')
        return
      }

      alert(`You have left ${providerName}`)
      await loadTeams()

    } catch (error) {
      console.error('Error:', error)
      alert('Failed to leave team. Please try again.')
    } finally {
      setLeaving(null)
    }
  }

  const startEditing = (mechanic) => {
    setEditing(mechanic.id)
    setEditData({
      specialization: mechanic.specialization || '',
      experience_years: mechanic.experience_years || 0,
      bio: mechanic.bio || ''
    })
  }

  const cancelEditing = () => {
    setEditing(null)
    setEditData({})
  }

  const saveEdit = async (mechanicId) => {
    try {
      const { error } = await supabase
        .from('mechanics')
        .update({
          specialization: editData.specialization || null,
          experience_years: parseInt(editData.experience_years) || 0,
          bio: editData.bio || null
        })
        .eq('id', mechanicId)

      if (error) {
        console.error('Update error:', error)
        alert('Failed to update details')
        return
      }

      alert('Details updated successfully!')
      setEditing(null)
      setEditData({})
      await loadTeams()

    } catch (error) {
      console.error('Error:', error)
      alert('Failed to update details')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Teams</h1>
          <p className="text-gray-600">
            Manage your team memberships and update your details
          </p>
        </div>

        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 mb-6">
            <h2 className="text-base font-semibold text-yellow-900 mb-3 flex items-center gap-2">
              <span className="text-yellow-600">📬</span>
              Pending Team Invitations ({pendingInvitations.length})
            </h2>
            <div className="space-y-3">
              {pendingInvitations.map(inv => (
                <div key={inv.id} className="bg-white rounded-lg border border-yellow-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{inv.service_provider?.name || 'Unknown Garage'}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Role: <span className="capitalize font-medium">{inv.role || 'Mechanic'}</span>
                      {inv.specialization && ` · ${inv.specialization}`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Invited {new Date(inv.invited_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}Expires {new Date(inv.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => respondToInvitation(inv.id, 'accept')}
                      disabled={responding === inv.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {responding === inv.id ? 'Accepting…' : 'Accept'}
                    </button>
                    <button
                      onClick={() => respondToInvitation(inv.id, 'reject')}
                      disabled={responding === inv.id}
                      className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teams List */}
        {teams.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Users className="mx-auto text-gray-400 mb-4" size={64} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Team Memberships
            </h3>
            <p className="text-gray-600">
              You haven't joined any teams yet. Accept an invitation to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {teams.map((team) => (
              <div key={team.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Team Header */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-blue-600 rounded-lg">
                        <Building2 className="text-white" size={24} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {team.service_provider?.name || 'Unknown Provider'}
                        </h2>
                        {team.service_provider?.country && (
                          <p className="text-gray-600 mt-1">
                            📍 {team.service_provider.country}
                          </p>
                        )}
                        {team.shop && (
                          <div className="mt-2 space-y-1">
                            {team.shop.name && (
                              <p className="text-sm text-gray-600">
                                🏪 {team.shop.name}
                              </p>
                            )}
                            {(team.shop.town || team.shop.county) && (
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <MapPin size={14} />
                                {[team.shop.town, team.shop.county, team.shop.country].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2">
                      {team.is_verified ? (
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
                          ✓ Verified
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-medium rounded-full">
                          Pending Verification
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Team Details */}
                <div className="p-6">
                  {editing === team.id ? (
                    /* Edit Mode */
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Specialization
                        </label>
                        <input
                          type="text"
                          value={editData.specialization}
                          onChange={(e) => setEditData({ ...editData, specialization: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Engine Specialist, Electrical Systems"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Years of Experience
                        </label>
                        <input
                          type="number"
                          value={editData.experience_years}
                          onChange={(e) => setEditData({ ...editData, experience_years: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          min="0"
                          max="50"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Bio / Notes
                        </label>
                        <textarea
                          value={editData.bio}
                          onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          rows="3"
                          placeholder="Brief description of your skills and expertise..."
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => saveEdit(team.id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        {/* Role */}
                        {team.role && (
                          <div className="flex items-center gap-2">
                            <Award className="text-blue-600" size={18} />
                            <div>
                              <p className="text-sm text-gray-600">Role</p>
                              <p className="font-semibold text-gray-900">{team.role}</p>
                            </div>
                          </div>
                        )}

                        {/* Specialization */}
                        {team.specialization && (
                          <div className="flex items-center gap-2">
                            <Award className="text-purple-600" size={18} />
                            <div>
                              <p className="text-sm text-gray-600">Specialization</p>
                              <p className="font-semibold text-gray-900">{team.specialization}</p>
                            </div>
                          </div>
                        )}

                        {/* Experience */}
                        {team.experience_years > 0 && (
                          <div className="flex items-center gap-2">
                            <Calendar className="text-green-600" size={18} />
                            <div>
                              <p className="text-sm text-gray-600">Experience</p>
                              <p className="font-semibold text-gray-900">{team.experience_years} years</p>
                            </div>
                          </div>
                        )}

                        {/* Joined Date */}
                        <div className="flex items-center gap-2">
                          <Calendar className="text-gray-600" size={18} />
                          <div>
                            <p className="text-sm text-gray-600">Joined</p>
                            <p className="font-semibold text-gray-900">
                              {new Date(team.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Bio */}
                      {team.bio && (
                        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600 mb-1">Bio</p>
                          <p className="text-gray-900">{team.bio}</p>
                        </div>
                      )}

                      {/* Contact Info - Provider Level */}
                      <div className="flex flex-wrap gap-4 mb-4 pt-4 border-t">
                        {team.service_provider?.phone && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Phone size={16} />
                            <span className="text-sm">{team.service_provider.phone}</span>
                          </div>
                        )}
                        {team.service_provider?.email && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Mail size={16} />
                            <span className="text-sm">{team.service_provider.email}</span>
                          </div>
                        )}
                        {/* Shop Contact (if different from provider) */}
                        {team.shop?.phone && team.shop.phone !== team.service_provider?.phone && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Phone size={16} />
                            <span className="text-sm">{team.shop.phone} (Shop)</span>
                          </div>
                        )}
                        {team.shop?.email && team.shop.email !== team.service_provider?.email && (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Mail size={16} />
                            <span className="text-sm">{team.shop.email} (Shop)</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-4 border-t">
                        <button
                          onClick={() => startEditing(team)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                        >
                          <Edit2 size={18} />
                          Update My Details
                        </button>

                        <button
                          onClick={() => handleLeaveTeam(team.id, team.service_provider?.name)}
                          disabled={leaving === team.id}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 font-medium"
                        >
                          {leaving === team.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Leaving...
                            </>
                          ) : (
                            <>
                              <LogOut size={18} />
                              Leave Team
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Warning if not verified */}
                {!team.is_verified && (
                  <div className="bg-yellow-50 border-t border-yellow-200 p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">
                          Pending Verification
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          The provider needs to verify your membership before you can start working.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}