'use client'
import { useState, useEffect } from 'react'
import { UserPlus, Mail } from 'lucide-react'

export default function TeamPage() {
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    staffRole: 'driver',
    isAdmin: false
  })

  useEffect(() => {
    fetchTeam()
  }, [])

  const fetchTeam = async () => {
    try {
      const response = await fetch('/api/company/team/members')
      const data = await response.json()
      
      if (data.success) {
        setMembers(data.members)
        setInvitations(data.pendingInvitations)
      }
    } catch (error) {
      console.error('Error fetching team:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    try {
      const response = await fetch('/api/company/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (data.success) {
        alert('Invitation sent successfully!')
        setShowInviteForm(false)
        setFormData({ email: '', firstName: '', lastName: '', staffRole: 'driver', isAdmin: false })
        fetchTeam()
      } else {
        alert(data.error || 'Failed to send invitation')
      }
    } catch (error) {
      console.error('Error sending invitation:', error)
      alert('Failed to send invitation')
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12">Loading team...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Team Management</h1>
        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <UserPlus className="w-5 h-5" />
          Invite Member
        </button>
      </div>

      {/* Invite Form Modal */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Invite Team Member</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="First Name"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Last Name"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              />
              <select
                value={formData.staffRole}
                onChange={(e) => setFormData({ ...formData, staffRole: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="driver">Driver</option>
                <option value="fleet_manager">Fleet Manager</option>
                <option value="accountant">Accountant</option>
              </select>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isAdmin}
                  onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Make admin</span>
              </label>
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleInvite}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Send Invitation
                </button>
                <button
                  onClick={() => setShowInviteForm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium mb-2">Pending Invitations ({invitations.length})</h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-yellow-600" />
                <span>{inv.invitee_email} - {inv.staff_role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Team Members ({members.length})</h2>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">
                    {member.user?.first_name} {member.user?.last_name}
                    {member.is_admin && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600">{member.user?.email}</p>
                  <p className="text-xs text-gray-500">{member.staff_role}</p>
                </div>
                <div className="flex gap-2">
                  <button className="text-sm text-blue-600 hover:underline">Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}