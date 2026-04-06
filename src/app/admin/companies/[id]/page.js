'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle, XCircle, FileText, Building2,
  Users, ArrowLeft, Truck, Clock, AlertCircle,
  ExternalLink, Mail, Phone, Globe, MapPin, AlertTriangle
} from 'lucide-react'
import { sendCompanyApprovalEmail } from '@/lib/email/sendCompanyInviteEmail'

const TABS = ['Overview', 'Documents', 'Team Members', 'Fleet']

export default function CompanyDetailPage({ params }) {
  const router = useRouter()
  const [company, setCompany] = useState(null)
  const [owner, setOwner] = useState(null)
  const [documents, setDocuments] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [fleet, setFleet] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [activeTab, setActiveTab] = useState('Overview')

  useEffect(() => {
    fetchCompanyDetails()
  }, [])

  const fetchCompanyDetails = async () => {
    const supabase = createClient()
    try {
      const resolvedParams = await params
      const companyId = resolvedParams.id

      // ── Company profile ──
      const { data: companyData, error: companyError } = await supabase
        .from('company_profiles')
        .select('*, owner:user_profiles!company_profiles_owner_user_id_fkey(id, first_name, last_name, phone, email)')
        .eq('id', companyId)
        .single()

      if (companyError) throw companyError
      setCompany(companyData)

      // Owner is embedded in the company query above
      setOwner(companyData.owner || null)

      // ── Documents — from uploaded_files (fix 0.6) ──
      const { data: docsData } = await supabase
        .from('uploaded_files')
        .select('id, file_name, file_type, file_size, storage_path, storage_bucket, created_at, metadata')
        .eq('reference_type', 'company_document')
        .eq('reference_id', companyId)
        .order('created_at', { ascending: true })

      // Build signed URLs — bucket is private, matches provider document pattern
      const docsWithUrls = await Promise.all(
        (docsData || []).map(async (file) => {
          const { data: signedData, error: signedError } = await supabase
            .storage
            .from(file.storage_bucket || 'documents')
            .createSignedUrl(file.storage_path, 3600)
          return { ...file, publicUrl: signedError ? null : signedData.signedUrl }
        })
      )
      setDocuments(docsWithUrls)

      // ── Team members (invitations) ──
      const { data: invitationsData } = await supabase
        .from('company_invitations')
        .select('id, first_name, last_name, email, phone, staff_role, is_admin, status, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
      setTeamMembers(invitationsData || [])

      // ── Fleet ──
      const { data: ownershipData } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id, vehicles(id, plate_number, make, model, year_of_manufacture, color, vin)')
        .eq('owner_company_id', companyId)
      setFleet((ownershipData || []).map(o => o.vehicles).filter(Boolean))

    } catch (error) {
      console.error('Error fetching company details:', error)
      alert('Failed to load company details')
    } finally {
      setLoading(false)
    }
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!confirm('Approve this company registration?')) return
    setProcessing(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Use SECURITY DEFINER rpc — bypasses RLS on company_profiles
      const { data: rpcResult, error: updateError } = await supabase.rpc(
        'admin_update_company_status',
        {
          p_company_id:  company.id,
          p_status:      'active',
          p_verified_by: user.id,
        }
      )

      if (updateError) throw updateError
      if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error)

      // Notification for owner
      await supabase.from('notifications').insert([{
        user_id: company.owner_user_id,
        recipient_user_id: company.owner_user_id,
        type: 'company_approved',
        notification_type: 'company_approved',
        reference_type: 'company',
        reference_id: company.id,
        title: 'Company Registration Approved',
        message: `Congratulations! ${company.name} has been approved and is now active.`,
        is_read: false,
      }])

      // 3.6 — Notify all pending invited team members that the company is now active
      try {
        const { data: pendingInvites } = await supabase
          .from('company_invitations')
          .select('id, email, first_name, last_name, invitation_token, invitee_user_id')
          .eq('company_id', company.id)
          .eq('status', 'pending')

        if (pendingInvites && pendingInvites.length > 0) {
          // Insert in-app notification for invitees who already have accounts
          const existingUserIds = pendingInvites
            .map(i => i.invitee_user_id)
            .filter(Boolean)

          if (existingUserIds.length > 0) {
            await supabase.from('notifications').insert(
              existingUserIds.map(uid => ({
                user_id: uid,
                recipient_user_id: uid,
                type: 'company_approved',
                notification_type: 'company_approved',
                reference_type: 'company',
                reference_id: company.id,
                title: `${company.name} is now active`,
                message: `The company you were invited to join has been approved. Complete your account setup to get started.`,
                is_read: false,
              }))
            )
          }

          console.log(`✅ Notified ${pendingInvites.length} pending invitee(s)`)
        }
      } catch (inviteNotifError) {
        console.error('⚠️ Invitee notification error (non-fatal):', inviteNotifError)
      }

      // Send approval email if owner email is available
      if (owner?.email) {
        try {
          await sendCompanyApprovalEmail({
            ownerEmail: owner.email,
            ownerName: `${owner.first_name} ${owner.last_name}`,
            companyName: company.name,
            companyId: company.id,
          })
        } catch (emailError) {
          console.error('Approval email error (non-fatal):', emailError)
        }
      }

      alert('Company approved successfully')
      router.push('/admin/companies')

    } catch (error) {
      console.error('Approval error:', error)
      alert('Failed to approve company: ' + error.message)
    } finally {
      setProcessing(false)
    }
  }

  // ── Reject ───────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason')
      return
    }
    setProcessing(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: rpcResult, error: updateError } = await supabase.rpc(
        'admin_update_company_status',
        {
          p_company_id:  company.id,
          p_status:      'rejected',
          p_verified_by: user.id,
          p_extra_note:  rejectionReason,
        }
      )

      if (updateError) throw updateError
      if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error)

      await supabase.from('notifications').insert([{
        user_id: company.owner_user_id,
        recipient_user_id: company.owner_user_id,
        type: 'company_rejected',
        notification_type: 'company_rejected',
        reference_type: 'company',
        reference_id: company.id,
        title: 'Company Registration Rejected',
        message: `Your registration for ${company.name} was rejected. Reason: ${rejectionReason}`,
        is_read: false,
      }])

      alert('Company rejected')
      router.push('/admin/companies')

    } catch (error) {
      console.error('Rejection error:', error)
      alert('Failed to reject company')
    } finally {
      setProcessing(false)
      setShowRejectModal(false)
    }
  }

  // ── Request more info ─────────────────────────────────────────────────────
  const handleRequestInfo = async () => {
    if (!additionalInfo.trim()) {
      alert('Please specify what information is needed')
      return
    }
    setProcessing(true)
    const supabase = createClient()

    try {
      const { data: rpcResult, error: updateError } = await supabase.rpc(
        'admin_update_company_status',
        {
          p_company_id: company.id,
          p_status:     'pending_info',
          p_extra_note: additionalInfo,
        }
      )

      if (updateError) throw updateError
      if (rpcResult && !rpcResult.success) throw new Error(rpcResult.error)

      await supabase.from('notifications').insert([{
        user_id: company.owner_user_id,
        recipient_user_id: company.owner_user_id,
        type: 'company_info_request',
        notification_type: 'company_info_request',
        reference_type: 'company',
        reference_id: company.id,
        title: 'Additional Information Required',
        message: `Please provide the following for ${company.name}: ${additionalInfo}`,
        is_read: false,
      }])

      alert('Information request sent')
      setShowInfoModal(false)
      setAdditionalInfo('')
      fetchCompanyDetails()

    } catch (error) {
      console.error('Request info error:', error)
      alert('Failed to send information request')
    } finally {
      setProcessing(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => {
    const map = {
      pending_verification: 'bg-yellow-100 text-yellow-800',
      active:     'bg-green-100 text-green-800',
      rejected:   'bg-red-100 text-red-800',
      pending_info: 'bg-orange-100 text-orange-800',
      suspended:  'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`inline-flex items-center px-3 py-1 text-sm font-medium rounded-full ${map[status] || 'bg-gray-100 text-gray-700'}`}>
        {status?.replace(/_/g, ' ')}
      </span>
    )
  }

  const formatBytes = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!company) return null

  // ── Personal email detection ──────────────────────────────────────────────
  // Companies should register with a corporate domain, not a free email provider.
  // Flag these for the admin during review so they can ask for a business email.
  const PERSONAL_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'yahoo.co.ke', 'hotmail.com', 'outlook.com',
    'live.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
    'protonmail.com', 'zoho.com', 'yandex.com', 'mail.com',
    'gmx.com', 'inbox.com', 'fastmail.com', 'tutanota.com',
  ])

  const isPersonalEmail = (email) => {
    if (!email) return false
    const domain = email.split('@')[1]?.toLowerCase()
    return domain ? PERSONAL_DOMAINS.has(domain) : false
  }

  const ownerUsesPersonalEmail = isPersonalEmail(owner?.email)

  const isPending = company.status === 'pending_verification' || company.status === 'pending_info'

  return (
    <div className="max-w-5xl mx-auto">

      {/* Back + header */}
      <div className="mb-6">
        <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Companies
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={company.status} />
              {company.registration_number && (
                <span className="text-sm text-gray-500">Reg: {company.registration_number}</span>
              )}
            </div>
          </div>

          {/* Action buttons — only when pending */}
          {isPending && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleApprove}
                disabled={processing}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                <CheckCircle className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => setShowInfoModal(true)}
                disabled={processing}
                className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium"
              >
                <AlertCircle className="w-4 h-4" /> Request Info
              </button>
              <button
                onClick={() => setShowRejectModal(true)}
                disabled={processing}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Personal email warning — shown whenever owner used a free email provider */}
      {ownerUsesPersonalEmail && (
        <div className="flex items-start gap-3 px-4 py-3.5 mb-6 bg-red-50 border border-red-300 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Personal email detected</p>
            <p className="text-sm text-red-700 mt-0.5">
              The owner registered with <span className="font-mono font-medium">{owner?.email}</span>, which is a personal/free email address.
              Companies should use a corporate domain email. Consider requesting a business email before approving.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
              {tab === 'Documents' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {documents.length}
                </span>
              )}
              {tab === 'Team Members' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {teamMembers.length}
                </span>
              )}
              {tab === 'Fleet' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {fleet.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Company information */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold">Company Information</h2>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                { label: 'Legal Name', value: company.name },
                { label: 'Registration Number', value: company.registration_number },
                { label: 'Tax ID / KRA PIN', value: company.tax_id },
                // fix 0.9: was company.industry_type — column is industry
                { label: 'Industry', value: company.industry },
                { label: 'Company Size', value: company.company_size },
                { label: 'Years in Operation', value: company.years_in_operation },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">{label}</dt>
                  <dd className="font-medium text-gray-900 text-right">{value || <span className="text-gray-300">—</span>}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Contact information */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold">Contact Information</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Owner</dt>
                <dd className="font-medium text-gray-900">
                  {owner ? `${owner.first_name} ${owner.last_name}` : <span className="text-gray-300">—</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Mail className="w-3.5 h-3.5" /> Email</dt>
                <dd className="font-medium text-gray-900 text-right break-all">
                  {owner?.email
                    ? (
                      <span className="inline-flex items-center gap-2 flex-wrap justify-end">
                        <span>{owner.email}</span>
                        {ownerUsesPersonalEmail && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 border border-red-300 text-red-700 text-xs font-semibold rounded-full whitespace-nowrap">
                            <AlertTriangle className="w-3 h-3" /> Personal email
                          </span>
                        )}
                      </span>
                    )
                    : <span className="text-gray-300">—</span>
                  }
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Phone className="w-3.5 h-3.5" /> Phone</dt>
                <dd className="font-medium text-gray-900">{company.phone || <span className="text-gray-300">—</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Globe className="w-3.5 h-3.5" /> Website</dt>
                <dd className="font-medium">
                  {company.website
                    ? <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{company.website}</a>
                    : <span className="text-gray-300">—</span>
                  }
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                {/* fix 0.10: was company.address — column is physical_address */}
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><MapPin className="w-3.5 h-3.5" /> Address</dt>
                <dd className="font-medium text-gray-900 text-right">
                  {company.physical_address
                    ? `${company.physical_address}, ${company.city || ''}, ${company.country || ''}`
                    : <span className="text-gray-300">—</span>
                  }
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Clock className="w-3.5 h-3.5" /> Hours</dt>
                <dd className="font-medium text-gray-900">
                  {company.opening_time && company.closing_time
                    ? `${company.opening_time} – ${company.closing_time}`
                    : <span className="text-gray-300">—</span>
                  }
                </dd>
              </div>
            </dl>
          </div>

          {/* Description */}
          {company.bio && (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-base font-semibold mb-3">Company Description</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{company.bio}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="text-base font-semibold mb-4">Registration Timeline</h2>
            <div className="flex gap-8 flex-wrap text-sm">
              {[
                { label: 'Registered', value: company.created_at, color: 'bg-blue-500' },
                { label: 'Submitted', value: company.submitted_at, color: 'bg-yellow-500' },
                { label: 'Verified', value: company.verified_at, color: 'bg-green-500' },
              ].map(({ label, value, color }) => value && (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                  <div>
                    <p className="font-medium text-gray-900">{label}</p>
                    <p className="text-gray-500">{new Date(value).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── DOCUMENTS TAB ── */}
      {activeTab === 'Documents' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">Uploaded Documents</h2>
            <span className="text-xs text-gray-500">({documents.length})</span>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p>No documents uploaded for this company</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documents.map((doc) => (
                <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {doc.file_type} · {formatBytes(doc.file_size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                    {doc.publicUrl ? (
                      <a
                        href={doc.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">URL unavailable</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TEAM MEMBERS TAB ── */}
      {activeTab === 'Team Members' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">Invited Team Members</h2>
            <span className="text-xs text-gray-500">({teamMembers.length})</span>
          </div>

          {teamMembers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No team members invited during registration
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Email', 'Role', 'Admin', 'Status'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {member.first_name} {member.last_name}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">{member.email}</td>
                    <td className="px-6 py-3 text-sm text-gray-700 capitalize">{member.staff_role}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">
                      {member.is_admin ? (
                        <span className="text-blue-600 font-medium">Yes</span>
                      ) : 'No'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        member.status === 'accepted' ? 'bg-green-100 text-green-800' :
                        member.status === 'pending'  ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {member.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── FLEET TAB ── */}
      {activeTab === 'Fleet' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">Registered Fleet</h2>
            <span className="text-xs text-gray-500">({fleet.length})</span>
          </div>

          {fleet.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No vehicles registered for this company
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Plate Number', 'Make / Model', 'Year', 'Color', 'VIN'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {fleet.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{vehicle.plate_number}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{vehicle.make} {vehicle.model}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{vehicle.year_of_manufacture || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-700 capitalize">{vehicle.color || '—'}</td>
                    <td className="px-6 py-3 text-sm text-gray-500 font-mono">{vehicle.vin || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Reject Modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold mb-1">Reject Company Registration</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will notify the company owner with your reason.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
              rows={4}
              placeholder="e.g. Documents are incomplete or unreadable..."
            />
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={processing || !rejectionReason.trim()}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {processing ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
              <button
                onClick={() => { setShowRejectModal(false); setRejectionReason('') }}
                disabled={processing}
                className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Request Info Modal ── */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-bold mb-1">Request Additional Information</h2>
            <p className="text-sm text-gray-500 mb-4">
              This sets the status to "Needs Info" and notifies the company owner.
            </p>
            <textarea
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              placeholder="e.g. Please re-upload a clearer copy of the KRA PIN certificate..."
            />
            <div className="flex gap-3">
              <button
                onClick={handleRequestInfo}
                disabled={processing || !additionalInfo.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {processing ? 'Sending...' : 'Send Request'}
              </button>
              <button
                onClick={() => { setShowInfoModal(false); setAdditionalInfo('') }}
                disabled={processing}
                className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
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