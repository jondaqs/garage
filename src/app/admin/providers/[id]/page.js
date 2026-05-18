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
}

// Some changed values are uuids (provider_type_id, currency_id). We resolve
// them to their display names via a lazy lookup so the diff doesn't show raw uuids.
const RESOLVABLE_FK = {
  provider_type_id: { table: 'service_provider_types', label: 'display_name' },
  currency_id:      { table: 'currencies',             label: 'display_name' },
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

  useEffect(() => { fetchProviderDetails() }, [])

  const fetchProviderDetails = async () => {
    try {
      const resolvedParams = await params
      const providerId     = resolvedParams.id

      // ── Provider profile ──
      const { data: providerData, error: pErr } = await supabase
        .from('service_providers')
        .select(`
          *,
          owner:user_profiles!service_providers_owner_user_id_fkey(
            id, first_name, last_name, email, phone
          ),
          provider_type:service_provider_types(id, display_name, code),
          currency:currencies(id, code, display_name, symbol)
        `)
        .eq('id', providerId)
        .single()

      if (pErr) throw pErr
      setProvider(providerData)
      setOwner(providerData.owner || null)

      // ── Documents ──
      const { data: docsData } = await supabase
        .from('uploaded_files')
        .select('id, file_name, file_type, file_size, storage_path, storage_bucket, created_at')
        .eq('reference_type', 'provider_document')
        .eq('uploader_user_id', providerData.owner_user_id)
        .order('created_at', { ascending: true })

      const docsWithUrls = await Promise.all(
        (docsData || []).map(async (file) => {
          const { data: signed, error: sErr } = await supabase
            .storage
            .from(file.storage_bucket || 'documents')
            .createSignedUrl(file.storage_path, 3600)
          return { ...file, publicUrl: sErr ? null : signed.signedUrl }
        })
      )
      setDocuments(docsWithUrls)

      // ── Shops ──
      const { data: shopsData } = await supabase
        .from('shops')
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

      // The most recent change is the "current pending submission" when
      // status === pending_verification. We surface it prominently.
      const latest = (historyData && historyData[0]) || null
      if (latest && providerData.status === 'pending_verification') {
        setPendingDiff(latest)
        // Resolve any FK uuid values in the diff to display labels.
        await resolveFkLabels(latest.changed_fields)
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
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

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
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

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
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

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
                    Owner updated {Object.keys(pendingDiff.changed_fields).length} field
                    {Object.keys(pendingDiff.changed_fields).length === 1 ? '' : 's'}
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-yellow-900 uppercase tracking-wider">Previous</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-yellow-900 uppercase tracking-wider">New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-50">
                {Object.entries(pendingDiff.changed_fields).map(([field, { old: oldVal, new: newVal }]) => (
                  <tr key={field}>
                    <td className="px-4 py-2 font-medium text-gray-900">{FIELD_LABELS[field] || field}</td>
                    <td className="px-4 py-2 text-gray-500 line-through decoration-red-300">
                      {displayValue(field, oldVal)}
                    </td>
                    <td className="px-4 py-2 text-green-700 font-medium">
                      {displayValue(field, newVal)}
                    </td>
                  </tr>
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
              <p>No documents uploaded for this provider</p>
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
                      {Object.keys(entry.changed_fields || {}).length} field
                      {Object.keys(entry.changed_fields || {}).length === 1 ? '' : 's'} changed
                      {entry.previous_status !== entry.new_status && (
                        <> · status: {entry.previous_status?.replace(/_/g, ' ')} → {entry.new_status?.replace(/_/g, ' ')}</>
                      )}
                    </span>
                  </div>
                  <table className="min-w-full text-xs mt-2">
                    <tbody className="divide-y divide-gray-50">
                      {Object.entries(entry.changed_fields || {}).map(([field, { old: oldVal, new: newVal }]) => (
                        <tr key={field}>
                          <td className="py-1.5 pr-3 font-medium text-gray-700 align-top w-40">
                            {FIELD_LABELS[field] || field}
                          </td>
                          <td className="py-1.5 pr-3 text-gray-500 line-through decoration-red-300 align-top">
                            {displayValue(field, oldVal)}
                          </td>
                          <td className="py-1.5 text-green-700 align-top">
                            {displayValue(field, newVal)}
                          </td>
                        </tr>
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