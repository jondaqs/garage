'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle, XCircle, FileText, Store,
  Users, ArrowLeft, Clock, AlertCircle, AlertTriangle,
  ExternalLink, Mail, Phone, Globe, MapPin, Wrench,
  History, Calendar, DollarSign, Loader,
} from 'lucide-react'

const TABS = ['Overview', 'Documents', 'Shops', 'Services', 'Change History']

// Human-readable labels for fields we track in provider_change_history.
const FIELD_LABELS = {
  name:                'Business Name',
  email:               'Business Email',
  phone:               'Business Phone',
  description:         'Description',
  website:             'Website',
  registration_number: 'Registration Number',
  tax_id:              'Tax ID (KRA PIN)',
  provider_type_id:    'Provider Type',
  currency_id:         'Currency',
  years_in_operation:  'Years in Operation',
  documents:           'Documents',
}

// Document types mirror those in provider-registration/steps/DocumentsStep.js
// and the provider settings Documents tab. Anything else falls through as-is.
const DOC_TYPE_LABELS = {
  business_license: 'Business Registration Certificate',
  tax_compliance:   'KRA PIN / Tax Compliance',
  insurance:        'Insurance Certificate',
  id_passport:      'ID / Passport Copy',
}

const DOC_ACTION_STYLES = {
  uploaded: { label: 'Uploaded', cls: 'bg-green-100  text-green-800' },
  replaced: { label: 'Replaced', cls: 'bg-blue-100   text-blue-800'  },
  deleted:  { label: 'Deleted',  cls: 'bg-red-100    text-red-800'   },
}

// Some changed values are uuids (provider_type_id, currency_id). We resolve
// them to their display names via a lazy lookup so the diff doesn't show raw uuids.
const RESOLVABLE_FK = {
  provider_type_id: { table: 'service_provider_types', label: 'display_name' },
  currency_id:      { table: 'currencies',             label: 'display_name' },
}

// Renders a single row in the diff table for the `documents` field. Spans the
// "previous" and "new" columns because document changes don't have a simple
// "old → new" shape — each entry is { action, doc_type, file_name } and may
// be uploaded, replaced, or deleted.
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

export default function ProviderDetailPage({ params }) {
  const router   = useRouter()
  const supabase = createClient()

  const [provider,       setProvider]       = useState(null)
  const [owner,          setOwner]          = useState(null)
  const [documents,      setDocuments]      = useState([])
  const [shops,          setShops]          = useState([])
  const [services,       setServices]       = useState([])
  const [history,        setHistory]        = useState([])
  const [pendingDiff,    setPendingDiff]    = useState(null)   // most recent change_history entry while pending
  const [fkLookups,      setFkLookups]      = useState({})     // uuid -> label resolutions for diff
  const [loading,        setLoading]        = useState(true)
  const [processing,     setProcessing]     = useState(false)
  const [activeTab,      setActiveTab]      = useState('Overview')
  const [rejectionReason, setRejectionReason] = useState('')
  const [additionalInfo, setAdditionalInfo]   = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showInfoModal,   setShowInfoModal]   = useState(false)

  // Verification checklist state
  const [verChecks, setVerChecks] = useState({
    kra_pin_verified:      false,
    registration_verified: false,
    location_verified:     false,
  })
  const [savingChecks,  setSavingChecks]  = useState(false)
  const [verifierNames, setVerifierNames] = useState({})   // { kra_pin_verified_by: 'Jane Doe', ... }

  useEffect(() => { fetchProviderDetails() }, [])

  const fetchProviderDetails = async () => {
    try {
      const resolvedParams = await params
      const providerId     = resolvedParams.id

      // ── Provider profile ──
      // Be explicit about the columns — relying on `select(*)` together with
      // aliased nested selects has bitten us before (owner_user_id sometimes
      // gets hidden by the `owner:user_profiles_secure(...)` alias on the same row).
      const { data: providerData, error: pErr } = await supabase
        .from('service_providers_secure')
        .select(`
          id, owner_user_id, provider_type_id, currency_id,
          name, email, phone, description, website,
          registration_number, tax_id, years_in_operation,
          status, is_active, is_verified,
          verified_at, verified_by, submitted_at, created_at, updated_at,
          kra_pin_verified, kra_pin_verified_at, kra_pin_verified_by,
          registration_verified, registration_verified_at, registration_verified_by,
          location_verified, location_verified_at, location_verified_by,
          verification_score,
          owner:user_profiles_secure!service_providers_owner_user_id_fkey(
            id, first_name, last_name, email, phone
          ),
          provider_type:service_provider_types(id, display_name, code),
          currency:currencies(id, code, display_name, symbol)
        `)
        .eq('id', providerId)
        .single()

      if (pErr) throw pErr
      setProvider(providerData)

      // Initialize verification checklist from provider data
      setVerChecks({
        kra_pin_verified:      providerData.kra_pin_verified || false,
        registration_verified: providerData.registration_verified || false,
        location_verified:     providerData.location_verified || false,
      })
      setOwner(providerData.owner || null)

      // ── Resolve verifier admin names ──
      const verByIds = [
        providerData.kra_pin_verified_by,
        providerData.registration_verified_by,
        providerData.location_verified_by,
      ].filter(Boolean)
      if (verByIds.length > 0) {
        const uniqueIds = [...new Set(verByIds)]
        const { data: verProfiles } = await supabase
          .from('user_profiles_secure')
          .select('id, first_name, last_name')
          .in('id', uniqueIds)
        const nameMap = {}
        ;(verProfiles || []).forEach(p => {
          nameMap[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Admin'
        })
        setVerifierNames({
          kra_pin_verified_by:      nameMap[providerData.kra_pin_verified_by] || null,
          registration_verified_by: nameMap[providerData.registration_verified_by] || null,
          location_verified_by:     nameMap[providerData.location_verified_by] || null,
        })
      } else {
        setVerifierNames({})
      }

      // ── Documents ──
      // Documents are linked to the OWNER's user_profiles.id via
      // uploaded_files.uploader_user_id, with reference_type='provider_document'.
      // (Pattern set in src/components/provider-registration/steps/DocumentsStep.js.)
      if (!providerData.owner_user_id) {
        setDocuments([])
      } else {
        const { data: docsData, error: docsErr } = await supabase
          .from('uploaded_files')
          .select('id, file_name, file_type, file_size, storage_path, storage_bucket, created_at')
          .eq('uploader_user_id', providerData.owner_user_id)
          .eq('reference_type', 'provider_document')
          .order('created_at', { ascending: false })

        if (docsErr) {
          console.error('Documents query failed:', docsErr)
        }

        const docsWithUrls = await Promise.all(
          (docsData || []).map(async (file) => {
            const { data: signed, error: sErr } = await supabase
              .storage
              .from(file.storage_bucket || 'documents')
              .createSignedUrl(file.storage_path, 3600)
            if (sErr) console.error('Signed URL failed for', file.storage_path, sErr)
            return { ...file, publicUrl: sErr ? null : signed.signedUrl }
          })
        )
        setDocuments(docsWithUrls)
      }

      // ── Shops ──
      const { data: shopsData } = await supabase
        .from('shops_secure')
        .select(`
          id, name, description, phone, email,
          county, town, street, latitude, longitude,
          is_active, is_suspended, created_at,
          currency:currencies(code, symbol)
        `)
        .eq('service_provider_id', providerId)
        .order('created_at', { ascending: true })
      setShops(shopsData || [])

      // ── Services offered ──
      const { data: spsData } = await supabase
        .from('service_provider_services')
        .select('service:services(id, name, description)')
        .eq('service_provider_id', providerId)
      setServices((spsData || []).map(r => r.service).filter(Boolean))

      // ── Change history ──
      const { data: historyData } = await supabase
        .from('provider_change_history')
        .select('id, changed_fields, previous_status, new_status, is_reverification, verified_at_snapshot, changed_at')
        .eq('service_provider_id', providerId)
        .order('changed_at', { ascending: false })
      setHistory(historyData || [])

      // Aggregate ALL history entries since last approval into one merged diff
      // so the banner shows every document + field change, not just the latest row.
      if (providerData.status === 'pending_verification' && historyData?.length > 0) {
        const verifiedAt = providerData.verified_at
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
                mergedFields.documents = [
                  ...(mergedFields.documents || []),
                  ...(Array.isArray(value) ? value : []),
                ]
              } else {
                if (mergedFields[field]) {
                  mergedFields[field] = { old: mergedFields[field].old, new: value.new }
                } else {
                  mergedFields[field] = value
                }
              }
            }
          }

          const merged = {
            ...pendingEntries[0],
            changed_fields:   mergedFields,
            is_reverification: pendingEntries.some(e => e.is_reverification),
          }
          setPendingDiff(merged)
          // Resolve any FK uuid values in the merged diff to display labels.
          await resolveFkLabels(mergedFields)
        }
      }

    } catch (err) {
      console.error('Error loading provider:', err)
    } finally {
      setLoading(false)
    }
  }

  // For diff fields that are uuids (provider_type_id, currency_id), fetch the
  // human label for both the old and new value in one query per table.
  const resolveFkLabels = async (changedFields) => {
    if (!changedFields) return
    const byTable = {}
    Object.entries(changedFields).forEach(([field, { old: o, new: n }]) => {
      const r = RESOLVABLE_FK[field]
      if (!r) return
      byTable[r.table] = byTable[r.table] || { ids: new Set(), label: r.label }
      if (o) byTable[r.table].ids.add(o)
      if (n) byTable[r.table].ids.add(n)
    })

    const lookups = {}
    for (const [table, { ids, label }] of Object.entries(byTable)) {
      if (ids.size === 0) continue
      const { data } = await supabase
        .from(table)
        .select(`id, ${label}`)
        .in('id', [...ids])
      ;(data || []).forEach(row => { lookups[row.id] = row[label] })
    }
    setFkLookups(lookups)
  }

  // ── Action handlers ───────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!confirm('Approve this provider?')) return
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: adminProfile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

      const { error } = await supabase
        .from('service_providers')
        .update({
          status:      'active',
          is_active:   true,
          is_verified: true,
          verified_at: new Date().toISOString(),
          verified_by: adminProfile.id,
        })
        .eq('id', provider.id)
      if (error) throw error

      // Save verification checks via RPC (stamps verified_by on each flag)
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('admin_save_provider_verification', {
        p_provider_id:           provider.id,
        p_kra_pin_verified:      verChecks.kra_pin_verified,
        p_registration_verified: verChecks.registration_verified,
        p_location_verified:     verChecks.location_verified,
      })
      if (rpcErr) console.error('Verification RPC error (non-blocking):', rpcErr)
      if (rpcResult && !rpcResult.success) console.error('Verification RPC failure:', rpcResult.error)

      await supabase.from('admin_action_logs').insert({
        admin_user_id: adminProfile.id,
        action_type:   'approve_provider',
        target_type:   'service_provider',
        target_id:     provider.id,
      })

      await supabase.from('notifications').insert({
        user_id:           owner?.id,
        recipient_user_id: owner?.id,
        type:              'provider_approved',
        notification_type: 'provider_approved',
        reference_type:    'service_provider',
        reference_id:      provider.id,
        title:   pendingDiff?.is_reverification ? 'Profile Update Approved' : 'Registration Approved',
        message: pendingDiff?.is_reverification
          ? 'Your updated business details have been approved and are now live.'
          : 'Your provider registration has been approved. You can now start accepting bookings.',
        is_read: false,
      })

      alert('Provider approved successfully')
      router.push('/admin/providers')
    } catch (err) {
      console.error('Approval error:', err)
      alert('Failed to approve provider: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason'); return
    }
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: adminProfile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

      const { error: updErr } = await supabase
        .from('service_providers')
        .update({ status: 'rejected', is_active: false })
        .eq('id', provider.id)
      if (updErr) throw updErr

      await supabase.from('provider_rejections').insert({
        service_provider_id: provider.id,
        rejected_by:         adminProfile.id,
        rejection_reason:    rejectionReason,
        can_reapply:         true,
      })

      await supabase.from('admin_action_logs').insert({
        admin_user_id: adminProfile.id,
        action_type:   'reject_provider',
        target_type:   'service_provider',
        target_id:     provider.id,
        action_data:   { reason: rejectionReason },
      })

      await supabase.from('notifications').insert({
        user_id:           owner?.id,
        recipient_user_id: owner?.id,
        type:              'provider_rejected',
        notification_type: 'provider_rejected',
        reference_type:    'service_provider',
        reference_id:      provider.id,
        title:   'Application Not Approved',
        message: `Your application was not approved. Reason: ${rejectionReason}. You can reapply after addressing the issues.`,
        is_read: false,
      })

      alert('Provider rejected')
      router.push('/admin/providers')
    } catch (err) {
      console.error('Rejection error:', err)
      alert('Failed to reject provider')
    } finally {
      setProcessing(false)
      setShowRejectModal(false)
    }
  }

  const handleRequestInfo = async () => {
    if (!additionalInfo.trim()) {
      alert('Please specify what information is needed'); return
    }
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: adminProfile } = await supabase
        .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()

      await supabase.from('admin_action_logs').insert({
        admin_user_id: adminProfile.id,
        action_type:   'request_info_provider',
        target_type:   'service_provider',
        target_id:     provider.id,
        action_data:   { request: additionalInfo },
      })

      await supabase.from('notifications').insert({
        user_id:           owner?.id,
        recipient_user_id: owner?.id,
        type:              'provider_info_request',
        notification_type: 'provider_info_request',
        reference_type:    'service_provider',
        reference_id:      provider.id,
        title:   'Additional Information Required',
        message: `Please provide the following for ${provider.name}: ${additionalInfo}`,
        is_read: false,
      })

      alert('Information request sent')
      setShowInfoModal(false)
      setAdditionalInfo('')
    } catch (err) {
      console.error('Request info error:', err)
      alert('Failed to send information request')
    } finally {
      setProcessing(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const StatusBadge = ({ status }) => {
    const map = {
      pending_verification: 'bg-yellow-100 text-yellow-800',
      active:               'bg-green-100 text-green-800',
      rejected:             'bg-red-100 text-red-800',
      suspended:            'bg-gray-100 text-gray-700',
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

  // Render a single value from a diff, resolving uuids where possible.
  const displayValue = (field, value) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-300 italic">empty</span>
    }
    if (RESOLVABLE_FK[field] && fkLookups[value]) {
      return <span className="font-mono text-xs">{fkLookups[value]}</span>
    }
    // Long text — truncate inline
    const s = String(value)
    if (s.length > 100) return <span title={s}>{s.slice(0, 100)}…</span>
    return s
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!provider) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Provider not found</h3>
        <Link href="/admin/providers" className="text-blue-600 hover:text-blue-500 mt-4 inline-block">
          ← Back to providers
        </Link>
      </div>
    )
  }

  const isPending = provider.status === 'pending_verification'

  return (
    <div className="max-w-5xl mx-auto">

      {/* Back + header */}
      <div className="mb-6">
        <Link href="/admin/providers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Providers
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{provider.name}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <StatusBadge status={provider.status} />
              {provider.provider_type?.display_name && (
                <span className="text-sm text-gray-500">{provider.provider_type.display_name}</span>
              )}
              {pendingDiff?.is_reverification && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  <History className="w-3 h-3" /> Re-verification
                </span>
              )}
            </div>
          </div>

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

      {/* ── PENDING CHANGES PANEL ── (only when pending re-verification) */}
      {isPending && pendingDiff && pendingDiff.changed_fields && Object.keys(pendingDiff.changed_fields).length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-5 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-yellow-900">
                {pendingDiff.is_reverification ? 'Changes pending re-verification' : 'Pending review'}
              </h2>
              <p className="text-sm text-yellow-800 mt-0.5">
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
          </div>

          <div className="bg-white rounded-md border border-yellow-200 overflow-hidden">
            <table className="min-w-full divide-y divide-yellow-100 text-sm">
              <thead className="bg-yellow-100/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-yellow-900 uppercase tracking-wider">Field</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-yellow-900 uppercase tracking-wider" colSpan="2">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-50">
                {Object.entries(pendingDiff.changed_fields).map(([field, value]) => (
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
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{documents.length}</span>
              )}
              {tab === 'Shops' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{shops.length}</span>
              )}
              {tab === 'Services' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{services.length}</span>
              )}
              {tab === 'Change History' && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{history.length}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Business information */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Store className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold">Business Information</h2>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                { label: 'Business Name',       value: provider.name },
                { label: 'Provider Type',       value: provider.provider_type?.display_name },
                { label: 'Registration Number', value: provider.registration_number },
                { label: 'Tax ID / KRA PIN',    value: provider.tax_id },
                { label: 'Years in Operation',  value: provider.years_in_operation },
                { label: 'Currency',            value: provider.currency
                    ? `${provider.currency.code} — ${provider.currency.display_name}${provider.currency.symbol ? ` (${provider.currency.symbol})` : ''}`
                    : null,
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">{label}</dt>
                  <dd className="font-medium text-gray-900 text-right">{value || <span className="text-gray-300">—</span>}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Owner / contact information */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold">Owner & Contact</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Owner</dt>
                <dd className="font-medium text-gray-900">
                  {owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || '—' : <span className="text-gray-300">—</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Mail className="w-3.5 h-3.5" /> Owner Email</dt>
                <dd className="font-medium text-gray-900 text-right break-all">{owner?.email || <span className="text-gray-300">—</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Phone className="w-3.5 h-3.5" /> Owner Phone</dt>
                <dd className="font-medium text-gray-900">{owner?.phone || <span className="text-gray-300">—</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Mail className="w-3.5 h-3.5" /> Business Email</dt>
                <dd className="font-medium text-gray-900 text-right break-all">{provider.email || <span className="text-gray-300">—</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Phone className="w-3.5 h-3.5" /> Business Phone</dt>
                <dd className="font-medium text-gray-900">{provider.phone || <span className="text-gray-300">—</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="flex items-center gap-1 text-gray-500 shrink-0"><Globe className="w-3.5 h-3.5" /> Website</dt>
                <dd className="font-medium">
                  {provider.website
                    ? <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{provider.website}</a>
                    : <span className="text-gray-300">—</span>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Description */}
          {provider.description && (
            <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
              <h2 className="text-base font-semibold mb-3">Business Description</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{provider.description}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="text-base font-semibold mb-4">Registration Timeline</h2>
            <div className="flex gap-8 flex-wrap text-sm">
              {[
                { label: 'Registered', value: provider.created_at,   color: 'bg-blue-500' },
                { label: 'Submitted',  value: provider.submitted_at, color: 'bg-yellow-500' },
                { label: 'Verified',   value: provider.verified_at,  color: 'bg-green-500' },
                { label: 'Updated',    value: provider.updated_at,   color: 'bg-purple-500' },
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

          {/* Verification Checklist */}
          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Verification Checklist</h2>
                <p className="text-xs text-gray-500 mt-0.5">Review each item before approving. Checks and score are saved with approval.</p>
              </div>
              {provider.verification_score > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-400">Current score</p>
                  <p className="text-lg font-bold text-gray-900">{provider.verification_score}<span className="text-sm text-gray-400">/100</span></p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              {[
                {
                  key: 'kra_pin_verified',
                  label: 'KRA PIN / Tax Compliance',
                  description: 'Valid KRA PIN certificate or tax compliance document verified',
                  verifiedAt: provider.kra_pin_verified_at,
                  verifiedBy: verifierNames.kra_pin_verified_by,
                },
                {
                  key: 'registration_verified',
                  label: 'Business Registration',
                  description: 'Certificate of registration or business permit confirmed',
                  verifiedAt: provider.registration_verified_at,
                  verifiedBy: verifierNames.registration_verified_by,
                },
                {
                  key: 'location_verified',
                  label: 'Location / Premises',
                  description: 'Physical business location confirmed and operational',
                  verifiedAt: provider.location_verified_at,
                  verifiedBy: verifierNames.location_verified_by,
                },
              ].map(item => (
                <label key={item.key}
                  className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    verChecks[item.key]
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <input
                    type="checkbox"
                    checked={verChecks[item.key]}
                    onChange={() => setVerChecks(c => ({ ...c, [item.key]: !c[item.key] }))}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    {item.verifiedAt && (
                      <p className="text-[11px] text-green-600 mt-1">
                        Verified {new Date(item.verifiedAt).toLocaleDateString()}
                        {item.verifiedBy && <> by <span className="font-medium">{item.verifiedBy}</span></>}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              {/* Score breakdown */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Verification Score
                </label>
                {(() => {
                  const dbScore = provider.verification_score || 0
                  const breakdown = [
                    { label: 'KRA PIN verified',      pts: 25, met: verChecks.kra_pin_verified },
                    { label: 'Registration verified',  pts: 25, met: verChecks.registration_verified },
                    { label: 'Location verified',      pts: 20, met: verChecks.location_verified },
                    { label: 'Documents uploaded',     pts: 10, met: documents.length > 0 },
                    { label: 'At least one shop',      pts: 10, met: shops.length > 0 },
                    { label: 'Has description',        pts: 5,  met: provider.description && provider.description.trim().length > 10 },
                    { label: 'Phone & email present',  pts: 5,  met: provider.phone && provider.email },
                  ]

                  return (
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${
                            dbScore >= 80 ? 'bg-emerald-500' :
                            dbScore >= 50 ? 'bg-blue-500' :
                            'bg-indigo-400'
                          }`} style={{ width: `${dbScore}%` }} />
                        </div>
                        <span className={`text-lg font-bold min-w-[3rem] text-right ${
                          dbScore >= 80 ? 'text-emerald-700' :
                          dbScore >= 50 ? 'text-blue-700' :
                          'text-indigo-600'
                        }`}>{dbScore}<span className="text-sm text-gray-400">/100</span></span>
                      </div>
                      <p className="text-[10px] text-gray-400 mb-2">Score computed by server on save. Breakdown below is a guide.</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {breakdown.map(b => (
                          <div key={b.label} className="flex items-center justify-between gap-2">
                            <span className={b.met ? 'text-gray-700' : 'text-gray-400'}>{b.label}</span>
                            <span className={`font-medium ${b.met ? 'text-green-600' : 'text-gray-300'}`}>
                              {b.met ? `+${b.pts}` : `0/${b.pts}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <button
                onClick={async () => {
                  setSavingChecks(true)
                  try {
                    const { data, error } = await supabase.rpc('admin_save_provider_verification', {
                      p_provider_id:           provider.id,
                      p_kra_pin_verified:      verChecks.kra_pin_verified,
                      p_registration_verified: verChecks.registration_verified,
                      p_location_verified:     verChecks.location_verified,
                    })
                    if (error) throw error
                    if (data && !data.success) throw new Error(data.error || 'RPC returned failure')
                    alert('Verification checks saved')
                    fetchProviderDetails()
                  } catch (err) {
                    alert('Failed to save: ' + err.message)
                  } finally {
                    setSavingChecks(false)
                  }
                }}
                disabled={savingChecks || processing}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium whitespace-nowrap self-end"
              >
                {savingChecks ? 'Saving…' : 'Save Checks Only'}
              </button>
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
              <p className="font-medium">No documents found for this provider</p>
              <p className="text-xs text-gray-400 mt-2 max-w-md mx-auto">
                Documents are uploaded during registration and stored against the
                owner's profile. If you expect documents here, verify your account
                has the <span className="font-mono">admin</span> role and check the
                browser console for diagnostic output.
              </p>
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

      {/* ── SHOPS TAB ── */}
      {activeTab === 'Shops' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">Shops</h2>
            <span className="text-xs text-gray-500">({shops.length})</span>
          </div>

          {shops.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No shops registered yet
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Location', 'Contact', 'Currency', 'Status'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shops.map((shop) => (
                  <tr key={shop.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm">
                      <p className="font-medium text-gray-900">{shop.name || '—'}</p>
                      {shop.description && <p className="text-xs text-gray-400 line-clamp-1">{shop.description}</p>}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {[shop.street, shop.town, shop.county].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      <p>{shop.phone || '—'}</p>
                      <p className="text-xs text-gray-400">{shop.email || ''}</p>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {shop.currency ? `${shop.currency.code}${shop.currency.symbol ? ` (${shop.currency.symbol})` : ''}` : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        shop.is_suspended ? 'bg-red-100 text-red-800'
                          : shop.is_active ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {shop.is_suspended ? 'Suspended' : shop.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── SERVICES TAB ── */}
      {activeTab === 'Services' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold">Services Offered</h2>
            <span className="text-xs text-gray-500">({services.length})</span>
          </div>

          {services.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p>No services configured yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {services.map((svc) => (
                <div key={svc.id} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900">{svc.name}</p>
                  {svc.description && <p className="text-xs text-gray-500 mt-1">{svc.description}</p>}
                </div>
              ))}
            </div>
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
              No recorded changes yet. Changes will appear here whenever the owner updates their profile.
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
            <h2 className="text-lg font-bold mb-1">Reject Provider Application</h2>
            <p className="text-sm text-gray-500 mb-4">This will notify the provider owner with your reason.</p>
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
              Notifies the provider owner about what's missing. They can update their profile and resubmit.
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