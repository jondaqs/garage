'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  CheckCircleIcon, 
  XCircleIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'
import { sendCompanyApprovalEmail } from '@/lib/email/sendCompanyInviteEmail'

export default function CompanyDetailPage({ params }) {
  const router = useRouter()
  const [company, setCompany] = useState(null)
  const [documents, setDocuments] = useState([])
  const [owner, setOwner] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)

  useEffect(() => {
    fetchCompanyDetails()
  }, [])

  const fetchCompanyDetails = async () => {
    const supabase = createClient()
    
    try {
      const resolvedParams = await params
      const companyId = resolvedParams.id

      // Fetch company profile
      const { data: companyData, error: companyError } = await supabase
        .from('company_profiles')
        .select('*')
        .eq('id', companyId)
        .single()

      if (companyError) throw companyError

      setCompany(companyData)

      // Fetch owner profile
      if (companyData.owner_user_id) {
        const { data: ownerData } = await supabase
          .from('user_profiles')
          .select('*, auth_user:auth.users(email)')
          .eq('id', companyData.owner_user_id)
          .single()

        setOwner(ownerData)
      }

      // Fetch documents
      const { data: docsData } = await supabase
        .from('company_documents')
        .select('*')
        .eq('company_id', companyId)

      setDocuments(docsData || [])

    } catch (error) {
      console.error('Error fetching company details:', error)
      alert('Failed to load company details')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!confirm('Are you sure you want to approve this company?')) return

    setProcessing(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Update company status to active
      const { error: updateError } = await supabase
        .from('company_profiles')
        .update({
          status: 'active',
          is_active: true,
          verified_at: new Date().toISOString(),
          verified_by: user.id
        })
        .eq('id', company.id)

      if (updateError) throw updateError

      // Send approval email to owner
      if (owner) {
        try {
          await sendCompanyApprovalEmail({
            ownerEmail: owner.auth_user?.email || owner.email,
            ownerName: `${owner.first_name} ${owner.last_name}`,
            companyName: company.name,
            companyId: company.id
          })
        } catch (emailError) {
          console.error('Email error:', emailError)
          // Don't fail approval if email fails
        }
      }

      // Create notification for owner
      await supabase.from('notifications').insert([{
        user_id: company.owner_user_id,
        title: 'Company Approved!',
        message: `Your company ${company.name} has been approved and is now active.`,
        type: 'company_approval',
        reference_id: company.id
      }])

      alert('Company approved successfully!')
      router.push('/admin/companies')

    } catch (error) {
      console.error('Approval error:', error)
      alert(`Failed to approve company: ${error.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection')
      return
    }

    setProcessing(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Update company status to rejected
      const { error: updateError } = await supabase
        .from('company_profiles')
        .update({
          status: 'rejected',
          is_active: false,
          verified_by: user.id
        })
        .eq('id', company.id)

      if (updateError) throw updateError

      // Create notification for owner
      await supabase.from('notifications').insert([{
        user_id: company.owner_user_id,
        title: 'Company Registration Rejected',
        message: `Your company registration was rejected. Reason: ${rejectionReason}`,
        type: 'company_rejection',
        reference_id: company.id
      }])

      alert('Company rejected')
      router.push('/admin/companies')

    } catch (error) {
      console.error('Rejection error:', error)
      alert(`Failed to reject company: ${error.message}`)
    } finally {
      setProcessing(false)
      setShowRejectModal(false)
    }
  }

  const handleRequestInfo = async () => {
    const additionalInfo = prompt('What additional information is needed?')
    if (!additionalInfo) return

    setProcessing(true)
    const supabase = createClient()

    try {
      // Update status to pending_info
      const { error: updateError } = await supabase
        .from('company_profiles')
        .update({ status: 'pending_info' })
        .eq('id', company.id)

      if (updateError) throw updateError

      // Create notification
      await supabase.from('notifications').insert([{
        user_id: company.owner_user_id,
        title: 'Additional Information Required',
        message: `Please provide: ${additionalInfo}`,
        type: 'company_info_request',
        reference_id: company.id
      }])

      alert('Information request sent')
      fetchCompanyDetails()

    } catch (error) {
      console.error('Request info error:', error)
      alert('Failed to request information')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading company details...</div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Company not found</p>
        <Link href="/admin/companies" className="text-blue-600 hover:underline mt-4 inline-block">
          Back to Companies
        </Link>
      </div>
    )
  }

  const getStatusColor = (status) => {
    const colors = {
      'pending_verification': 'yellow',
      'active': 'green',
      'rejected': 'red',
      'pending_info': 'orange',
      'suspended': 'gray'
    }
    return colors[status] || 'gray'
  }

  const statusColor = getStatusColor(company.status)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/admin/companies"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Back to Companies
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
            <p className="text-gray-600 mt-1">Registration Review</p>
          </div>
          <div className={`px-4 py-2 bg-${statusColor}-100 text-${statusColor}-800 rounded-full font-medium`}>
            {company.status.replace('_', ' ').toUpperCase()}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {company.status === 'pending_verification' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-900 font-medium mb-4">Review this company registration:</p>
          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={processing}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
            >
              <CheckCircleIcon className="w-5 h-5" />
              Approve Company
            </button>
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={processing}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
            >
              <XCircleIcon className="w-5 h-5" />
              Reject
            </button>
            <button
              onClick={handleRequestInfo}
              disabled={processing}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:bg-gray-100"
            >
              Request More Info
            </button>
          </div>
        </div>
      )}

      {/* Company Information Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Company Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Company Information</h2>
          </div>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-600">Legal Name</dt>
              <dd className="font-medium">{company.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Registration Number</dt>
              <dd className="font-medium">{company.registration_number || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Tax ID / KRA PIN</dt>
              <dd className="font-medium">{company.tax_id || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Industry Type</dt>
              <dd className="font-medium">{company.industry_type || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Company Size</dt>
              <dd className="font-medium">{company.company_size || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Years in Operation</dt>
              <dd className="font-medium">{company.years_in_operation || 'N/A'}</dd>
            </div>
          </dl>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserGroupIcon className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Contact Information</h2>
          </div>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-600">Owner</dt>
              <dd className="font-medium">
                {owner ? `${owner.first_name} ${owner.last_name}` : 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Email</dt>
              <dd className="font-medium">{owner?.auth_user?.email || owner?.email || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Phone</dt>
              <dd className="font-medium">{company.phone || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Website</dt>
              <dd className="font-medium">
                {company.website ? (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {company.website}
                  </a>
                ) : 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Address</dt>
              <dd className="font-medium">
                {company.address ? `${company.address}, ${company.city}, ${company.country}` : 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Operating Hours</dt>
              <dd className="font-medium">
                {company.opening_time && company.closing_time 
                  ? `${company.opening_time} - ${company.closing_time}`
                  : 'N/A'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Company Description */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Company Description</h2>
        <p className="text-gray-700 whitespace-pre-wrap">{company.bio || 'No description provided'}</p>
      </div>

      {/* Documents */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <DocumentTextIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Uploaded Documents</h2>
        </div>
        
        {documents.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No documents uploaded</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <div key={doc.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{doc.document_type.replace(/_/g, ' ').toUpperCase()}</h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    doc.is_verified 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {doc.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{doc.file_name}</p>
                <a
                  href={doc.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  View Document →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registration Timeline */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Registration Timeline</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
            <div>
              <p className="font-medium">Submitted</p>
              <p className="text-sm text-gray-600">
                {company.submitted_at ? new Date(company.submitted_at).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>
          {company.verified_at && (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              <div>
                <p className="font-medium">Verified</p>
                <p className="text-sm text-gray-600">
                  {new Date(company.verified_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <div>
              <p className="font-medium">Created</p>
              <p className="text-sm text-gray-600">
                {new Date(company.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Reject Company Registration</h2>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejecting this company registration:
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg mb-4"
              rows={4}
              placeholder="Enter rejection reason..."
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={processing || !rejectionReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                {processing ? 'Processing...' : 'Confirm Rejection'}
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectionReason('')
                }}
                disabled={processing}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}