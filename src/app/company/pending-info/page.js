'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { AlertCircle, FileText, Upload, CheckCircle, X } from 'lucide-react'

const REQUIRED_DOCS = [
  { id: 'business_license',           label: 'Business License / Registration Certificate' },
  { id: 'certificate_of_incorporation', label: 'Certificate of Incorporation' },
  { id: 'tax_compliance',             label: 'Tax Compliance Certificate' },
  { id: 'kra_pin',                    label: 'KRA PIN Certificate' },
  { id: 'insurance',                  label: 'Insurance Documents' },
]

export default function PendingInfoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [company, setCompany]         = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [adminMessage, setAdminMessage] = useState(null)
  const [existingDocs, setExistingDocs] = useState([])
  const [newUploads, setNewUploads]   = useState({}) // docType → { file, uploading, uploaded, id }
  const [submitting, setSubmitting]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [success, setSuccess]         = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single()

      setUserProfile(profile)

      // Get company (owner only — only owners can resubmit)
      const { data: co } = await supabase
        .from('company_profiles')
        .select('id, name, status')
        .eq('owner_user_id', profile.id)
        .maybeSingle()

      if (!co) { router.push('/company/dashboard'); return }
      if (co.status !== 'pending_info') { router.push('/company/dashboard'); return }

      setCompany(co)

      // Fetch the admin's info-request notification message
      const { data: notification } = await supabase
        .from('notifications')
        .select('message, created_at')
        .eq('reference_id', co.id)
        .eq('notification_type', 'company_info_request')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setAdminMessage(notification)

      // Existing uploaded docs
      const { data: docs } = await supabase
        .from('uploaded_files')
        .select('id, file_name, file_size, file_type, storage_path, storage_bucket, created_at, metadata')
        .eq('reference_type', 'company_document')
        .eq('reference_id', co.id)
        .order('created_at', { ascending: true })

      setExistingDocs(docs || [])

    } catch (err) {
      console.error('Load error:', err)
      setError('Failed to load page data')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (docType, file) => {
    if (!file || !company) return

    setNewUploads(prev => ({ ...prev, [docType]: { file, uploading: true, uploaded: false, id: null } }))

    try {
      // Get uploader profile id
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const ext = file.name.split('.').pop()
      const fileName = `company-docs/${company.id}/${docType}-resubmit-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      // Insert into uploaded_files linked to company
      const { data: fileRecord, error: dbError } = await supabase
        .from('uploaded_files')
        .insert([{
          uploader_user_id: profile.id,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: fileName,
          storage_bucket: 'documents',
          reference_type: 'company_document',
          reference_id: company.id,
          metadata: { document_type: docType, resubmission: true },
        }])
        .select()
        .single()

      if (dbError) throw dbError

      setNewUploads(prev => ({
        ...prev,
        [docType]: { file, uploading: false, uploaded: true, id: fileRecord.id },
      }))

    } catch (err) {
      console.error('Upload error:', err)
      setNewUploads(prev => ({
        ...prev,
        [docType]: { file, uploading: false, uploaded: false, id: null, error: err.message },
      }))
    }
  }

  const handleResubmit = async () => {
    if (!company) return
    setSubmitting(true)
    setError(null)

    try {
      // Reset status back to pending_verification
      const { error: updateError } = await supabase
        .from('company_profiles')
        .update({
          status: 'pending_verification',
          submitted_at: new Date().toISOString(),
        })
        .eq('id', company.id)

      if (updateError) throw updateError

      // Notify admins
      await supabase.from('notifications').insert([{
        recipient_type: 'admin',
        type: 'company_resubmission',
        notification_type: 'company_resubmission',
        reference_type: 'company',
        reference_table: 'company_profiles',
        reference_id: company.id,
        title: 'Company Resubmitted for Verification',
        message: `${company.name} has resubmitted additional information and is pending re-verification.`,
        is_read: false,
      }])

      setSuccess(true)
      setTimeout(() => router.push('/company/dashboard'), 3000)

    } catch (err) {
      console.error('Resubmit error:', err)
      setError('Failed to resubmit: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const formatBytes = (b) => {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Resubmission Sent</h2>
        <p className="text-gray-600">
          Your updated documents have been submitted. Our team will review them within 2–5 business days.
        </p>
        <p className="text-sm text-gray-400 mt-2">Redirecting to dashboard…</p>
      </div>
    )
  }

  const uploadedCount = Object.values(newUploads).filter(u => u.uploaded).length

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Additional Information Required</h1>
        <p className="text-sm text-gray-500 mt-1">
          Our team has reviewed your registration and needs more information before we can proceed.
        </p>
      </div>

      {/* Admin message */}
      {adminMessage && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-900 mb-1">Message from our team</p>
              <p className="text-sm text-orange-800 leading-relaxed">{adminMessage.message}</p>
              <p className="text-xs text-orange-500 mt-2">
                Received {new Date(adminMessage.created_at).toLocaleDateString('en-KE', {
                  month: 'long', day: 'numeric', year: 'numeric'
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Existing documents */}
      {existingDocs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Previously Uploaded Documents
          </h2>
          <div className="space-y-2">
            {existingDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(doc.file_size)}</p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(doc.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload new / replacement docs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Upload Updated Documents</h2>
        <p className="text-xs text-gray-400 mb-4">
          Re-upload any documents that need to be replaced or added. Previously uploaded documents remain on file.
        </p>

        <div className="space-y-3">
          {REQUIRED_DOCS.map(({ id, label }) => {
            const upload = newUploads[id]
            return (
              <div key={id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  {upload?.uploaded && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Uploaded
                    </span>
                  )}
                </div>

                {upload?.uploaded ? (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                    <FileText className="w-4 h-4 text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 truncate flex-1">{upload.file.name}</p>
                    <button
                      onClick={() => setNewUploads(prev => {
                        const n = { ...prev }; delete n[id]; return n
                      })}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : upload?.uploading ? (
                  <div className="flex items-center gap-2 text-xs text-blue-600">
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600" />
                    Uploading…
                  </div>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && handleFileSelect(id, e.target.files[0])}
                    />
                    <span className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      Choose file (PDF, JPG, PNG)
                    </span>
                    {upload?.error && (
                      <span className="text-xs text-red-500">{upload.error}</span>
                    )}
                  </label>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          onClick={handleResubmit}
          disabled={submitting}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {submitting ? 'Submitting…' : `Submit for Re-verification${uploadedCount > 0 ? ` (${uploadedCount} new file${uploadedCount !== 1 ? 's' : ''})` : ''}`}
        </button>
        <button
          onClick={() => router.push('/company/dashboard')}
          disabled={submitting}
          className="px-5 py-3 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Submitting will notify our team to re-review your registration.
        You don't need to upload all documents — only the ones that need updating.
      </p>
    </div>
  )
}