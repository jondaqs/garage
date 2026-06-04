'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mail, Check, X, Clock, Building2, Award } from 'lucide-react'

export default function PendingInvitationsCard() {
  const supabase = createClient()
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(null)

  useEffect(() => {
    loadInvitations()
  }, [])

  const loadInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles_secure')
        .select('id, email')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) return

      // Get pending invitations - don't join user_profiles to avoid RLS issues
      const { data, error } = await supabase
        .from('team_invitations_secure')
        .select('*')
        .or(`invited_user_id.eq.${profile.id},invited_email.eq.${profile.email || user.email}`)
        .eq('status', 'pending')
        .order('invited_at', { ascending: false })

      if (error) {
        console.error('Error loading invitations:', error)
        return
      }

      // Filter out expired invitations
      const validInvitations = (data || []).filter(inv => 
        new Date(inv.expires_at) > new Date()
      )

      // Get service provider names separately
      if (validInvitations.length > 0) {
        const providerIds = [...new Set(validInvitations.map(inv => inv.service_provider_id))]
        const { data: providers } = await supabase
          .from('service_providers_secure')
          .select('id, name, phone')
          .in('id', providerIds)

        // Attach provider info to invitations
        const invitationsWithProviders = validInvitations.map(inv => ({
          ...inv,
          service_provider: providers?.find(p => p.id === inv.service_provider_id) || { name: 'Unknown Provider' }
        }))

        setInvitations(invitationsWithProviders)
      } else {
        setInvitations([])
      }

    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResponse = async (invitationId, action, providerName) => {
    const confirmMessage = action === 'accept'
      ? `Are you sure you want to join ${providerName} as a team member?`
      : `Are you sure you want to decline this invitation?`

    if (!confirm(confirmMessage)) return

    setResponding(invitationId)

    try {
      const response = await fetch('/api/team/respond-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitation_id: invitationId,
          action: action
        })
      })

      const data = await response.json()

      if (response.ok) {
        alert(action === 'accept' 
          ? `Successfully joined ${providerName}!` 
          : 'Invitation declined')
        
        // Reload invitations
        await loadInvitations()
      } else {
        alert(data.error || 'Failed to respond to invitation')
      }
    } catch (error) {
      console.error('Response error:', error)
      alert('Failed to respond to invitation')
    } finally {
      setResponding(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  if (invitations.length === 0) {
    return null // Don't show card if no invitations
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-sm p-6 border-2 border-blue-200">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-600 rounded-lg">
          <Mail className="text-white" size={24} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Team Invitations ({invitations.length})
          </h2>
          <p className="text-sm text-gray-600">
            You have pending invitations to join service provider teams
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="text-blue-600" size={20} />
                  <h3 className="font-semibold text-gray-900">
                    {invitation.service_provider?.name || 'Service Provider'}
                  </h3>
                </div>
                
                {invitation.service_provider?.phone && (
                  <p className="text-sm text-gray-600 mb-2">
                    📞 {invitation.service_provider.phone}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-2">
                  {invitation.role && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      {invitation.role}
                    </span>
                  )}
                  
                  {invitation.specialization && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded flex items-center gap-1">
                      <Award size={12} />
                      {invitation.specialization}
                    </span>
                  )}
                  
                  {invitation.experience_years > 0 && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                      {invitation.experience_years} years
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={12} />
                  Expires: {new Date(invitation.expires_at).toLocaleDateString()} at{' '}
                  {new Date(invitation.expires_at).toLocaleTimeString()}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleResponse(invitation.id, 'accept', invitation.service_provider?.name || 'this provider')}
                disabled={responding === invitation.id}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                <Check size={18} />
                {responding === invitation.id ? 'Processing...' : 'Accept'}
              </button>
              
              <button
                onClick={() => handleResponse(invitation.id, 'reject', invitation.service_provider?.name || 'this provider')}
                disabled={responding === invitation.id}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                <X size={18} />
                {responding === invitation.id ? 'Processing...' : 'Decline'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}