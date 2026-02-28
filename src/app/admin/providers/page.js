'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock, CheckCircle, XCircle, Eye, FileText, Download, Image } from 'lucide-react'

export default function PendingProvidersPage() {
  const router = useRouter()
  const supabase = createClient()
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [providerDocuments, setProviderDocuments] = useState([])
  const [loadingDocuments, setLoadingDocuments] = useState(false)
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
    
    // Load provider documents
    setLoadingDocuments(true)
    try {
      const { data: docs, error } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('uploader_user_id', provider.owner_user_id)
        .eq('reference_type', 'provider_document')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProviderDocuments(docs || [])
    } catch (error) {
      console.error('Error loading documents:', error)
      setProviderDocuments([])
    } finally {
      setLoadingDocuments(false)
    }
  }

  const downloadDocument = async (doc) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.storage_path)

      if (error) throw error

      // Create download link
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download document. Please try again.')
    }
  }

  const viewDocument = async (doc) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 3600) // 1 hour expiry

      if (error) throw error
      
      // Open in new tab
      window.open(data.signedUrl, '_blank')
    } catch (error) {
      console.error('View error:', error)
      alert('Failed to view document. Please try again.')
    }
  }

  const getDocumentTypeLabel = (fileName) => {
    const name = fileName.toLowerCase()
    if (name.includes('business_license') || name.includes('registration')) return 'Business License'
    if (name.includes('tax') || name.includes('kra')) return 'Tax Compliance'
    if (name.includes('insurance')) return 'Insurance'
    if (name.includes('id') || name.includes('passport')) return 'ID/Passport'
    return 'Other Document'
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
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

      {/* Detail Modal with Documents */}
      {showModal && selectedProvider && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">{selectedProvider.name}</h2>
              <p className="text-gray-600 mt-1">Review application details and documents</p>
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

              {/* Documents Section */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <FileText size={20} />
                  Uploaded Documents
                </h3>
                {loadingDocuments ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : providerDocuments.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <FileText className="mx-auto text-gray-400 mb-2" size={40} />
                    <p className="text-gray-500">No documents uploaded</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {providerDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-shrink-0">
                              {doc.file_type === 'application/pdf' ? (
                                <FileText className="text-red-600" size={32} />
                              ) : (
                                <Image className="text-blue-600" size={32} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-gray-900 truncate">
                                  {doc.file_name}
                                </p>
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                  {getDocumentTypeLabel(doc.file_name)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-500">
                                {formatFileSize(doc.file_size)} • Uploaded {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => viewDocument(doc)}
                              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition flex items-center gap-1"
                              title="View document"
                            >
                              <Eye size={16} />
                              View
                            </button>
                            <button
                              onClick={() => downloadDocument(doc)}
                              className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition flex items-center gap-1"
                              title="Download document"
                            >
                              <Download size={16} />
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                  setProviderDocuments([])
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