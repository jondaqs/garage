'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle, XCircle, FileText, Building2,
  Users, ArrowLeft, Truck, Clock, AlertCircle,
  ExternalLink, Mail, Phone, Globe, MapPin, AlertTriangle,
  History,
} from 'lucide-react'
import { sendCompanyApprovalEmail } from '@/lib/email/sendCompanyInviteEmail'

const TABS = ['Overview', 'Documents', 'Team Members', 'Fleet', 'Change History']

// Human-readable labels for fields tracked in company_change_history.
const FIELD_LABELS = {
  name:                'Company Name',
  bio:                 'Description',
  phone:               'Phone',
  website:             'Website',
  registration_number: 'Registration Number',
  tax_id:              'Tax ID (KRA PIN)',
  industry:            'Industry',
  company_size:        'Company Size',
  physical_address:    'Physical Address',
  city:                'City',
  country:             'Country',
  years_in_operation:  'Years in Operation',
  opening_time:        'Opening Time',
  closing_time:        'Closing Time',
  working_days:        'Working Days',
  documents:           'Documents',
}

// Document type labels — mirrors company settings Documents tab
const DOC_TYPE_LABELS = {
  certificate_of_incorporation: 'Certificate of Incorporation',
  tax_compliance:               'KRA PIN / Tax Compliance',
  cr12:                         'CR12 / CR2 — Company Registry Extract',
  id_passport:                  'Director ID / Passport Copy',
}

const DOC_ACTION_STYLES = {
  uploaded: { label: 'Uploaded', cls: 'bg-green-100  text-green-800' },
  replaced: { label: 'Replaced', cls: 'bg-blue-100   text-blue-800'  },
  deleted:  { label: 'Deleted',  cls: 'bg-red-100    text-red-800'   },
}

// Renders a single row in the diff table for the `documents` field.
function DocumentsDiffRow({ entries, compact = false }) {
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) return null

  const pad = compact ? 'py-1.5 pr-3' : 'px-4 py-2'
  return (
    <tr>
      <td className={`${pad} font-medium text-gray-900 align-top w-44`}>
        Documents
      </td>
      <td className={`${pad} align-top`} colSpan={2}>
        <ul className="space-y-1.5">
          {list.map((entry, i) => {
            const style = DOC_ACTION_STYLES[entry.action] || { label: entry.action, cls: 'bg-gray-100 text-gray-700' }
            return (
              <li key={i} className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded ${style.cls}`}>
                  {style.label}
                </span>
                <span className="text-sm text-gray-900">
                  {DOC_TYPE_LABELS[entry.doc_type] || entry.doc_type}
                </span>
                {entry.file_name && (
                  <span className="text-xs text-gray-500 break-all">— {entry.file_name}</span>
                )}
              </li>
            )
          })}
        </ul>
      </td>
    </tr>
  )
}

export default function CompanyDetailPage({ params }) {
  const router = useRouter()
  const [company, setCompany] = useState(null)
  const [owner, setOwner] = useState(null)
  const [documents, setDocuments] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [activeMembers, setActiveMembers] = useState([])
  const [fleet, setFleet] = useState([])
  const [history, setHistory] = useState([])
  const [pendingDiff, setPendingDiff] = useState(null)
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
        .from('company_profiles_secure')
        .select('*, owner:user_profiles_secure!company_profiles_owner_user_id_fkey(id, first_name, last_name, phone, email)')
        .eq('id', companyId)
        .single()

      if (companyError) throw companyError
      setCompany(companyData)

      // Owner is embedded in the company query above
      setOwner(companyData.owner || null)

      // ── Documents — from uploaded_files ──
      const { data: docsData } = await supabase
        .from('uploaded_files')
        .select('id, file_name, file_type, file_size, storage_path, storage_bucket, created_at, metadata')
        .eq('reference_type', 'company_document')
        .eq('reference_id', companyId)
        .order('created_at', { ascending: true })

      // Build signed URLs
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

      // ── Team members — two sources ──
      const { data: invitationsData } = await supabase
        .from('company_invitations_secure')
        .select('id, first_name, last_name, email, phone, staff_role, is_admin, status, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
      setTeamMembers(invitationsData || [])

      const { data: membersData } = await supabase
        .from('company_users')
        .select(`
          id, staff_role, is_admin, is_active, created_at,
          user:user_profiles_secure!company_users_user_id_fkey(
            id, first_name, last_name, email, phone
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
      setActiveMembers(membersData || [])

      // ── Fleet ──
      const { data: ownershipData } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id, vehicles_secure(id, plate_number, make, model, year_of_manufacture, color, vin)')
        .eq('owner_company_id', companyId)
      setFleet((ownershipData || []).map(o => o.vehicles).filter(Boolean))

      // ── Change history ──
      const { data: historyData } = await supabase
        .from('company_change_history')
        .select('id, changed_fields, previous_status, new_status, is_reverification, verified_at_snapshot, changed_at')
        .eq('company_id', companyId)
        .order('changed_at', { ascending: false })
      setHistory(historyData || [])

      // Aggregate ALL history entries since last approval into one merged diff
      // so the banner shows every document + field change, not just the latest row.
      if (companyData.status === 'pending_verification' && historyData?.length > 0) {
        const verifiedAt = companyData.verified_at
        const pendingEntries = verifiedAt
          ? historyData.filter(h => new Date(h.changed_at) > new Date(verifiedAt))
          : historyData

        if (pendingEntries.length > 0) {
          // Merge changed_fields — process chronologically (oldest first)
          // so the earliest "old" and the latest "new" are preserved for scalars.
          const mergedFields = {}
          const chronological = [...pendingEntries].reverse()
          for (const entry of chronological) {
            const fields = entry.changed_fields || {}
            for (const [field, value] of Object.entries(fields)) {
              if (field === 'documents') {
                // Accumulate all document changes into one array
                mergedFields.documents = [
                  ...(mergedFields.documents || []),
                  ...(Array.isArray(value) ? value : []),
                ]
              } else {
                // For scalar fields keep the oldest 'old' and latest 'new'
                if (mergedFields[field]) {
                  mergedFields[field] = { old: mergedFields[field].old, new: value.new }
                } else {
                  mergedFields[field] = value
                }
              }
            }
          }

          setPendingDiff({
            ...pendingEntries[0],                   // most recent entry's metadata
            changed_fields:   mergedFields,
            is_reverification: pendingEntries.some(e => e.is_reverification),
          })
        }
      }

    } catch (error) {
      console.error('Error fetching company details:', error)
      alert('Failed to load company details')
    } finally {
      setLoading(false)
    }
  }

  // ── Display value helper ──────────────────────────────────────────────────
  const displayValue = (field, value) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-300 italic">empty</span>
    }
    // working_days is an array — render as comma-separated
    if (field === 'working_days' && Array.isArray(value)) {
      return value.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ') || <span className="text-gray-300 italic">none</span>
    }
    const s = String(value)
    if (s.length > 100) return <span title={s}>{s.slice(0, 100)}…</span>
    return s
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!confirm('Approve this company registration?')) return
    setProcessing(true)
    const supabase = createClient()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: adminProfile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

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

      // Log admin action
      await supabase.from('admin_action_logs').insert({
        admin_user_id: adminProfile.id,
        action_type:   'approve_company',
        target_type:   'company',
        target_id:     company.id,
      })

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

      // Notify pending invited team members
      try {
        const { data: pendingInvites } = await supabase
          .from('company_invitations_secure')
          .select('id, email, first_name, last_name, invitation_token, invitee_user_id')
          .eq('company_id', company.id)
          .eq('status', 'pending')

        if (pendingInvites && pendingInvites.length > 0) {
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

      // Send approval email
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
      const { data: adminProfile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

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

      // Log admin action
      await supabase.from('admin_action_logs').insert({
        admin_user_id: adminProfile.id,
        action_type:   'reject_company',
        target_type:   'company',
        target_id:     company.id,
        action_data:   { reason: rejectionReason },
      })

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
      const { data: { user } } = await supabase.auth.getUser()
      const { data: adminProfile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

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

      // Log admin action
      await supabase.from('admin_action_logs').insert({
        admin_user_id: adminProfile.id,
        action_type:   'request_info_company',
        target_type:   'company',
        target_id:     company.id,
        action_data:   { info_requested: additionalInfo },
      })

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
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <StatusBadge status={company.status} />
              {company.registration_number && (
                <span className="text-sm text-gray-500">Reg: {company.registration_number}</span>
              )}
              {pendingDiff?.is_reverification && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                  Re-verification
                </span>
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

      {/* Personal email warning */}
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

      {/* ── Pending diff summary (like provider admin page) ── */}
      {pendingDiff && isPending && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-900">
              {pendingDiff.is_reverification ? (
                <>
                  {(() => {
                    const f = pendingDiff.changed_fields || {}
                    const scalarCount = Object.keys(f).filter(k => k !== 'documents').length
                    const docCount    = Array.isArray(f.documents) ? f.documents.length : 0
                    const parts = []
                    if (scalarCount) parts.push(`${scalarCount} field${scalarCount === 1 ? '' : 's'}`)
                    if (docCount)    parts.push(`${docCount} document${docCount === 1 ? '' : 's'}`)
                    return parts.length ? `Owner updated ${parts.join(' + ')}` : 'Owner submitted changes'
                  })()}
                  {pendingDiff.verified_at_snapshot && (
                    <> since last approval on {new Date(pendingDiff.verified_at_snapshot).toLocaleDateString()}</>
                  )}
                  . Review the changes below before approving.
                </>
              ) : (
                <>Submitted {new Date(pendingDiff.changed_at).toLocaleString()}.</>
              )}
            </p>
          </div>

          <div className="bg-white rounded-md border border-yellow-200 overflow-hidden mx-3 mb-3">
            <table className="min-w-full divide-y divide-yellow-100 text-sm">
              <thead className="bg-yellow-100/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-yellow-900 uppercase tracking-wider">Field</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-yellow-900 uppercase tracking-wider" colSpan="2">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-50">
                {Object.entries(pendingDiff.changed_fields || {}).map(([field, value]) => (
                  field === 'documents'
                    ? <DocumentsDiffRow key={field} entries={value} />
                    : (
                      <tr key={field}>
                        <td className="px-4 py-2 font-medium text-gray-900 align-top w-44">{FIELD_LABELS[field] || field}</td>
                        <td className="px-4 py-2 text-gray-500 line-through decoration-red-300 align-top">
                          {displayValue(field, value?.old)}
                        </td>
                        <td className="px-4 py-2 text-green-700 font-medium align-top">
                          {displayValue(field, value?.new)}
                        </td>
                      </tr>
                    )
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0 flex-wrap">
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
                  {activeMembers.length + teamMembers.length}
                </span>
              )}
              {tab === 'Fleet' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {fleet.length}
                </span>
              )}
              {tab === 'Change History' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {history.length}
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
        <div className="space-y-5">

          {/* Active members */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold">Active Members</h2>
              <span className="text-xs text-gray-500">({activeMembers.length})</span>
            </div>

            {activeMembers.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">
                No active members yet
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Email', 'Phone', 'Role', 'Admin', 'Status'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">
                        {member.user
                          ? `${member.user.first_name || ''} ${member.user.last_name || ''}`.trim() || '—'
                          : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{member.user?.email || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-500">{member.user?.phone || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700 capitalize">{member.staff_role || '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">
                        {member.is_admin
                          ? <span className="text-blue-600 font-medium">Yes</span>
                          : 'No'}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          member.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Invitations */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" />
              <h2 className="text-base font-semibold">Invitations</h2>
              <span className="text-xs text-gray-500">({teamMembers.length})</span>
            </div>

            {teamMembers.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">
                No invitations sent
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
                        {member.is_admin
                          ? <span className="text-blue-600 font-medium">Yes</span>
                          : 'No'}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          member.status === 'accepted' ? 'bg-green-100 text-green-800' :
                          member.status === 'pending'  ? 'bg-yellow-100 text-yellow-800' :
                          member.status === 'rejected' ? 'bg-red-100 text-red-800' :
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

      {/* ── CHANGE HISTORY TAB ── */}
      {activeTab === 'Change History' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">Change History</h2>
            <span className="text-xs text-gray-500">({history.length})</span>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No recorded changes yet. Changes will appear here whenever the owner updates their company profile or documents.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map((entry) => (
                <div key={entry.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(entry.changed_at).toLocaleString()}
                      </span>
                      {entry.is_reverification && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                          Re-verification
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {(() => {
                        const fields = entry.changed_fields || {}
                        const scalarCount = Object.keys(fields).filter(k => k !== 'documents').length
                        const docCount    = Array.isArray(fields.documents) ? fields.documents.length : 0
                        const parts = []
                        if (scalarCount) parts.push(`${scalarCount} field${scalarCount === 1 ? '' : 's'}`)
                        if (docCount)    parts.push(`${docCount} document${docCount === 1 ? '' : 's'}`)
                        return parts.length ? parts.join(' + ') + ' changed' : 'no field changes'
                      })()}
                      {entry.previous_status !== entry.new_status && (() => {
                        const prev = entry.previous_status
                        const next = entry.new_status
                        // Standard re-verification cycle — the "Re-verification" badge
                        // already communicates this; suppress the raw status arrow.
                        if (next === 'pending_verification' && (prev === 'active' || prev === 'pending_verification')) {
                          return null
                        }
                        return (
                          <> · status: {prev?.replace(/_/g, ' ')} → {next?.replace(/_/g, ' ')}</>
                        )
                      })()}
                    </span>
                  </div>
                  <table className="min-w-full text-xs mt-2">
                    <tbody className="divide-y divide-gray-50">
                      {Object.entries(entry.changed_fields || {}).map(([field, value]) => (
                        field === 'documents'
                          ? <DocumentsDiffRow key={field} entries={value} compact />
                          : (
                            <tr key={field}>
                              <td className="py-1.5 pr-3 font-medium text-gray-700 align-top w-40">
                                {FIELD_LABELS[field] || field}
                              </td>
                              <td className="py-1.5 pr-3 text-gray-500 line-through decoration-red-300 align-top">
                                {displayValue(field, value?.old)}
                              </td>
                              <td className="py-1.5 text-green-700 align-top">
                                {displayValue(field, value?.new)}
                              </td>
                            </tr>
                          )
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
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