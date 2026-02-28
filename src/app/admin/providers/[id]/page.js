'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, CheckCircle, XCircle, Store, Mail, Phone,
  MapPin, Calendar, FileText, User, AlertCircle, Loader
} from 'lucide-react'
import Link from 'next/link'

export default function ProviderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    if (params.id) {
      loadProviderDetails()
    }
  }, [params.id])

  const loadProviderDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('service_providers')
        .select(`
          *,
          owner:user_profiles!service_providers_owner_user_id_fkey(
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          provider_type:service_provider_types(
            display_name,
            code,
            description
          ),
          shops(
            id,
            name,
            description,
            county,
            town,
            street,
            latitude,
            longitude,
            opening_time,
            closing_time
          )
        `)
        .eq('id', params.id)
        .single()

      if (error) throw error
      setProvider(data)
    } catch (error) {
      console.error('Error loading provider:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!confirm('Are you sure you want to approve this provider?')) return

    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { error } = await supabase
        .from('service_providers')
        .update({
          status: 'active',
          is_active: true,
          is_verified: true,
          verified_at: new Date().toISOString(),
          verified_by: profile.id
        })
        .eq('id', params.id)

      if (error) throw error

      // Create notification for provider
      await supabase
        .from('notifications')
        .insert({
          recipient_user_id: provider.owner.id,
          notification_type: 'provider_approved',
          title: 'Application Approved!',
          message: 'Your service provider application has been approved.',
          reference_id: provider.id,
          reference_type: 'service_provider'
        })

      alert('Provider approved successfully!')
      router.push('/admin/providers/pending')
    } catch (error) {
      console.error('Error approving provider:', error)
      alert('Failed to approve provider')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason')
      return
    }

    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const { error: updateError } = await supabase
        .from('service_providers')
        .update({
          status: 'rejected',
          is_active: false
        })
        .eq('id', params.id)

      if (updateError) throw updateError

      const { error: rejectError } = await supabase
        .from('provider_rejections')
        .insert({
          service_provider_id: params.id,
          rejected_by: profile.id,
          rejection_reason: rejectionReason
        })

      if (rejectError) throw rejectError

      alert('Provider rejected')
      router.push('/admin/providers/pending')
    } catch (error) {
      console.error('Error rejecting provider:', error)
      alert('Failed to reject provider')
    } finally {
      setActionLoading(false)
      setShowRejectModal(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!provider) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Provider not found</h3>
        <Link href="/admin/providers/pending" className="text-indigo-600 hover:text-indigo-500 mt-4 inline-block">
          ← Back to providers
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/providers/pending"
          className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to applications
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{provider.name}</h1>
            <p className="text-gray-600 mt-1">{provider.provider_type?.display_name}</p>
          </div>
        </div>
      </div>

      {provider.status === 'pending_verification' && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Actions</h3>
          <div className="flex space-x-4">
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-lg text-base font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition"
            >
              {actionLoading ? <Loader className="animate-spin h-5 w-5 mr-2" /> : <CheckCircle className="h-5 w-5 mr-2" />}
              Approve Provider
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={actionLoading}
              className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-transparent rounded-lg text-base font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition"
            >
              <XCircle className="h-5 w-5 mr-2" />
              Reject Application
            </button>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Information</h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm font-medium text-gray-500">Business Name</dt>
            <dd className="mt-1 text-sm text-gray-900">{provider.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Registration Number</dt>
            <dd className="mt-1 text-sm text-gray-900">{provider.registration_number || 'Not provided'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Tax ID (KRA PIN)</dt>
            <dd className="mt-1 text-sm text-gray-900">{provider.tax_id || 'Not provided'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Owner</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {provider.owner?.first_name} {provider.owner?.last_name} ({provider.owner?.email})
            </dd>
          </div>
        </dl>
      </div>

      {showRejectModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Application</h3>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Enter rejection reason..."
            />
            <div className="flex space-x-3 mt-4">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectionReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
