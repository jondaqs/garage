'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { 
  Users, UserPlus, Search, Mail, Shield, Award, Wrench,
  Clock, Check, X, AlertCircle, MoreVertical,
  Settings as SettingsIcon
} from 'lucide-react'
import useProviderAccess from '@/hooks/useProviderAccess'
import WriteGate from '@/components/WriteGate'
import ProviderAccessBanner from '@/components/ProviderAccessBanner'

export default function ProviderTeamPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(true)
  const providerAccess = useProviderAccess()
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
        .from('user_profiles_secure')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // Get service provider
      const { data: providerData } = await supabase
        .from('service_providers_secure')
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
      console.error('Error loading data:')
    } finally {
      setLoading(false)
    }
  }

  const loadTeamMembers = async (authUserId) => {
    try {
      const pId = provider?.id || (await getProviderId())
      if (!pId) return

      // Primary: get all SPU members (all roles)
      const { data: spuData, error } = await supabase.rpc('get_provider_team_members', {
        p_provider_id: pId
      })
      if (error) console.error('get_provider_team_members error:')

      const spuUserIds = new Set((spuData || []).map(m => m.user_id))

      // Also fetch mechanics that don't have an SPU row yet (legacy / backfill gaps)
      const { data: mechOnly } = await supabase
        .from('mechanics')
        .select(`
          id, user_id, role, specialization, experience_years,
          is_active, is_verified,
          can_approve_work, can_manage_inventory, can_manage_team, can_send_estimates,
          can_send_invoice, can_chat,
          user:user_profiles_secure!user_id(first_name, last_name, email, phone)
        `)
        .eq('service_provider_id', pId)
        .eq('is_active', true)

      const mechOnlyExtra = (mechOnly || []).filter(m => !spuUserIds.has(m.user_id))

      const spuRows = (spuData || []).map(m => ({
        id:                  m.mechanic_id || m.spu_id,
        spu_id:              m.spu_id,
        mechanic_id:         m.mechanic_id,
        user_id:             m.user_id,
        role:                m.role,
        specialization:      m.specialization,
        experience_years:    m.experience_years,
        is_active:           m.is_active,
        is_verified:         m.is_verified,
        pending_leave:       !!m.deactivation_requested_at,
        deactivation_reason: m.deactivation_reason,
        // SPU-level permissions
        spu_can_approve_work:     m.spu_can_approve_work,
        spu_can_manage_inventory: m.spu_can_manage_inventory,
        spu_can_manage_team:      m.spu_can_manage_team,
        spu_can_send_estimates:   m.spu_can_send_estimates,
        spu_can_send_invoice:     m.spu_can_send_invoice,
        spu_can_chat:             m.spu_can_chat,
        // Mechanic-level permissions
        mech_can_approve_work:     m.mech_can_approve_work,
        mech_can_manage_inventory: m.mech_can_manage_inventory,
        mech_can_manage_team:      m.mech_can_manage_team,
        mech_can_send_estimates:   m.mech_can_send_estimates,
        mech_can_send_invoice:     m.mech_can_send_invoice,
        mech_can_chat:             m.mech_can_chat,
        source:              'spu',
        user: {
          first_name: m.first_name,
          last_name:  m.last_name,
          email:      m.email,
          phone:      m.phone,
        }
      }))

      const mechRows = mechOnlyExtra.map(m => ({
        id:                  m.id,
        spu_id:              null,
        mechanic_id:         m.id,
        user_id:             m.user_id,
        role:                m.role || 'mechanic',
        specialization:      m.specialization,
        experience_years:    m.experience_years,
        is_active:           m.is_active,
        is_verified:         m.is_verified,
        spu_can_approve_work:     false,
        spu_can_manage_inventory: false,
        spu_can_manage_team:      false,
        spu_can_send_estimates:   false,
        spu_can_send_invoice:     false,
        spu_can_chat:             false,
        mech_can_approve_work:     !!m.can_approve_work,
        mech_can_manage_inventory: !!m.can_manage_inventory,
        mech_can_manage_team:      !!m.can_manage_team,
        mech_can_send_estimates:   !!m.can_send_estimates,
        mech_can_send_invoice:     !!m.can_send_invoice,
        mech_can_chat:             !!m.can_chat,
        source:              'mechanic_only',
        user: {
          first_name: m.user?.first_name,
          last_name:  m.user?.last_name,
          email:      m.user?.email,
          phone:      m.user?.phone,
        }
      }))

      setTeamMembers([...spuRows, ...mechRows])
    } catch (error) {
      console.error('Error in loadTeamMembers:')
      setTeamMembers([])
    }
  }

  const getProviderId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    
    const { data: providerData } = await supabase
      .from('service_providers_secure')
      .select('id')
      .eq('owner_user_id', profile.id)
      .single()
    
    return providerData?.id
  }

  const loadInvitations = async (providerId) => {
    const { data, error } = await supabase
      .from('team_invitations_secure')
      .select('*')
      .eq('service_provider_id', providerId)
      .in('status', ['pending', 'accepted', 'rejected'])
      .order('invited_at', { ascending: false })

    if (error) {
      console.error('Error loading invitations:')
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
      console.error('Invitation error:')
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
      console.error('Cancel error:')
      alert('Failed to cancel invitation')
    }
  }

  const [editingMemberData, setEditingMemberData] = useState(null)
  const [editModalTab,    setEditModalTab]    = useState('role')  // 'role' | 'mechanic'

  const startEditMember = (member) => {
    setEditingMember(member.mechanic_id || member.id)
    setEditingMemberData(member)
    setEditModalTab('role')
    setEditMemberForm({
      role:                 member.role            || 'mechanic',
      specialization:       member.specialization  || '',
      experience_years:     member.experience_years || 0,
      // SPU permissions (Provider Role tab)
      spu_can_approve_work:     !!member.spu_can_approve_work,
      spu_can_manage_inventory: !!member.spu_can_manage_inventory,
      spu_can_manage_team:      !!member.spu_can_manage_team,
      spu_can_send_estimates:   !!member.spu_can_send_estimates,
      spu_can_send_invoice:     !!member.spu_can_send_invoice,
      spu_can_chat:             !!member.spu_can_chat,
      // Mechanic permissions (Mechanic tab)
      mech_can_approve_work:     !!member.mech_can_approve_work,
      mech_can_manage_inventory: !!member.mech_can_manage_inventory,
      mech_can_manage_team:      !!member.mech_can_manage_team,
      mech_can_send_estimates:   !!member.mech_can_send_estimates,
      mech_can_send_invoice:     !!member.mech_can_send_invoice,
      mech_can_chat:             !!member.mech_can_chat,
    })
  }

  const saveMemberEdit = async () => {
    setSavingMember(true)
    try {
      const newRole      = editMemberForm.role
      const isMechRole   = ['mechanic','senior_mechanic'].includes(newRole)
      const wasMechRole  = ['mechanic','senior_mechanic'].includes(editingMemberData?.role)

      // 1. Update role in service_provider_users
      if (editingMemberData?.spu_id) {
        const { error: spuErr } = await supabase
          .from('service_provider_users')
          .update({
            role:                 newRole,
            can_approve_work:     editMemberForm.spu_can_approve_work,
            can_manage_team:      editMemberForm.spu_can_manage_team,
            can_manage_inventory: editMemberForm.spu_can_manage_inventory,
            can_send_estimates:   editMemberForm.spu_can_send_estimates,
            can_send_invoice:     editMemberForm.spu_can_send_invoice,
            can_chat:             editMemberForm.spu_can_chat,
            updated_at:           new Date().toISOString(),
          })
          .eq('id', editingMemberData.spu_id)
        if (spuErr) throw spuErr
      }

      if (isMechRole) {
        if (editingMemberData?.mechanic_id) {
          // 2a. Already a mechanic — update existing record
          const { error: mechErr } = await supabase
            .from('mechanics')
            .update({
              role:                 newRole,
              specialization:       editMemberForm.specialization || null,
              experience_years:     parseInt(editMemberForm.experience_years) || 0,
              can_approve_work:     editMemberForm.mech_can_approve_work,
              can_manage_inventory: editMemberForm.mech_can_manage_inventory,
              can_manage_team:      editMemberForm.mech_can_manage_team,
              can_send_estimates:   editMemberForm.mech_can_send_estimates,
              can_send_invoice:     editMemberForm.mech_can_send_invoice,
              can_chat:             editMemberForm.mech_can_chat,
              is_active:            true,
              updated_at:           new Date().toISOString(),
            })
            .eq('id', editingMemberData.mechanic_id)
          if (mechErr) throw mechErr
        } else {
          // 2b. Upgrading to mechanic role — create mechanics record
          const { error: mechErr } = await supabase
            .from('mechanics')
            .insert({
              user_id:             editingMemberData.user_id,
              service_provider_id: provider.id,
              role:                newRole,
              specialization:      editMemberForm.specialization || null,
              experience_years:    parseInt(editMemberForm.experience_years) || 0,
              can_approve_work:    editMemberForm.mech_can_approve_work,
              can_manage_inventory:editMemberForm.mech_can_manage_inventory,
              can_manage_team:     editMemberForm.mech_can_manage_team,
              can_send_estimates:  editMemberForm.mech_can_send_estimates,
              can_send_invoice:    editMemberForm.mech_can_send_invoice,
              can_chat:            editMemberForm.mech_can_chat,
              is_active:           true,
              is_verified:         false,
            })
          if (mechErr) throw mechErr
        }
      } else if (wasMechRole && editingMemberData?.mechanic_id) {
        // 2c. Downgrading from mechanic — deactivate their mechanics record
        const { error: deactErr } = await supabase
          .from('mechanics')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', editingMemberData.mechanic_id)
        if (deactErr) throw deactErr
      }

      setEditingMember(null)
      setEditingMemberData(null)
      const { data: { user } } = await supabase.auth.getUser()
      await loadTeamMembers(user.id)
    } catch (e) { alert('Failed to save: ' + e.message) }
    finally { setSavingMember(false) }
  }

  const toggleMemberStatus = async (memberId, currentStatus, spuId, mechanicId) => {
    try {
      const newStatus = !currentStatus

      // Update service_provider_users (primary membership record)
      if (spuId) {
        const { error: spuErr } = await supabase
          .from('service_provider_users')
          .update({ is_active: newStatus, updated_at: new Date().toISOString() })
          .eq('id', spuId)
        if (spuErr) {
          console.error('SPU toggle error:', spuErr)
          alert('Failed to update status')
          return
        }
      }

      // Update mechanics (if the member has a mechanic record)
      if (mechanicId) {
        const { error: mechErr } = await supabase
          .from('mechanics')
          .update({ is_active: newStatus, updated_at: new Date().toISOString() })
          .eq('id', mechanicId)
        if (mechErr) {
          console.error('Mechanic toggle error:', mechErr)
          // Non-fatal — SPU was already updated
        }
      }

      // Update local state immediately
      setTeamMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === memberId 
            ? { ...member, is_active: newStatus }
            : member
        )
      )

      alert(`Team member ${newStatus ? 'activated' : 'deactivated'}`)

    } catch (error) {
      console.error('Toggle status error:', error)
      alert('Failed to update status')
    }
  }

  const verifyMember = async (memberId) => {
    // memberId is member.id which equals mechanic_id || spu_id
    // Find the full member object to get both spu_id and mechanic_id
    const member = teamMembers.find(m => m.id === memberId)
    if (!member) return

    try {
      const updates = []

      // Always update service_provider_users (all roles)
      if (member.spu_id) {
        updates.push(
          supabase.from('service_provider_users')
            .update({ is_verified: true, updated_at: new Date().toISOString() })
            .eq('id', member.spu_id)
        )
      }

      // Also update mechanics table if they have a mechanic record
      if (member.mechanic_id) {
        updates.push(
          supabase.from('mechanics')
            .update({ is_verified: true, updated_at: new Date().toISOString() })
            .eq('id', member.mechanic_id)
        )
      }

      const results = await Promise.all(updates)
      const failed  = results.find(r => r.error)
      if (failed) {
        console.error('Verify error:', failed.error)
        alert('Failed to verify member')
        return
      }

      setTeamMembers(prev =>
        prev.map(m => m.id === memberId ? { ...m, is_verified: true } : m)
      )

      alert('Team member verified successfully')
    } catch (error) {
      console.error('Verify error:')
      alert('Failed to verify member')
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

      {/* Subscription banner */}
      {!providerAccess.loading && <ProviderAccessBanner {...providerAccess} />}

      {/* Search Users */}
      <WriteGate canWrite={providerAccess.canWrite} state={providerAccess.state} inline>
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
      </WriteGate>

      {/* Team Members */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">Team Members ({teamMembers.filter(m => m.is_active).length} active{teamMembers.filter(m => !m.is_active).length > 0 ? `, ${teamMembers.filter(m => !m.is_active).length} inactive` : ''})</h2>

        {teamMembers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600">No team members yet</p>
            <p className="text-sm text-gray-500">Search for users and invite them to join your team</p>
          </div>
        ) : (
          <div className="space-y-3">
            {teamMembers.map((member) => (
              <div key={member.id} className={`flex items-center justify-between p-4 border rounded-lg ${
                !member.is_active ? 'border-gray-200 bg-gray-50 opacity-70' :
                member.pending_leave ? 'border-yellow-200 bg-yellow-50/30' :
                'border-gray-200'
              }`}>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">
                        {member.user?.first_name || 'Unknown'} {member.user?.last_name || 'User'}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        member.role === 'service_provider_owner' ? 'bg-blue-100 text-blue-700' :
                        member.role === 'admin'          ? 'bg-red-100 text-red-700' :
                        member.role === 'accountant'     ? 'bg-purple-100 text-purple-700' :
                        member.role === 'manager'        ? 'bg-orange-100 text-orange-700' :
                        member.role === 'senior_mechanic'? 'bg-cyan-100 text-cyan-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {(member.role || 'mechanic').replace(/_/g,' ')}
                      </span>
                    </div>
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
                  {member.mechanic_id && (
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="text-xs px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full font-medium flex items-center gap-1">
                        <Wrench size={10} /> Mechanic
                      </span>
                      {member.specialization && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Award size={12} /> {member.specialization}
                        </span>
                      )}
                      {member.experience_years > 0 && (
                        <span className="text-xs text-gray-500">
                          {member.experience_years} yr{member.experience_years !== 1 ? 's' : ''} exp
                        </span>
                      )}
                      {member.source === 'mechanic_only' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-300 text-amber-700 rounded">
                          ⚠ Not in SPU
                        </span>
                      )}
                    </div>
                  )}
                  {!member.mechanic_id && member.bio && (
                    <p className="text-sm text-gray-500 mt-1 italic">"{member.bio}"</p>
                  )}

                  {/* Pending leave banner */}
                  {member.pending_leave && (
                    <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
                      <p className="text-xs font-semibold text-yellow-800 flex items-center gap-1">
                        ⚠️ Has requested to leave the team
                      </p>
                      {member.deactivation_reason && (
                        <p className="text-xs text-yellow-700 mt-0.5">Reason: &quot;{member.deactivation_reason}&quot;</p>
                      )}
                      <p className="text-xs text-yellow-600 mt-1">Review any pending duties or tools to return before confirming.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Permissions badges */}
                  <div className="flex gap-1 mr-2 flex-wrap">
                    {(member.spu_can_approve_work || member.mech_can_approve_work) && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium" title="Can approve work">WO</span>
                    )}
                    {(member.spu_can_send_estimates || member.mech_can_send_estimates) && (
                      <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium" title="Can send estimates">EST</span>
                    )}
                    {(member.spu_can_send_invoice || member.mech_can_send_invoice) && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium" title="Can send invoices">INV$</span>
                    )}
                    {(member.spu_can_manage_inventory || member.mech_can_manage_inventory) && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium" title="Can manage inventory">INV</span>
                    )}
                    {(member.spu_can_manage_team || member.mech_can_manage_team) && (
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium" title="Can manage team">TEAM</span>
                    )}
                    {(member.spu_can_chat || member.mech_can_chat) && (
                      <span className="text-xs px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded font-medium" title="Can chat with customers">CHAT</span>
                    )}
                  </div>
                  {member.role !== 'service_provider_owner' && (<>
                    {!member.pending_leave && member.is_active && (
                      <button
                        onClick={() => startEditMember(member)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                      >
                        <SettingsIcon size={13} /> Edit
                      </button>
                    )}
                    {!member.is_verified && !member.pending_leave && member.is_active && (
                      <button
                        onClick={() => verifyMember(member.id)}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Verify
                      </button>
                    )}
                    {member.pending_leave ? (
                      <button
                        onClick={async () => {
                          if (!confirm(`Confirm departure of ${member.user?.first_name || 'this member'}? This will fully deactivate them.`)) return
                          const { data } = await supabase.rpc('confirm_member_deactivation', { p_spu_id: member.spu_id })
                          const res = typeof data === 'string' ? JSON.parse(data) : data
                          if (res?.success) { alert(`${member.user?.first_name || 'Member'} has been deactivated.`); loadTeamMembers() }
                          else alert(res?.error || 'Failed to confirm deactivation')
                        }}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Confirm Departure
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleMemberStatus(member.id, member.is_active, member.spu_id, member.mechanic_id)}
                      className={`px-3 py-1 text-sm rounded ${
                        member.is_active
                          ? 'bg-gray-600 text-white hover:bg-gray-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {member.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    )}
                  </>)}
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
      {editingMember && (() => {
        const isMechRole = ['mechanic','senior_mechanic'].includes(editMemberForm.role)
        const memberName = `${editingMemberData?.user?.first_name || ''} ${editingMemberData?.user?.last_name || ''}`.trim() || 'Team Member'
        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-auto space-y-5 max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Edit Team Member</h3>
                <p className="text-sm text-gray-500 mt-0.5">{memberName}</p>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setEditModalTab('role')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${editModalTab === 'role' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  Provider Role
                </button>
                {(isMechRole || editingMemberData?.mechanic_id) && (
                  <button
                    onClick={() => setEditModalTab('mechanic')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${editModalTab === 'mechanic' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Wrench size={11} /> Mechanic
                  </button>
                )}
              </div>
            </div>

            {/* ── TAB: Provider Role ── */}
            {editModalTab === 'role' && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Provider Role</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select value={editMemberForm.role}
                    onChange={e => {
                      const newRole = e.target.value
                      setEditMemberForm(f => ({ ...f, role: newRole }))
                      // If switching to mechanic role, auto-switch to mechanic tab
                      if (['mechanic','senior_mechanic'].includes(newRole)) {
                        setEditModalTab('mechanic')
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                    <option value="mechanic">Mechanic</option>
                    <option value="senior_mechanic">Senior Mechanic</option>
                    <option value="manager">Manager</option>
                    <option value="accountant">Accountant</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Role description */}
                <p className="text-xs text-gray-500">
                  {editMemberForm.role === 'admin'           && 'Admins can manage the provider account, team, and settings.'}
                  {editMemberForm.role === 'accountant'      && 'Accountants can review and send estimates and invoices.'}
                  {editMemberForm.role === 'manager'         && 'Managers can oversee team operations and work orders.'}
                  {editMemberForm.role === 'mechanic'        && 'Mechanics handle vehicle diagnostics, services, and work orders.'}
                  {editMemberForm.role === 'senior_mechanic' && 'Senior Mechanics can lead work and may have additional permissions.'}
                </p>

                {/* Work permissions — shown for all roles */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Work Permissions</p>
                  <div className="space-y-1.5">
                    {[
                      { key: 'spu_can_approve_work',     mech: 'mech_can_approve_work',     label: 'Can approve work orders'        },
                      { key: 'spu_can_send_estimates',   mech: 'mech_can_send_estimates',   label: 'Can send estimates to customer'  },
                      { key: 'spu_can_send_invoice',     mech: 'mech_can_send_invoice',     label: 'Can send invoices'               },
                      { key: 'spu_can_manage_inventory', mech: 'mech_can_manage_inventory', label: 'Can manage inventory'            },
                      { key: 'spu_can_manage_team',      mech: 'mech_can_manage_team',      label: 'Can manage team'                 },
                      { key: 'spu_can_chat',             mech: 'mech_can_chat',             label: 'Can chat with customers'         },
                    ].map(p => (
                      <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editMemberForm[p.key] || false}
                          onChange={e => {
                            const val = e.target.checked
                            setEditMemberForm(f => ({
                              ...f,
                              [p.key]:  val,
                              // Mirror to mechanic table field so both stay in sync
                              [p.mech]: val,
                            }))
                          }}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                        <span className="text-xs text-gray-700">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {isMechRole && (
                  <p className="text-xs text-blue-600">
                    💡 Switch to the <button className="underline font-medium" onClick={() => setEditModalTab('mechanic')}>Mechanic tab</button> to set specialization and experience.
                  </p>
                )}

                {/* Role change warning */}
                {editingMemberData?.role !== editMemberForm.role && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${
                    isMechRole && !editingMemberData?.mechanic_id
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : !isMechRole && editingMemberData?.mechanic_id
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isMechRole && !editingMemberData?.mechanic_id
                      ? '⚡ A mechanic record will be created for this member'
                      : !isMechRole && editingMemberData?.mechanic_id
                      ? '⚠️ Changing to a non-mechanic role will deactivate their mechanic record and remove work order access'
                      : `Role will be updated from "${editingMemberData?.role?.replace(/_/g,' ')}" to "${editMemberForm.role?.replace(/_/g,' ')}"`
                    }
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Mechanic Details (reads/writes mechanics table) ── */}
            {editModalTab === 'mechanic' && (isMechRole || editingMemberData?.mechanic_id) && (
              <div className="bg-blue-50 rounded-lg p-4 space-y-4 border border-blue-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Mechanic Record</p>
                  <span className="text-[10px] text-blue-500">mechanics table</span>
                </div>

                {/* Role display (read from SPU, applied to mechanic) */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200">
                  <Wrench size={13} className="text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-500">Role (set in Provider Role tab)</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">{editMemberForm.role?.replace(/_/g,' ')}</p>
                  </div>
                  <button
                    onClick={() => setEditModalTab('role')}
                    className="ml-auto text-xs text-blue-600 hover:underline">
                    Change →
                  </button>
                </div>

                {/* Specialization + Experience */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
                    <input type="text" value={editMemberForm.specialization || ''}
                      onChange={e => setEditMemberForm(f => ({ ...f, specialization: e.target.value }))}
                      placeholder="e.g. Engine Specialist"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Experience (yrs)</label>
                    <input type="number" min="0" value={editMemberForm.experience_years || 0}
                      onChange={e => setEditMemberForm(f => ({ ...f, experience_years: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white" />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Mechanic Work Permissions</p>
                  <div className="space-y-2">
                    {[
                      { key: 'mech_can_approve_work',     spu: 'spu_can_approve_work',     label: 'Can approve work orders',       desc: 'Advance WO status and approve service quality' },
                      { key: 'mech_can_send_estimates',   spu: 'spu_can_send_estimates',   label: 'Can send estimates to customer', desc: 'Send estimates directly without owner review' },
                      { key: 'mech_can_send_invoice',     spu: 'spu_can_send_invoice',     label: 'Can send invoices to customer',  desc: 'Send invoices and accept payment directly' },
                      { key: 'mech_can_manage_inventory', spu: 'spu_can_manage_inventory', label: 'Can manage inventory',           desc: 'Add, edit, and adjust stock levels' },
                      { key: 'mech_can_manage_team',      spu: 'spu_can_manage_team',      label: 'Can manage team',                desc: 'View and manage other team members' },
                      { key: 'mech_can_chat',             spu: 'spu_can_chat',             label: 'Can chat with customers',        desc: 'Reply to customer chat messages' },
                    ].map(p => (
                      <label key={p.key} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-white bg-white/60">
                        <input type="checkbox" checked={editMemberForm[p.key] || false}
                          onChange={e => {
                            const val = e.target.checked
                            setEditMemberForm(f => ({
                              ...f,
                              [p.key]:  val,
                              // Mirror back to SPU field so both stay in sync
                              [p.spu]:  val,
                            }))
                          }}
                          className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{p.label}</p>
                          <p className="text-xs text-gray-500">{p.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setEditingMember(null); setEditingMemberData(null) }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
                Cancel
              </button>
              <button onClick={saveMemberEdit} disabled={savingMember}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                {savingMember ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
        )
      })()}

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
                  <option value="senior_mechanic">Senior Mechanic</option>
                  <option value="manager">Manager</option>
                  <option value="accountant">Accountant</option>
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