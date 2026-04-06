'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, CheckCircle, Upload, FileText,
  X, ChevronDown, ChevronUp
} from 'lucide-react'
import { COUNTRIES } from '@/lib/constants/countries'

const DAYS = [
  { key: 'monday',    label: 'Mon' },
  { key: 'tuesday',  label: 'Tue' },
  { key: 'wednesday',label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday',   label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday',   label: 'Sun' },
]

const REQUIRED_DOCS = [
  { id: 'business_license',             label: 'Business License / Registration Certificate' },
  { id: 'certificate_of_incorporation', label: 'Certificate of Incorporation' },
  { id: 'tax_compliance',               label: 'Tax Compliance Certificate' },
  { id: 'kra_pin',                      label: 'KRA PIN Certificate' },
  { id: 'insurance',                    label: 'Insurance Documents' },
]

// Values must match exactly what CompanyInfoStep stores in the DB
const INDUSTRY_OPTIONS = [
  { value: 'Transportation', label: 'Transportation & Logistics' },
  { value: 'Construction',   label: 'Construction' },
  { value: 'Manufacturing',  label: 'Manufacturing' },
  { value: 'Retail',         label: 'Retail' },
  { value: 'Technology',     label: 'Technology' },
  { value: 'Healthcare',     label: 'Healthcare' },
  { value: 'Hospitality',    label: 'Hospitality' },
  { value: 'Agriculture',    label: 'Agriculture' },
  { value: 'Other',          label: 'Other' },
]

const COMPANY_SIZE_OPTIONS = [
  { value: '1-10',    label: '1-10 employees' },
  { value: '11-50',   label: '11-50 employees' },
  { value: '51-100',  label: '51-100 employees' },
  { value: '101-500', label: '101-500 employees' },
  { value: '500+',    label: '500+ employees' },
]

export default function PendingInfoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [company, setCompany]           = useState(null)
  const [adminMessage, setAdminMessage] = useState(null)
  const [existingDocs, setExistingDocs] = useState([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [success, setSuccess]           = useState(false)
  const [error, setError]               = useState(null)
  const [docsOpen, setDocsOpen]         = useState(false)
  const [uploads, setUploads]           = useState({})

  const [form, setForm] = useState({
    name: '', registration_number: '', tax_id: '',
    industry: '', company_size: '', bio: '',
    website: '', phone: '', physical_address: '',
    city: '', country: 'Kenya',
    years_in_operation: '', opening_time: '08:00',
    closing_time: '18:00', working_days: [],
  })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      const { data: co } = await supabase
        .from('company_profiles').select('*')
        .eq('owner_user_id', profile.id).maybeSingle()

      if (!co || co.status !== 'pending_info') { router.push('/company/dashboard'); return }

      setCompany(co)
      setForm({
        name:                co.name                || '',
        registration_number: co.registration_number || '',
        tax_id:              co.tax_id              || '',
        industry:            co.industry            || '',
        company_size:        co.company_size        || '',
        bio:                 co.bio                 || '',
        website:             co.website             || '',
        phone:               co.phone               || '',
        physical_address:    co.physical_address    || '',
        city:                co.city                || '',
        country:             co.country             || 'Kenya',
        years_in_operation:  co.years_in_operation  || '',
        opening_time:        co.opening_time        || '08:00',
        closing_time:        co.closing_time        || '18:00',
        working_days:        co.working_days        || [],
      })

      const { data: notif } = await supabase
        .from('notifications').select('message, created_at')
        .eq('reference_id', co.id).eq('notification_type', 'company_info_request')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setAdminMessage(notif)

      const { data: docs } = await supabase
        .from('uploaded_files').select('id, file_name, file_size, created_at')
        .eq('reference_type', 'company_document').eq('reference_id', co.id)
        .order('created_at', { ascending: true })
      setExistingDocs(docs || [])

    } catch (err) {
      setError('Failed to load page data')
    } finally {
      setLoading(false)
    }
  }

  const toggleDay = (key) => setForm(prev => ({
    ...prev,
    working_days: prev.working_days.includes(key)
      ? prev.working_days.filter(d => d !== key)
      : [...prev.working_days, key],
  }))

  const handleFileSelect = async (docType, file) => {
    if (!file || !company) return
    setUploads(prev => ({ ...prev, [docType]: { file, uploading: true, uploaded: false } }))
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      const ext = file.name.split('.').pop()
      const path = `company-docs/${company.id}/${docType}-${Date.now()}.${ext}`

      const { error: se } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (se) throw se

      const { error: de } = await supabase.from('uploaded_files').insert([{
        uploader_user_id: profile.id, file_name: file.name,
        file_size: file.size, file_type: file.type,
        storage_path: path, storage_bucket: 'documents',
        reference_type: 'company_document', reference_id: company.id,
        metadata: { document_type: docType, resubmission: true },
      }])
      if (de) throw de

      setUploads(prev => ({ ...prev, [docType]: { file, uploading: false, uploaded: true } }))
    } catch (err) {
      setUploads(prev => ({ ...prev, [docType]: { file, uploading: false, uploaded: false, error: err.message } }))
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Company name is required'); return }
    if (!form.phone.trim()) { setError('Phone number is required'); return }
    setSaving(true); setError(null)

    console.log('🔵 [1] handleSubmit started — company.id:', company?.id)

    try {
      console.log('🔵 [2] About to UPDATE company_profiles — id:', company.id)
      const { data: updateData, error: ue } = await supabase
        .from('company_profiles')
        .update({
          name:                form.name.trim(),
          registration_number: form.registration_number.trim() || null,
          tax_id:              form.tax_id.trim() || null,
          industry:            form.industry || null,
          company_size:        form.company_size || null,
          bio:                 form.bio.trim() || null,
          website:             form.website.trim() || null,
          phone:               form.phone.trim(),
          physical_address:    form.physical_address.trim() || null,
          city:                form.city.trim() || null,
          country:             form.country,
          years_in_operation:  form.years_in_operation ? parseInt(form.years_in_operation) : null,
          opening_time:        form.opening_time || null,
          closing_time:        form.closing_time || null,
          working_days:        form.working_days.length > 0 ? form.working_days : null,
          status:              'pending_verification',
          submitted_at:        new Date().toISOString(),
          updated_at:          new Date().toISOString(),
        })
        .eq('id', company.id)
        .select()

      console.log('🔵 [3] UPDATE result — error:', ue, '| data:', updateData)
      if (ue) {
        console.error('🔴 [3] UPDATE failed:', ue.code, ue.message)
        throw ue
      }
      console.log('🟢 [3] UPDATE succeeded')

      console.log('🔵 [4] About to INSERT notification')
      const { error: notifError } = await supabase.from('notifications').insert([{
        recipient_type: 'admin', type: 'company_resubmission',
        notification_type: 'company_resubmission',
        reference_type: 'company', reference_table: 'company_profiles',
        reference_id: company.id,
        title: 'Company Resubmitted for Verification',
        message: `${company.name} has updated their information and resubmitted for verification.`,
        is_read: false,
      }])

      if (notifError) {
        console.error('🔴 [4] Notification INSERT failed:', notifError.code, notifError.message)
      } else {
        console.log('🟢 [4] Notification inserted')
      }

      console.log('🟢 [5] All done — setting success')
      setSuccess(true)
      setTimeout(() => router.push('/company/dashboard'), 3000)
    } catch (err) {
      console.error('🔴 [CATCH] Error at unknown step:', err.message, err)
      setError('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const newDocCount = Object.values(uploads).filter(u => u.uploaded).length

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (success) return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Resubmitted Successfully</h2>
      <p className="text-gray-500 text-sm">Our team will review your updated information within 2–5 business days.</p>
      <p className="text-xs text-gray-400 mt-2">Redirecting to dashboard…</p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Update Company Information</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review the admin's message, update any details that need correcting, then resubmit.
        </p>
      </div>

      {/* Admin message */}
      {adminMessage && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-900 mb-1">Message from our review team</p>
              <p className="text-sm text-orange-800 leading-relaxed">{adminMessage.message}</p>
              <p className="text-xs text-orange-400 mt-2">
                {new Date(adminMessage.created_at).toLocaleDateString('en-KE', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Company Information */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Company Information</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Company Legal Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inp} placeholder="Acme Ltd" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Registration Number</label>
            <input type="text" value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value})} className={inp} placeholder="CPR/2024/12345" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tax ID / KRA PIN</label>
            <input type="text" value={form.tax_id} onChange={e => setForm({...form, tax_id: e.target.value})} className={inp} placeholder="A012345678Z" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
            <select value={form.industry} onChange={e => setForm({...form, industry: e.target.value})} className={inp}>
              <option value="">Select industry</option>
              {INDUSTRY_OPTIONS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company Size</label>
            <select value={form.company_size} onChange={e => setForm({...form, company_size: e.target.value})} className={inp}>
              <option value="">Select size</option>
              {COMPANY_SIZE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Company Description</label>
          <textarea rows={3} value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} className={inp} placeholder="Briefly describe your company..." />
        </div>
      </div>

      {/* Contact & Location */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Contact & Location</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number <span className="text-red-500">*</span></label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className={inp} placeholder="+254 712 345 678" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Website</label>
            <input type="url" value={form.website} onChange={e => setForm({...form, website: e.target.value})} className={inp} placeholder="https://..." />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Physical Address</label>
          <input type="text" value={form.physical_address} onChange={e => setForm({...form, physical_address: e.target.value})} className={inp} placeholder="123 Main Street" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input type="text" value={form.city} onChange={e => setForm({...form, city: e.target.value})} className={inp} placeholder="Nairobi" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
            <select value={form.country} onChange={e => setForm({...form, country: e.target.value})} className={inp}>
              <optgroup label="East Africa">{COUNTRIES.slice(0,10).map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
              <optgroup label="Other African Countries">{COUNTRIES.slice(10,60).map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
              <optgroup label="International">{COUNTRIES.slice(60).map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Operating Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Operating Details</h2>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Years in Operation</label>
          <input type="number" min="0" max="200" value={form.years_in_operation}
            onChange={e => setForm({...form, years_in_operation: e.target.value})} className={inp} placeholder="5" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Working Days</label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(({ key, label }) => {
              const active = form.working_days.includes(key)
              return (
                <button key={key} type="button" onClick={() => toggleDay(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}>{label}</button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Opening Time</label>
            <input type="time" value={form.opening_time} onChange={e => setForm({...form, opening_time: e.target.value})} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Closing Time</label>
            <input type="time" value={form.closing_time} onChange={e => setForm({...form, closing_time: e.target.value})} className={inp} />
          </div>
        </div>
      </div>

      {/* Documents — collapsible */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button type="button" onClick={() => setDocsOpen(!docsOpen)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors">
          <div>
            <span className="text-sm font-semibold text-gray-900">Documents</span>
            <span className="ml-2 text-xs text-gray-400">
              {existingDocs.length} on file{newDocCount > 0 ? ` · ${newDocCount} new` : ''} — expand to update
            </span>
          </div>
          {docsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {docsOpen && (
          <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
            {existingDocs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Previously uploaded</p>
                <div className="space-y-2">
                  {existingDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <p className="text-xs text-gray-700 flex-1 truncate">{doc.file_name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Upload replacements or new documents</p>
              <div className="space-y-3">
                {REQUIRED_DOCS.map(({ id, label }) => {
                  const u = uploads[id]
                  return (
                    <div key={id} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-700 mb-2">{label}</p>
                      {u?.uploaded ? (
                        <div className="flex items-center gap-2 bg-green-50 rounded p-2">
                          <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          <p className="text-xs text-green-700 truncate flex-1">{u.file.name}</p>
                          <button onClick={() => setUploads(p => { const n={...p}; delete n[id]; return n })}>
                            <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      ) : u?.uploading ? (
                        <div className="flex items-center gap-2 text-xs text-blue-600">
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600" />
                          Uploading…
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                            onChange={e => e.target.files?.[0] && handleFileSelect(id, e.target.files[0])} />
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                            <Upload className="w-3.5 h-3.5" /> Choose file (PDF, JPG, PNG)
                          </span>
                          {u?.error && <span className="ml-2 text-xs text-red-500">{u.error}</span>}
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleSubmit} disabled={saving}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : `Save & Resubmit${newDocCount > 0 ? ` (${newDocCount} new doc${newDocCount !== 1 ? 's' : ''})` : ''}`}
        </button>
        <button onClick={() => router.push('/company/dashboard')} disabled={saving}
          className="px-5 py-3 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center pb-4">
        Saving updates your company details and notifies our team to re-review your registration.
      </p>
    </div>
  )
}