'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Check, X, Clock, Users, AlertCircle } from 'lucide-react'

export default function PendingCompanyInvitationsCard() {
  const supabase = createClient()
  const [invitations, setInvitations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [responding,  setResponding]  = useState(null)
  const [error,       setError]       = useState(null)

  useEffect(() => { loadInvitations() }, [])

  const loadInvitations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // invitees_read_own_invitations policy allows reading rows
      // where email matches auth.users.email — no extra profile join needed
      const { data, error: fetchErr } = await supabase
        .from('company_invitations')
        .select(`
          id, email, first_name, last_name, staff_role,
          is_admin, status, expires_at, invitation_token,
          company:company_profiles(id, name, city, country, status)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (fetchErr) {
        console.error('Company invitations fetch error:', fetchErr)
        return
      }

      // Filter out expired ones client-side
      const now   = new Date()
      const valid = (data || []).filter(inv => new Date(inv.expires_at) > now)
      setInvitations(valid)
    } catch (err) {
      console.error('PendingCompanyInvitationsCard error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleResponse = async (invitation, action) => {
    const label = action === 'accept' ? 'join' : 'decline'
    if (!confirm(`Are you sure you want to ${label} the invitation from ${invitation.company?.name}?`)) return

    setResponding(invitation.id)
    setError(null)

    try {
      const res = await fetch('/api/company/team/respond-invitation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: invitation.invitation_token, response: action }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to respond')

      // Remove from list immediately
      setInvitations(prev => prev.filter(i => i.id !== invitation.id))

      if (action === 'accept') {
        // Brief success message then reload so sidebar company section appears
        alert(`You've joined ${invitation.company?.name}! Refreshing…`)
        window.location.reload()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setResponding(null)
    }
  }

  if (loading || invitations.length === 0) return null

  const roleLabel = (role) => {
    const map = {
      owner:         'Owner',
      fleet_manager: 'Fleet Manager',
      driver:        'Driver',
      mechanic:      'Mechanic',
      accountant:    'Accountant',
    }
    return map[role] ?? (role ? role.replace(/_/g, ' ') : 'Member')
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-blue-600 rounded-lg">
          <Building2 className="text-white" size={22} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Company Invitation{invitations.length > 1 ? 's' : ''} ({invitations.length})
          </h2>
          <p className="text-sm text-gray-500">
            You have been invited to join {invitations.length > 1 ? 'companies' : 'a company'} on GariCare
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {invitations.map(inv => (
          <div key={inv.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">

            {/* Company info */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">
                  {inv.company?.name || 'Unknown Company'}
                </h3>
                {(inv.company?.city || inv.company?.country) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[inv.company.city, inv.company.country].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Role + expiry */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                <Users className="w-3 h-3" />
                {roleLabel(inv.staff_role)}
              </span>
              {inv.is_admin && (
                <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                  Admin access
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-gray-400 ml-auto">
                <Clock className="w-3 h-3" />
                Expires {new Date(inv.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleResponse(inv, 'accept')}
                disabled={responding === inv.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
              >
                <Check size={16} />
                {responding === inv.id ? 'Processing…' : 'Accept'}
              </button>
              <button
                onClick={() => handleResponse(inv, 'reject')}
                disabled={responding === inv.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition"
              >
                <X size={16} />
                {responding === inv.id ? 'Processing…' : 'Decline'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}