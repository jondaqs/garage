'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, FileText, CheckCircle, X, AlertCircle } from 'lucide-react'

export default function DocumentsStep({ nextStep, previousStep, data, updateData, userProfile }) {
  const supabase = createClient()
  const [documents, setDocuments] = useState(data.documents || [])
  const [uploading, setUploading] = useState(null)
  const [errors, setErrors] = useState({})

  const documentTypes = [
    { 
      id: 'business_license', 
      label: 'Business Registration Certificate', 
      required: true,
      description: 'Valid business registration from relevant authority'
    },
    { 
      id: 'tax_compliance', 
      label: 'KRA PIN Certificate / Tax Compliance', 
      required: true,
      description: 'Valid KRA PIN certificate or tax compliance certificate'
    },
    { 
      id: 'insurance', 
      label: 'Insurance Certificate', 
      required: false,
      description: 'Professional indemnity or public liability insurance (if applicable)'
    },
    { 
      id: 'id_passport', 
      label: 'ID / Passport Copy', 
      required: true,
      description: 'Valid identification document for business owner'
    }
  ]

  const handleFileUpload = async (docType, file) => {
    // Clear any previous errors
    setErrors(prev => ({ ...prev, [docType]: null }))
    setUploading(docType)

    try {
      // Validate file size
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (file.size > maxSize) {
        throw new Error('File too large. Maximum size is 10MB')
      }

      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Only PDF, JPG, PNG allowed')
      }

      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Create file path
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/${docType}_${Date.now()}.${fileExt}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      // Create file record in uploaded_files table
      const { data: fileRecord, error: fileError } = await supabase
        .from('uploaded_files')
        .insert({
          uploader_user_id: userProfile.id,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: fileName,
          storage_bucket: 'documents',
          reference_type: 'provider_document',
          is_public: false
        })
        .select()
        .single()

      if (fileError) throw fileError

      // Update documents state
      setDocuments(prev => {
        const filtered = prev.filter(d => d.type !== docType)
        return [...filtered, {
          id: fileRecord.id,
          type: docType,
          name: file.name,
          path: fileName,
          size: file.size,
          uploadedAt: new Date().toISOString()
        }]
      })

      console.log('File uploaded successfully:', fileName)

    } catch (error) {
      console.error('Upload error:', error)
      setErrors(prev => ({ ...prev, [docType]: error.message }))
    } finally {
      setUploading(null)
    }
  }

  const handleFileChange = (docType, event) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileUpload(docType, file)
    }
  }

  const removeDocument = async (docType) => {
    const doc = documents.find(d => d.type === docType)
    if (!doc) return

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([doc.path])

      if (storageError) throw storageError

      // Delete from database
      const { error: dbError } = await supabase
        .from('uploaded_files')
        .delete()
        .eq('id', doc.id)

      if (dbError) throw dbError

      // Update state
      setDocuments(prev => prev.filter(d => d.type !== docType))

    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to remove document. Please try again.')
    }
  }

  const handleSubmit = () => {
    // Check if all required documents are uploaded
    const requiredDocs = documentTypes.filter(dt => dt.required)
    const missingDocs = requiredDocs.filter(
      dt => !documents.some(d => d.type === dt.id)
    )

    if (missingDocs.length > 0) {
      alert(`Please upload the following required documents:\n${missingDocs.map(d => '• ' + d.label).join('\n')}`)
      return
    }

    // Save and proceed
    updateData({ documents })
    nextStep()
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Documents</h2>
        <p className="text-gray-600">
          Please upload the required documents for verification. 
          All documents will be reviewed by our team.
        </p>
      </div>

      <div className="space-y-6">
        {documentTypes.map((docType) => {
          const uploaded = documents.find(d => d.type === docType.id)
          const isUploading = uploading === docType.id
          const error = errors[docType.id]

          return (
            <div
              key={docType.id}
              className={`border rounded-lg p-6 ${
                uploaded ? 'border-green-300 bg-green-50' : 
                error ? 'border-red-300 bg-red-50' :
                'border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {docType.label}
                    </h3>
                    {docType.required && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{docType.description}</p>
                </div>

                {uploaded && (
                  <CheckCircle className="text-green-600 flex-shrink-0" size={24} />
                )}
              </div>

              {uploaded ? (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="text-blue-600" size={32} />
                      <div>
                        <p className="font-medium text-gray-800">{uploaded.name}</p>
                        <p className="text-sm text-gray-500">
                          {formatFileSize(uploaded.size)} • Uploaded
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeDocument(docType.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Remove document"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    id={`file-${docType.id}`}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(docType.id, e)}
                    disabled={isUploading}
                  />
                  <label
                    htmlFor={`file-${docType.id}`}
                    className={`
                      flex flex-col items-center justify-center
                      border-2 border-dashed rounded-lg p-8
                      cursor-pointer transition-colors
                      ${isUploading ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}
                    `}
                  >
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-3"></div>
                        <p className="text-sm text-blue-600 font-medium">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="text-gray-400 mb-3" size={40} />
                        <p className="text-sm text-gray-600 mb-1">
                          <span className="text-blue-600 font-medium">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">
                          PDF, JPG, PNG up to 10MB
                        </p>
                      </>
                    )}
                  </label>

                  {error && (
                    <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle size={16} />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <AlertCircle size={18} />
          Important Notes
        </h4>
        <ul className="text-sm text-blue-800 space-y-1 ml-6 list-disc">
          <li>All documents must be clear and readable</li>
          <li>Documents should be valid and not expired</li>
          <li>Accepted formats: PDF, JPG, PNG (max 10MB each)</li>
          <li>Your documents will be reviewed within 2-5 business days</li>
        </ul>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={previousStep}
          className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  )
}