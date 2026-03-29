'use client'
import { useState } from 'react'

export default function TeamMembersStep({ data, updateData, nextStep, previousStep }) {
  const [teamMembers, setTeamMembers] = useState(data?.teamMembers || [])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    staffRole: 'driver',
    isAdmin: false
  })

  const addMember = () => {
    if (!formData.email || !formData.firstName || !formData.lastName) {
      alert('Please fill all required fields')
      return
    }

    setTeamMembers([...teamMembers, { ...formData }])
    setFormData({ email: '', firstName: '', lastName: '', staffRole: 'driver', isAdmin: false })
    setShowForm(false)
  }

  const removeMember = (index) => {
    setTeamMembers(teamMembers.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    updateData({ teamMembers })
    nextStep()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Add Team Members</h2>
      <p className="text-gray-600 mb-6">
        Invite team members to join your company (Optional - you can do this later)
      </p>

      {teamMembers.length > 0 && (
        <div className="mb-6 space-y-3">
          {teamMembers.map((member, index) => (
            <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">{member.firstName} {member.lastName}</p>
                <p className="text-sm text-gray-600">{member.email}</p>
                <p className="text-xs text-gray-500">
                  {member.staffRole} {member.isAdmin && '• Admin'}
                </p>
              </div>
              <button
                onClick={() => removeMember(index)}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600"
        >
          + Add Team Member
        </button>
      ) : (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="First Name *"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="px-4 py-2 border rounded-lg"
            />
            <input
              type="text"
              placeholder="Last Name *"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="px-4 py-2 border rounded-lg"
            />
          </div>
          <input
            type="email"
            placeholder="Email Address *"
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
            <option value="mechanic">Mechanic</option>
            <option value="accountant">Accountant</option>
            <option value="other">Other</option>
          </select>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isAdmin}
              onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm">Make this user a company admin</span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={addMember}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Member
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-6 mt-6 border-t">
        <button
          onClick={previousStep}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {teamMembers.length > 0 ? 'Continue' : 'Skip for Now'}
        </button>
      </div>
    </div>
  )
}