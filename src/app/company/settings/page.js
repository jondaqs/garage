'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, Building2, User, Lock, CheckCircle, AlertCircle,
  Loader2, Save, Eye, EyeOff, Clock, Shield, Info,
  FileText, Upload, Trash2, ExternalLink, RefreshCw,
} from 'lucide-react'
import TwoFactorSetup from '@/components/TwoFactorSetup'

// Tabs — Documents only shown to owner (filtered in render)
const ALL_TABS = [
  { id: 'company',   label: 'Company Profile',    icon: Building2  },
  { id: 'documents', label: 'Documents',           icon: FileText,  ownerOnly: true },
  { id: 'personal',  label: 'My Profile',          icon: User       },
  { id: 'security',  label: 'Security',            icon: Lock       },
]

const INDUSTRIES = [
  '', 'Transportation & Logistics', 'Construction', 'Mining', 'Agriculture',
  'Government', 'Healthcare', 'Retail & Distribution', 'Manufacturing',
  'Tourism & Hospitality', 'NGO / Non-Profit', 'Other',
]

const COMPANY_SIZES = [
  '', '1–10 employees', '11–50 employees', '51–200 employees',
  '201–500 employees', '500+ employees',
]

const WORKING_DAYS = [
  { value: 'monday',    label: 'Mon' },
  { value: 'tuesday',   label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday',  label: 'Thu' },
  { value: 'friday',    label: 'Fri' },
  { value: 'saturday',  label: 'Sat' },
  { value: 'sunday',    label: 'Sun' },
]

// Document types for company verification — mirrors provider pattern
const DOCUMENT_TYPES = [
  {
    id: 'certificate_of_incorporation',
    label: 'Certificate of Incorporation',
    description: 'Certificate of incorporation or business registration from the Registrar of Companies',
    required: true,
  },
  {
    id: 'tax_compliance',
    label: 'KRA PIN Certificate / Tax Compliance',
    description: 'Valid KRA PIN certificate or tax compliance certificate',
    required: true,
  },
  {
    id: 'cr12',
    label: 'CR12 / CR2 — Company Registry Extract',
    description: 'Recent CR12 or CR2 extract confirming directors and shareholders',
    required: false,
  },
  {
    id: 'id_passport',
    label: 'Director ID / Passport Copy',
    description: 'Valid identification document for the company director/owner',
    required: true,
  },
]

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'

export default function CompanySettingsPage() {
  const supabase = createClient()

  const [tab,       setTab]       = useState('company')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')
  const [isOwner,   setIsOwner]   = useState(false)
  const [status,    setStatus]    = useState(null)
  const [companyId, setCompanyId] = useState(null)

  const [company, setCompany] = useState({
    name: '', bio: '', website: '', phone: '',
    industry: '', company_size: '', physical_address: '',
    city: '', country: 'Kenya', years_in_operation: '',
    opening_time: '08:00', closing_time: '18:00',
    working_days: ['monday','tuesday','wednesday','thursday','friday'],
    registration_number: '', tax_id: '',
  })

  const [personal, setPersonal] = useState({
    first_name: '', last_name: '', phone: '', bio: '',
  })

  const [pw, setPw]           = useState({ current: '', newPw: '', confirm: '' })
  const [showPw, setShowPw]   = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  // Documents state
  const [userProfileId, setUserProfileId] = useState(null)
  const [documents,     setDocuments]     = useState([])
  const [docsLoading,   setDocsLoading]   = useState(false)
  const [uploadingType, setUploadingType] = useState(null)
  const [docError,      setDocError]      = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile  } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, phone, bio')
        .eq('auth_user_id', user.id).single()

      if (profile) {
        setUserProfileId(profile.id)
        setPersonal({
          first_name: profile.first_name || '',
          last_name:  profile.last_name  || '',
          phone:      profile.phone      || '',
          bio:        profile.bio        || '',
        })
      }

      // Owner?
      const { data: owned } = await supabase
        .from('company_profiles').select('*')
        .eq('owner_user_id', profile.id).maybeSingle()

      if (owned) {
        setIsOwner(true)
        setCompanyId(owned.id)
        setStatus(owned.status)
        setCompany({
          name:                owned.name                || '',
          bio:                 owned.bio                 || '',
          website:             owned.website             || '',
          phone:               owned.phone               || '',
          industry:            owned.industry            || '',
          company_size:        owned.company_size        || '',
          physical_address:    owned.physical_address    || '',
          city:                owned.city                || '',
          country:             owned.country             || 'Kenya',
          years_in_operation:  owned.years_in_operation?.toString() || '',
          opening_time:        owned.opening_time        || '08:00',
          closing_time:        owned.closing_time        || '18:00',
          working_days:        owned.working_days        || ['monday','tuesday','wednesday','thursday','friday'],
          registration_number: owned.registration_number || '',
          tax_id:              owned.tax_id              || '',
        })
        // Kick off documents load in parallel
        if (profile?.id) loadDocuments(profile.id)
      } else {
        const { data: mem } = await supabase
          .from('company_users')
          .select('company_id, is_admin, company:company_profiles(*)')
          .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
        if (mem?.company) {
          setCompanyId(mem.company_id)
          setStatus(mem.company.status)
          const co = mem.company
          setCompany({
            name:                co.name                || '',
            bio:                 co.bio                 || '',
            website:             co.website             || '',
            phone:               co.phone               || '',
            industry:            co.industry            || '',
            company_size:        co.company_size        || '',
            physical_address:    co.physical_address    || '',
            city:                co.city                || '',
            country:             co.country             || 'Kenya',
            years_in_operation:  co.years_in_operation?.toString() || '',
            opening_time:        co.opening_time        || '08:00',
            closing_time:        co.closing_time        || '18:00',
            working_days:        co.working_days        || [],
            registration_number: co.registration_number || '',
            tax_id:              co.tax_id              || '',
          })
        }
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const saveCompany = async () => {
    if (!company.name.trim()) { setError('Company name is required'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const res  = await fetch('/api/company/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ companyId, ...company }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save')
      setStatus('pending_verification')
      setSuccess(data.message)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const savePersonal = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: err } = await supabase.from('user_profiles').update({
        first_name: personal.first_name.trim() || null,
        last_name:  personal.last_name.trim()  || null,
        phone:      personal.phone.trim()      || null,
        bio:        personal.bio.trim()        || null,
        updated_at: new Date().toISOString(),
      }).eq('auth_user_id', user.id)
      if (err) throw err
      setSuccess('Personal profile updated.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const savePassword = async () => {
    setPwError('')
    if (!pw.current)            { setPwError('Enter your current password'); return }
    if (pw.newPw.length < 8)    { setPwError('New password must be at least 8 characters'); return }
    if (pw.newPw !== pw.confirm) { setPwError('New passwords do not match'); return }
    setPwSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: pw.current,
      })
      if (signInErr) throw new Error('Current password is incorrect')
      const { error: updErr } = await supabase.auth.updateUser({ password: pw.newPw })
      if (updErr) throw updErr
      setPw({ current: '', newPw: '', confirm: '' })
      setSuccess('Password changed successfully.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) { setPwError(err.message) }
    finally { setPwSaving(false) }
  }

  const toggleDay = (day) => {
    setCompany(c => ({
      ...c,
      working_days: c.working_days.includes(day)
        ? c.working_days.filter(d => d !== day)
        : [...c.working_days, day],
    }))
  }

  // ─── DOCUMENTS ─────────────────────────────────────────────────────────────
  // storage_path layout: {auth_user_id}/company_{docType}_{timestamp}.{ext}
  const extractDocType = (storage_path) => {
    if (!storage_path) return 'other'
    const base = storage_path.split('/').pop() || ''
    const m = base.match(/^company_([a-z0-9_]+)_\d+\./i)
    return m ? m[1] : 'other'
  }

  // Calls owner_log_company_doc_change RPC. Each `changes` entry is
  //   { action: 'uploaded' | 'replaced' | 'deleted', doc_type, file_name }.
  // The RPC flips company status to pending_verification and writes one row
  // into company_change_history with a 'documents' key.
  const logDocChange = async (changes) => {
    if (!companyId || !changes?.length) return
    try {
      const { data, error } = await supabase.rpc('owner_log_company_doc_change', {
        p_company_id: companyId,
        p_changes:    changes,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error || 'RPC failed')
      // Reflect the new status locally so the pending banner appears.
      setStatus('pending_verification')
    } catch (e) {
      console.error('owner_log_company_doc_change failed:', e)
      setDocError(
        'Document change saved, but the re-verification request could not be sent. ' +
        'Try saving your company profile to re-trigger admin review.'
      )
    }
  }

  const loadDocuments = async (profileId) => {
    if (!profileId) return
    setDocsLoading(true)
    setDocError('')
    try {
      const { data, error } = await supabase
        .from('uploaded_files')
        .select('id, file_name, file_type, file_size, storage_path, storage_bucket, created_at')
        .eq('uploader_user_id', profileId)
        .eq('reference_type', 'company_document')
        .order('created_at', { ascending: false })
      if (error) throw error
      const withType = (data || []).map(d => ({ ...d, docType: extractDocType(d.storage_path) }))
      setDocuments(withType)
    } catch (e) {
      console.error('Documents load failed:', e)
      setDocError(e.message)
    } finally {
      setDocsLoading(false)
    }
  }

  const handleDocUpload = async (docType, file) => {
    setDocError('')
    setUploadingType(docType)
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File too large. Maximum size is 10 MB.')
      const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
      if (!allowed.includes(file.type)) throw new Error('Invalid file type. Only PDF, JPG, PNG allowed.')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const ext  = file.name.split('.').pop()
      const path = `${user.id}/company_${docType}_${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr

      const { error: insErr } = await supabase
        .from('uploaded_files')
        .insert({
          uploader_user_id: userProfileId,
          file_name:        file.name,
          file_size:        file.size,
          file_type:        file.type,
          storage_path:     path,
          storage_bucket:   'documents',
          reference_type:   'company_document',
          reference_id:     companyId,
          is_public:        false,
        })
      if (insErr) throw insErr

      // Log to change history + flip status to pending_verification
      await logDocChange([
        { action: 'uploaded', doc_type: docType, file_name: file.name },
      ])

      await loadDocuments(userProfileId)
      setSuccess(`${file.name} uploaded. Submitted for re-verification.`)
      setTimeout(() => setSuccess(''), 3500)
    } catch (e) {
      console.error('Upload failed:', e)
      setDocError(e.message)
    } finally {
      setUploadingType(null)
    }
  }

  const handleDocDelete = async (doc) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return
    setDocError('')
    try {
      const { error: stErr } = await supabase.storage
        .from(doc.storage_bucket || 'documents')
        .remove([doc.storage_path])
      if (stErr) throw stErr

      const { error: dbErr } = await supabase
        .from('uploaded_files')
        .delete()
        .eq('id', doc.id)
      if (dbErr) throw dbErr

      await logDocChange([
        { action: 'deleted', doc_type: doc.docType || 'other', file_name: doc.file_name },
      ])

      await loadDocuments(userProfileId)
      setSuccess(`${doc.file_name} deleted. Submitted for re-verification.`)
      setTimeout(() => setSuccess(''), 3500)
    } catch (e) {
      console.error('Delete failed:', e)
      setDocError(e.message)
    }
  }

  const handleDocReplace = async (oldDoc, file) => {
    setDocError('')
    setUploadingType(oldDoc.docType)
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File too large. Maximum size is 10 MB.')
      const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
      if (!allowed.includes(file.type)) throw new Error('Invalid file type. Only PDF, JPG, PNG allowed.')

      const { data: { user } } = await supabase.auth.getUser()
      const ext  = file.name.split('.').pop()
      const path = `${user.id}/company_${oldDoc.docType}_${Date.now()}.${ext}`

      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr

      const { error: insErr } = await supabase
        .from('uploaded_files')
        .insert({
          uploader_user_id: userProfileId,
          file_name:        file.name,
          file_size:        file.size,
          file_type:        file.type,
          storage_path:     path,
          storage_bucket:   'documents',
          reference_type:   'company_document',
          reference_id:     companyId,
          is_public:        false,
        })
      if (insErr) throw insErr

      // Best-effort cleanup of old file
      try {
        await supabase.storage
          .from(oldDoc.storage_bucket || 'documents')
          .remove([oldDoc.storage_path])
        await supabase.from('uploaded_files').delete().eq('id', oldDoc.id)
      } catch (cleanupErr) {
        console.warn('Old document cleanup failed (non-fatal):', cleanupErr)
      }

      await logDocChange([
        { action: 'replaced', doc_type: oldDoc.docType, file_name: file.name },
      ])

      await loadDocuments(userProfileId)
      setSuccess(`${file.name} replaced previous file. Submitted for re-verification.`)
      setTimeout(() => setSuccess(''), 3500)
    } catch (e) {
      console.error('Replace failed:', e)
      setDocError(e.message)
    } finally {
      setUploadingType(null)
    }
  }

  const handleDocView = async (doc) => {
    try {
      const { data, error } = await supabase.storage
        .from(doc.storage_bucket || 'documents')
        .createSignedUrl(doc.storage_path, 300)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error('View failed:', e)
      setDocError(e.message)
    }
  }

  const formatBytes = (b) => {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }
  // ─── /DOCUMENTS ────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  const isPending = status === 'pending_verification'
  const TABS = ALL_TABS.filter(t => !t.ownerOnly || isOwner)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={24} className="text-blue-600" /> Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your company and account settings</p>
      </div>

      {isPending && (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl flex items-start gap-3">
          <Clock className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-yellow-900 text-sm">Pending Re-verification</p>
            <p className="text-yellow-700 text-xs mt-1">
              Your company details have been submitted and are under review by our admin team.
              Existing operations continue uninterrupted during the review period.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2 text-sm">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id}
              onClick={() => { setTab(t.id); setError(''); setSuccess('') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-fit ${
                tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {/* ── Company Profile ── */}
      {tab === 'company' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <div className="flex items-start justify-between">
            <h2 className="text-base font-semibold text-gray-900">Company Profile</h2>
            {isPending && (
              <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium flex items-center gap-1">
                <Clock size={11} /> Pending review
              </span>
            )}
          </div>

          {!isOwner && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <Shield size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-blue-700 text-xs">
                Only the company owner can edit company details. Viewing in read-only mode.
              </p>
            </div>
          )}

          {isOwner && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              Saving changes will submit your details for re-verification and notify our admin team.
              You and the admin will receive email confirmations.
            </div>
          )}

          <div>
            <label className={lbl}>Company Name *</label>
            <input type="text" value={company.name} disabled={!isOwner}
              onChange={e => setCompany(c => ({ ...c, name: e.target.value }))}
              className={inp} placeholder="e.g. Savannah Logistics Ltd" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Phone</label>
              <input type="tel" value={company.phone} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, phone: e.target.value }))}
                className={inp} placeholder="0712 345 678" />
            </div>
            <div>
              <label className={lbl}>Website</label>
              <input type="url" value={company.website} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, website: e.target.value }))}
                className={inp} placeholder="https://yourcompany.co.ke" />
            </div>
          </div>

          <div>
            <label className={lbl}>About the Company</label>
            <textarea value={company.bio} disabled={!isOwner} rows={3}
              onChange={e => setCompany(c => ({ ...c, bio: e.target.value }))}
              className={inp + ' resize-none'}
              placeholder="Brief description of your company and fleet..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Industry</label>
              <select value={company.industry} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, industry: e.target.value }))}
                className={inp}>
                {INDUSTRIES.map(i => (
                  <option key={i} value={i}>{i || 'Select industry...'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Company Size</label>
              <select value={company.company_size} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, company_size: e.target.value }))}
                className={inp}>
                {COMPANY_SIZES.map(s => (
                  <option key={s} value={s}>{s || 'Select size...'}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Registration Number</label>
              <input type="text" value={company.registration_number} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, registration_number: e.target.value }))}
                className={inp} placeholder="e.g. CPR/2018/123456" />
            </div>
            <div>
              <label className={lbl}>KRA PIN / Tax ID</label>
              <input type="text" value={company.tax_id} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, tax_id: e.target.value }))}
                className={inp} placeholder="e.g. P051234567X" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Years in Operation</label>
              <input type="number" min="0" value={company.years_in_operation} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, years_in_operation: e.target.value }))}
                className={inp} placeholder="e.g. 5" />
            </div>
            <div>
              <label className={lbl}>City / Town</label>
              <input type="text" value={company.city} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, city: e.target.value }))}
                className={inp} placeholder="e.g. Nairobi" />
            </div>
          </div>

          <div>
            <label className={lbl}>Physical Address</label>
            <input type="text" value={company.physical_address} disabled={!isOwner}
              onChange={e => setCompany(c => ({ ...c, physical_address: e.target.value }))}
              className={inp} placeholder="e.g. Mombasa Road, Industrial Area" />
          </div>

          <div>
            <label className={lbl}>Operating Hours</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-400 block mb-1">Opens</span>
                <input type="time" value={company.opening_time} disabled={!isOwner}
                  onChange={e => setCompany(c => ({ ...c, opening_time: e.target.value }))}
                  className={inp} />
              </div>
              <div>
                <span className="text-xs text-gray-400 block mb-1">Closes</span>
                <input type="time" value={company.closing_time} disabled={!isOwner}
                  onChange={e => setCompany(c => ({ ...c, closing_time: e.target.value }))}
                  className={inp} />
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>Working Days</label>
            <div className="flex flex-wrap gap-2">
              {WORKING_DAYS.map(d => {
                const active = company.working_days.includes(d.value)
                return (
                  <button key={d.value} disabled={!isOwner}
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                    } disabled:cursor-default`}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          {isOwner && (
            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button onClick={saveCompany} disabled={saving || !company.name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save &amp; Submit for Review
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Documents (owner only) ── */}
      {tab === 'documents' && isOwner && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Company Documents</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Upload, replace, or remove the documents that verify your company.
                  Max file size 10 MB. Accepted: PDF, JPG, PNG.
                </p>
              </div>
              <button
                onClick={() => loadDocuments(userProfileId)}
                disabled={docsLoading}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50"
              >
                <RefreshCw size={14} className={docsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {docError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{docError}</p>
              </div>
            )}

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
              <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">
                Uploading, replacing, or deleting any document submits your company
                for re-verification. You'll be notified once an admin reviews the change.
              </p>
            </div>

            {/* Document type cards */}
            <div className="space-y-3">
              {DOCUMENT_TYPES.map((type) => {
                const matches    = documents.filter(d => d.docType === type.id)
                const current    = matches[0] || null
                const olderCount = matches.length > 1 ? matches.length - 1 : 0
                const isUploading = uploadingType === type.id

                return (
                  <div key={type.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900">{type.label}</p>
                          {type.required && (
                            <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 bg-red-50 text-red-700 rounded">Required</span>
                          )}
                          {!type.required && (
                            <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">Optional</span>
                          )}
                          {current && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
                              <CheckCircle size={10} /> Uploaded
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                      </div>
                    </div>

                    {current ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={16} className="text-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{current.file_name}</p>
                              <p className="text-[11px] text-gray-400">
                                {formatBytes(current.file_size)} · uploaded {new Date(current.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => handleDocView(current)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-white"
                            >
                              <ExternalLink size={12} /> View
                            </button>

                            <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 rounded-md hover:bg-blue-50 cursor-pointer">
                              <Upload size={12} />
                              {isUploading ? 'Replacing…' : 'Replace'}
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png"
                                disabled={isUploading}
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) handleDocReplace(current, f)
                                  e.target.value = ''
                                }}
                              />
                            </label>

                            <button
                              onClick={() => handleDocDelete(current)}
                              disabled={isUploading}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>

                        {olderCount > 0 && (
                          <p className="text-[11px] text-gray-400 mt-2">
                            {olderCount} earlier version{olderCount === 1 ? '' : 's'} on file.
                          </p>
                        )}
                      </div>
                    ) : (
                      <label className="block border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors">
                        <Upload size={20} className="mx-auto text-gray-400 mb-1" />
                        <p className="text-xs font-medium text-gray-700">
                          {isUploading ? 'Uploading…' : 'Click to upload'}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">PDF, JPG, or PNG · up to 10 MB</p>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          disabled={isUploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleDocUpload(type.id, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legacy / unclassified documents */}
            {documents.some(d => !DOCUMENT_TYPES.find(t => t.id === d.docType)) && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Other Documents</h3>
                <div className="space-y-2">
                  {documents
                    .filter(d => !DOCUMENT_TYPES.find(t => t.id === d.docType))
                    .map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={14} className="text-gray-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                            <p className="text-[11px] text-gray-400">
                              {formatBytes(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => handleDocView(doc)} className="px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-white">
                            View
                          </button>
                          <button onClick={() => handleDocDelete(doc)} className="px-2 py-1 text-xs text-red-700 border border-red-300 rounded hover:bg-red-50">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {documents.length === 0 && !docsLoading && (
              <div className="text-xs text-gray-400 text-center mt-4">
                No documents on file yet. Upload your company verification documents above.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Personal profile ── */}
      {tab === 'personal' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">My Profile</h2>
          <p className="text-xs text-gray-500">Your personal account details — visible to your company admin.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>First Name</label>
              <input type="text" value={personal.first_name}
                onChange={e => setPersonal(p => ({ ...p, first_name: e.target.value }))}
                className={inp} placeholder="Jane" />
            </div>
            <div>
              <label className={lbl}>Last Name</label>
              <input type="text" value={personal.last_name}
                onChange={e => setPersonal(p => ({ ...p, last_name: e.target.value }))}
                className={inp} placeholder="Doe" />
            </div>
          </div>
          <div>
            <label className={lbl}>Phone Number</label>
            <input type="tel" value={personal.phone}
              onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))}
              className={inp} placeholder="0712 345 678" />
          </div>
          <div>
            <label className={lbl}>Bio</label>
            <textarea value={personal.bio} rows={2}
              onChange={e => setPersonal(p => ({ ...p, bio: e.target.value }))}
              className={inp + ' resize-none'} placeholder="Brief note about your role..." />
          </div>
          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button onClick={savePersonal} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── Security ── */}
      {tab === 'security' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
          {pwError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{pwError}</div>
          )}
          <div>
            <label className={lbl}>Current Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={pw.current}
                onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                className={inp + ' pr-9'} placeholder="••••••••" />
              <button onClick={() => setShowPw(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>New Password</label>
              <input type={showPw ? 'text' : 'password'} value={pw.newPw}
                onChange={e => setPw(p => ({ ...p, newPw: e.target.value }))}
                className={inp} placeholder="Min 8 characters" />
            </div>
            <div>
              <label className={lbl}>Confirm Password</label>
              <input type={showPw ? 'text' : 'password'} value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                className={inp} placeholder="Repeat new password" />
            </div>
          </div>
          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button onClick={savePassword} disabled={pwSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 text-sm font-medium">
              {pwSaving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              Change Password
            </button>
          </div>
        </div>
      )}

      {/* ── Two-Factor Authentication (inside Security tab) ── */}
      {tab === 'security' && (
        <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
          <TwoFactorSetup accentColor="blue" />
        </div>
      )}
    </div>
  )
}