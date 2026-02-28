'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock, CheckCircle, XCircle, Eye, FileText, MapPin } from 'lucide-react'

export default function PendingProvidersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    loadPendingProviders()
  }, [])

  const loadPendingProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('service_providers')
        .select(`
          *,
          owner:user_profiles(first_name, last_name, email, phone),
          provider_type:service_provider_types(display_name),
          shops(*)
        `)
        .eq('status', 'pending_verification')
        .order('submitted_at', { ascending: false })

      if (error) throw error
      setProviders(data || [])
    } catch (error) {
      console.error('Error loading providers:', error)
    } finally {
      setLoading(false)
    }
  }

  const viewDetails = async (provider) => {
    setSelectedProvider(provider)
    setShowModal(true)
  }

  const approveProvider = async (providerId) => {
    if (!confirm('Are you sure you want to approve this provider?')) return

    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: adminProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // Update provider status
      const { error } = await supabase
        .from('service_providers')
        .update({
          status: 'active',
          is_active: true,
          is_verified: true,
          verified_at: new Date().toISOString(),
          verified_by: adminProfile.id
        })
        .eq('id', providerId)

      if (error) throw error

      // Log admin action
      await supabase
        .from('admin_action_logs')
        .insert({
          admin_user_id: adminProfile.id,
          action_type: 'approve_provider',
          target_type: 'service_provider',
          target_id: providerId
        })

      // Send notification to provider
      const provider = providers.find(p => p.id === providerId)
      await supabase
        .from('notifications')
        .insert({
          recipient_user_id: provider.owner_user_id,
          notification_type: 'provider_approved',
          title: 'Registration Approved!',
          message: 'Your service provider registration has been approved. You can now start accepting bookings.',
          reference_id: providerId,
          reference_type: 'service_provider'
        })

      alert('Provider approved successfully!')
      setShowModal(false)
      loadPendingProviders()
    } catch (error) {
      console.error('Error approving provider:', error)
      alert('Failed to approve provider: ' + error.message)
    } finally {
      setActionLoading(false)
    }
  }

  const rejectProvider = async (providerId) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason')
      return
    }

    if (!confirm('Are you sure you want to reject this provider?')) return

    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: adminProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // Update provider status
      const { error } = await supabase
        .from('service_providers')
        .update({
          status: 'rejected'
        })
        .eq('id', providerId)

      if (error) throw error

      // Create rejection record
      await supabase
        .from('provider_rejections')
        .insert({
          service_provider_id: providerId,
          rejected_by: adminProfile.id,
          rejection_reason: rejectionReason,
          can_reapply: true
        })

      // Log admin action
      await supabase
        .from('admin_action_logs')
        .insert({
          admin_user_id: adminProfile.id,
          action_type: 'reject_provider',
          target_type: 'service_provider',
          target_id: providerId,
          action_data: { reason: rejectionReason }
        })

      // Send notification
      const provider = providers.find(p => p.id === providerId)
      await supabase
        .from('notifications')
        .insert({
          recipient_user_id: provider.owner_user_id,
          notification_type: 'provider_rejected',
          title: 'Registration Not Approved',
          message: `Your application was not approved. Reason: ${rejectionReason}. You can reapply after addressing the issues.`,
          reference_id: providerId,
          reference_type: 'service_provider'
        })

      alert('Provider rejected')
      setShowModal(false)
      setRejectionReason('')
      loadPendingProviders()
    } catch (error) {
      console.error('Error rejecting provider:', error)
      alert('Failed to reject provider: ' + error.message)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Pending Provider Registrations</h1>
        <p className="text-gray-600 mt-1">{providers.length} applications awaiting review</p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {providers.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                  No pending providers
                </td>
              </tr>
            ) : (
              providers.map((provider) => (
                <tr key={provider.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{provider.name}</div>
                    <div className="text-sm text-gray-500">{provider.registration_number}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{provider.owner?.first_name} {provider.owner?.last_name}</div>
                    <div className="text-sm text-gray-500">{provider.owner?.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {provider.provider_type?.display_name}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(provider.submitted_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => viewDetails(provider)}
                      className="text-blue-600 hover:text-blue-900 font-medium"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {showModal && selectedProvider && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedProvider.name}</h2>
              <p className="text-gray-600 mt-1">Review application details</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Business Info */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Business Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Registration Number</label>
                    <p className="font-medium">{selectedProvider.registration_number || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Tax ID</label>
                    <p className="font-medium">{selectedProvider.tax_id || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Years in Operation</label>
                    <p className="font-medium">{selectedProvider.years_in_operation || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Type</label>
                    <p className="font-medium">{selectedProvider.provider_type?.display_name}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-sm text-gray-500">Description</label>
                  <p className="text-gray-700">{selectedProvider.description || 'No description provided'}</p>
                </div>
              </div>

              {/* Owner Info */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Owner Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Name</label>
                    <p className="font-medium">{selectedProvider.owner?.first_name} {selectedProvider.owner?.last_name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Email</label>
                    <p className="font-medium">{selectedProvider.owner?.email}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Phone</label>
                    <p className="font-medium">{selectedProvider.owner?.phone || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Rejection Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason (if rejecting)
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Provide a detailed reason for rejection..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowModal(false)
                  setRejectionReason('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={actionLoading}
              >
                Close
              </button>
              <button
                onClick={() => rejectProvider(selectedProvider.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'Reject'}
              </button>
              <button
                onClick={() => approveProvider(selectedProvider.id)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
