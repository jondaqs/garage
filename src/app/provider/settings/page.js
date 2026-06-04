'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, User, Store, Lock, CheckCircle, AlertCircle,
  Loader2, Save, Clock, Info, Wrench, Plus, X, Camera,
  FileText, Upload, Trash2, ExternalLink, RefreshCw,
} from 'lucide-react'
import TwoFactorSetup from '@/components/TwoFactorSetup'

const TABS = [
  { id: 'business',  label: 'Business Profile', icon: Store    },
  { id: 'services',  label: 'Services Offered', icon: Wrench   },
  { id: 'documents', label: 'Documents',        icon: FileText },
  { id: 'personal',  label: 'My Profile',       icon: User     },
  { id: 'security',  label: 'Security',          icon: Lock    },
]

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'

export default function ProviderSettingsPage() {
  const supabase = createClient()

  const [tab,        setTab]       = useState('business')
  const [loading,    setLoading]   = useState(true)
  const [saving,     setSaving]    = useState(false)
  const [error,      setError]     = useState('')
  const [success,    setSuccess]   = useState('')
  const [status,     setStatus]    = useState(null)
  const [providerId, setProviderId] = useState(null)

  // Reference data
  const [providerTypes,    setProviderTypes]    = useState([])
  const [currencies,       setCurrencies]       = useState([])
  const [allServices,      setAllServices]      = useState([])
  const [selectedServices, setSelectedServices] = useState(new Set())
  const [servicesSaving,   setServicesSaving]   = useState(false)
  const [showNewSvcForm,   setShowNewSvcForm]   = useState(false)
  const [newSvcName,       setNewSvcName]       = useState('')
  const [newSvcDesc,       setNewSvcDesc]       = useState('')
  const [newSvcSaving,     setNewSvcSaving]     = useState(false)
  const [newSvcError,      setNewSvcError]      = useState('')

  const [business, setBusiness] = useState({
    name: '', email: '', phone: '', description: '',
    website: '', provider_type_id: '', currency_id: '',
  })

  const [personal, setPersonal] = useState({
    first_name: '', last_name: '', phone: '', bio: '',
  })

  // Avatar state
  const [avatarUrl, setAvatarUrl]           = useState(null)
  const [avatarPreview, setAvatarPreview]   = useState(null)
  const [avatarFile, setAvatarFile]         = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Documents state
  const [userProfileId, setUserProfileId] = useState(null)
  const [documents,     setDocuments]     = useState([])
  const [docsLoading,   setDocsLoading]   = useState(false)
  const [uploadingType, setUploadingType] = useState(null)   // doc-type currently uploading
  const [docError,      setDocError]      = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: profile  } = await supabase
        .from('user_profiles_secure')
        .select('id, first_name, last_name, phone, bio, profile_picture_url')
        .eq('auth_user_id', user.id).single()

      if (profile) {
        setUserProfileId(profile.id)
        setPersonal({
          first_name: profile.first_name || '',
          last_name:  profile.last_name  || '',
          phone:      profile.phone      || '',
          bio:        profile.bio        || '',
        })
        if (profile.profile_picture_url) setAvatarUrl(profile.profile_picture_url)

        // Kick off documents load in parallel (non-blocking).
        loadDocuments(profile.id)
      }

      // Load provider
      const { data: sp } = await supabase
        .from('service_providers_secure')
        .select('id, name, email, phone, description, website, provider_type_id, currency_id, status')
        .eq('owner_user_id', profile.id).single()

      if (sp) {
        setProviderId(sp.id)
        setStatus(sp.status)
        setBusiness({
          name:             sp.name             || '',
          email:            sp.email            || '',
          phone:            sp.phone            || '',
          description:      sp.description      || '',
          website:          sp.website          || '',
          provider_type_id: sp.provider_type_id || '',
          currency_id:      sp.currency_id      || '',
        })

        // Load selected services for this provider
        const { data: sps } = await supabase
          .from('service_provider_services')
          .select('service_id')
          .eq('service_provider_id', sp.id)
        setSelectedServices(new Set((sps || []).map(s => s.service_id)))
      }

      // Load reference data
      const [{ data: types }, { data: services }, { data: currs }] = await Promise.all([
        supabase.from('service_provider_types').select('id, code, display_name').order('display_name'),
        supabase.from('services').select('id, name, description').order('name'),
        supabase.from('currencies')
          .select('id, code, display_name, symbol, sort_order')
          .eq('is_active', true)
          .order('sort_order', { nullsFirst: false })
          .order('code'),
      ])
      setProviderTypes(types || [])
      setAllServices(services || [])
      setCurrencies(currs || [])

    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  // ── Save business profile ─────────────────────────────────────────────────
  const saveBusiness = async () => {
    if (!business.name.trim()) { setError('Business name is required'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const res  = await fetch('/api/provider/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ providerId, ...business }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save')
      setStatus('pending_verification')
      setSuccess(data.message)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  // ── Save services offered ────────────────────────────────────────────────
  const saveServices = async () => {
    setServicesSaving(true); setError(''); setSuccess('')
    try {
      // Delete all existing then insert selected (simpler than diffing)
      const { error: delErr } = await supabase
        .from('service_provider_services')
        .delete()
        .eq('service_provider_id', providerId)
      if (delErr) throw delErr

      if (selectedServices.size > 0) {
        const rows = [...selectedServices].map(serviceId => ({
          service_provider_id: providerId,
          service_id:          serviceId,
        }))
        const { error: insErr } = await supabase
          .from('service_provider_services')
          .insert(rows)
        if (insErr) throw insErr
      }

      setSuccess('Services updated successfully.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) { setError(err.message) }
    finally { setServicesSaving(false) }
  }

  const toggleService = (id) => {
    setSelectedServices(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Avatar helpers ───────────────────────────────────────────────────────
  const convertToWebP = (file, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        canvas.getContext('2d').drawImage(img, 0, 0)
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('WebP conversion failed')); return }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }))
          },
          'image/webp', quality,
        )
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = URL.createObjectURL(file)
    })
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const uploadAvatar = async () => {
    if (!avatarFile) return null
    const webpFile = await convertToWebP(avatarFile)
    const formData = new FormData()
    formData.append('file', webpFile)
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to upload photo')
    return data.url
  }

  // ── Save personal profile ────────────────────────────────────────────────
  const savePersonal = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      // Upload avatar if a new file was selected
      if (avatarFile) {
        setAvatarUploading(true)
        const newUrl = await uploadAvatar()
        setAvatarUploading(false)
        if (newUrl) {
          setAvatarUrl(newUrl)
          setAvatarFile(null)
          setAvatarPreview(null)
        }
      }

      const { data: { user } } = await supabase.auth.getUser()
      const { error: err } = await supabase
        .from('user_profiles')
        .update({
          first_name: personal.first_name.trim() || null,
          last_name:  personal.last_name.trim()  || null,
          phone:      personal.phone.trim()      || null,
          bio:        personal.bio.trim()        || null,
          updated_at: new Date().toISOString(),
        })
        .eq('auth_user_id', user.id)
      if (err) throw err
      setSuccess('Personal profile updated.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) { setError(err.message) }
    finally { setSaving(false); setAvatarUploading(false) }
  }

  // ─── DOCUMENTS ─────────────────────────────────────────────────────────
  // Document types here mirror provider-registration/steps/DocumentsStep.js
  // exactly, so re-uploads stay consistent with what the admin reviewer sees.
  const DOCUMENT_TYPES = [
    { id: 'business_license', label: 'Business Registration Certificate',
      description: 'Valid business registration from relevant authority',
      required: true },
    { id: 'tax_compliance',   label: 'KRA PIN Certificate / Tax Compliance',
      description: 'Valid KRA PIN certificate or tax compliance certificate',
      required: true },
    { id: 'insurance',        label: 'Insurance Certificate',
      description: 'Professional indemnity or public liability insurance (if applicable)',
      required: false },
    { id: 'id_passport',      label: 'ID / Passport Copy',
      description: 'Valid identification document for business owner',
      required: true },
  ]

  // storage_path layout from registration step:
  //   {auth_user_id}/{docType}_{timestamp}.{ext}
  // Extract docType from the basename so we can group by it.
  const extractDocType = (storage_path) => {
    if (!storage_path) return 'other'
    const base = storage_path.split('/').pop() || ''
    const m    = base.match(/^([a-z_]+)_\d+\./i)
    return m ? m[1] : 'other'
  }

  // Calls owner_log_document_change RPC. Each `changes` entry is
  //   { action: 'uploaded' | 'replaced' | 'deleted', doc_type, file_name }.
  // The RPC flips provider status to pending_verification and writes one row
  // into provider_change_history with a 'documents' key.
  const logDocChange = async (changes) => {
    if (!providerId || !changes?.length) return
    try {
      const { data, error } = await supabase.rpc('owner_log_document_change', {
        p_provider_id: providerId,
        p_changes:     changes,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error || 'RPC failed')
      // Reflect the new status locally so the pending banner appears.
      setStatus('pending_verification')
    } catch (e) {
      console.error('owner_log_document_change failed:', e)
      // Don't surface to user as a hard error — the doc change itself worked,
      // and admins can still see status updates from the next profile save.
      setDocError(
        'Document change saved, but the re-verification request could not be sent. ' +
        'Try saving your business profile to re-trigger admin review.'
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
        .eq('reference_type', 'provider_document')
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
      // Validate
      if (file.size > 10 * 1024 * 1024) throw new Error('File too large. Maximum size is 10MB.')
      const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
      if (!allowed.includes(file.type)) throw new Error('Invalid file type. Only PDF, JPG, PNG allowed.')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const ext      = file.name.split('.').pop()
      const path     = `${user.id}/${docType}_${Date.now()}.${ext}`

      // 1. Upload to storage
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr

      // 2. Insert metadata row
      const { error: insErr } = await supabase
        .from('uploaded_files')
        .insert({
          uploader_user_id: userProfileId,
          file_name:        file.name,
          file_size:        file.size,
          file_type:        file.type,
          storage_path:     path,
          storage_bucket:   'documents',
          reference_type:   'provider_document',
          is_public:        false,
        })
      if (insErr) throw insErr

      // Flip provider to pending_verification + log to change history.
      // We do this after the storage+DB inserts succeeded so a failed RPC
      // doesn't strand the user with an unverified upload.
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
      // 1. Storage first — leaving an orphaned file is worse than an orphaned row
      const { error: stErr } = await supabase.storage
        .from(doc.storage_bucket || 'documents')
        .remove([doc.storage_path])
      if (stErr) throw stErr

      // 2. DB row
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

  // "Edit" in the original ask = replace the file. We do this as
  // upload-new-then-delete-old so a failure leaves the user with a document,
  // never with nothing.
  const handleDocReplace = async (oldDoc, file) => {
    setDocError('')
    setUploadingType(oldDoc.docType)
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File too large. Maximum size is 10MB.')
      const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
      if (!allowed.includes(file.type)) throw new Error('Invalid file type. Only PDF, JPG, PNG allowed.')

      const { data: { user } } = await supabase.auth.getUser()
      const ext  = file.name.split('.').pop()
      const path = `${user.id}/${oldDoc.docType}_${Date.now()}.${ext}`

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
          reference_type:   'provider_document',
          is_public:        false,
        })
      if (insErr) throw insErr

      // New file succeeded — now clean up the old one (best-effort, don't
      // bubble errors so the user still has a working document).
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
        .createSignedUrl(doc.storage_path, 300)   // 5-min signed URL
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
  // ─── /DOCUMENTS ────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  const isPending = status === 'pending_verification'

  const handleCreateService = async (force = false) => {
    if (!newSvcName.trim()) return
    setNewSvcSaving(true)
    setNewSvcError('')
    try {
      const resp = await fetch('/api/services/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:                newSvcName.trim(),
          description:         newSvcDesc.trim() || null,
          service_provider_id: providerId,
          force,
        }),
      })
      const result = await resp.json()

      // Exact duplicate
      if (resp.status === 409 && result.duplicate) {
        if (window.confirm(`${result.error}\n\nAdd this service to your offered list instead?`)) {
          setSelectedServices(prev => new Set([...prev, result.existing_id]))
          setShowNewSvcForm(false)
          setNewSvcName(''); setNewSvcDesc('')
        }
        return
      }

      // Similarity warning
      if (result.warning) {
        if (window.confirm(`${result.message}\n\nClick OK to create it anyway.`)) {
          await handleCreateService(true)
        }
        return
      }

      if (!resp.ok || !result.service_id) throw new Error(result.error || 'Failed to create')

      // Add to allServices list + auto-check it
      setAllServices(prev => [...prev, { id: result.service_id, name: result.name, description: newSvcDesc.trim() || null }]
        .sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedServices(prev => new Set([...prev, result.service_id]))
      setShowNewSvcForm(false)
      setNewSvcName(''); setNewSvcDesc('')
      setSuccess(`Service "${result.name}" created and added to your list`)
    } catch (e) {
      setNewSvcError(e.message)
    } finally {
      setNewSvcSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={24} className="text-green-600" /> Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your business and account settings</p>
      </div>

      {/* Pending verification banner */}
      {isPending && (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl flex items-start gap-3">
          <Clock className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-yellow-900 text-sm">Pending Re-verification</p>
            <p className="text-yellow-700 text-xs mt-1">
              Your updated business details are under review by our team.
              You can continue operating while the review is in progress.
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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id}
              onClick={() => { setTab(t.id); setError(''); setSuccess('') }}
              className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {/* ── Business Profile ── */}
      {tab === 'business' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between">
            <h2 className="text-base font-semibold text-gray-900">Business Profile</h2>
            {isPending && (
              <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium flex items-center gap-1">
                <Clock size={11} /> Pending review
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            Saving changes will submit your profile for re-verification. Admin will be notified
            and you will receive an email confirmation.
          </div>

          <div>
            <label className={lbl}>Business Name *</label>
            <input type="text" value={business.name}
              onChange={e => setBusiness(b => ({ ...b, name: e.target.value }))}
              className={inp} placeholder="e.g. Nairobi Auto Services" />
          </div>

          <div>
            <label className={lbl}>Provider Type</label>
            <select value={business.provider_type_id}
              onChange={e => setBusiness(b => ({ ...b, provider_type_id: e.target.value }))}
              className={inp}>
              <option value="">Select type...</option>
              {providerTypes.map(t => (
                <option key={t.id} value={t.id}>{t.display_name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              The category of automotive services you primarily offer.
            </p>
          </div>

          <div>
            <label className={lbl}>Currency</label>
            <select value={business.currency_id}
              onChange={e => setBusiness(b => ({ ...b, currency_id: e.target.value }))}
              className={inp}>
              <option value="">Select currency...</option>
              {currencies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.display_name}{c.symbol ? ` (${c.symbol})` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Default currency for your pricing, invoices and work orders.
              New shops you add will inherit this currency.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Business Email</label>
              <input type="email" value={business.email}
                onChange={e => setBusiness(b => ({ ...b, email: e.target.value }))}
                className={inp} placeholder="info@yourgarage.co.ke" />
            </div>
            <div>
              <label className={lbl}>Business Phone</label>
              <input type="tel" value={business.phone}
                onChange={e => setBusiness(b => ({ ...b, phone: e.target.value }))}
                className={inp} placeholder="0712 345 678" />
            </div>
          </div>

          <div>
            <label className={lbl}>Website</label>
            <input type="url" value={business.website}
              onChange={e => setBusiness(b => ({ ...b, website: e.target.value }))}
              className={inp} placeholder="https://yourgarage.co.ke" />
          </div>

          <div>
            <label className={lbl}>Description</label>
            <textarea value={business.description} rows={3}
              onChange={e => setBusiness(b => ({ ...b, description: e.target.value }))}
              className={inp + ' resize-none'}
              placeholder="Tell customers about your garage, specialisations and experience..." />
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Shop locations are managed under <strong>My Shops</strong>.
            </p>
            <button onClick={saveBusiness} disabled={saving || !business.name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save &amp; Submit for Review
            </button>
          </div>
        </div>
      )}

      {/* ── Services Offered ── */}
      {tab === 'services' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Services Offered</h2>
          <p className="text-sm text-gray-500">
            Select all services your garage provides. This helps customers find you when
            searching for specific services.
          </p>

          {allServices.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Wrench size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No services available in the system yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allServices.map(svc => {
                const checked = selectedServices.has(svc.id)
                return (
                  <label key={svc.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'bg-green-50 border-green-300'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(svc.id)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 mt-0.5 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${checked ? 'text-green-800' : 'text-gray-900'}`}>
                        {svc.name}
                      </p>
                      {svc.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{svc.description}</p>
                      )}
                    </div>
                    {checked && (
                      <CheckCircle className="text-green-500 flex-shrink-0 ml-auto" size={16} />
                    )}
                  </label>
                )
              })}
            </div>
          )}

          {/* Add new service */}
          {!showNewSvcForm ? (
            <button
              onClick={() => { setShowNewSvcForm(true); setNewSvcError('') }}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors">
              <Plus size={15} /> Can't find a service? Add it here
            </button>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-green-800">Define new service</p>
                <button onClick={() => { setShowNewSvcForm(false); setNewSvcName(''); setNewSvcDesc(''); setNewSvcError('') }}
                  className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              {newSvcError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {newSvcError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Service Name *</label>
                  <input type="text" value={newSvcName}
                    onChange={e => setNewSvcName(e.target.value)}
                    placeholder="e.g. Brake pad replacement"
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>Description (optional)</label>
                  <input type="text" value={newSvcDesc}
                    onChange={e => setNewSvcDesc(e.target.value)}
                    placeholder="Brief description"
                    className={inp} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleCreateService(false)} disabled={newSvcSaving || !newSvcName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {newSvcSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Create &amp; Add to My Services
                </button>
              </div>
              <p className="text-xs text-gray-500">
                The new service will be saved to the system catalog, added to your services list, and reviewed by admin.
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {selectedServices.size} service{selectedServices.size !== 1 ? 's' : ''} selected
            </p>
            <button onClick={saveServices} disabled={servicesSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {servicesSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Services
            </button>
          </div>
        </div>
      )}

      {/* ── Documents ── */}
      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Business Documents</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Upload, replace, or remove the documents that verify your business.
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
                Uploading, replacing, or deleting any document submits your profile
                for re-verification. You'll be notified once an admin reviews the change.
              </p>
            </div>

            {/* Document types — render one card per required/optional type */}
            <div className="space-y-3">
              {DOCUMENT_TYPES.map((type) => {
                // Most recent file of this type
                const matches = documents.filter(d => d.docType === type.id)
                const current = matches[0] || null
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
                                  e.target.value = '' // allow same file re-select
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
                      <label className="block border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-green-400 hover:bg-green-50 cursor-pointer transition-colors">
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

            {/* Any documents that don't match a known type (e.g. legacy "other"
                category) so the user can still see and manage them. */}
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
                No documents on file yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Personal Profile ── */}
      {tab === 'personal' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">My Profile</h2>

          {/* ── Avatar ── */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden relative flex-shrink-0">
              {(avatarPreview || avatarUrl) ? (
                <img src={avatarPreview || avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera size={28} className="text-gray-400" />
              )}
              {avatarUploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                  <Loader2 size={18} className="text-white animate-spin" />
                </div>
              )}
            </div>
            <div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition">
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                <Camera size={14} />
                {(avatarPreview || avatarUrl) ? 'Change Photo' : 'Upload Photo'}
              </label>
              {avatarPreview && (
                <p className="text-[11px] text-gray-400 mt-1.5">Saved when you click Save Changes</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>First Name</label>
              <input type="text" value={personal.first_name}
                onChange={e => setPersonal(p => ({ ...p, first_name: e.target.value }))}
                className={inp} placeholder="John" />
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
              className={inp + ' resize-none'} placeholder="Brief note about yourself..." />
          </div>
          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button onClick={savePersonal} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── Security ── */}
      {tab === 'security' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <TwoFactorSetup accentColor="green" />
        </div>
      )}
    </div>
  )
}