'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DocumentsStep({ data, updateData, nextStep, previousStep }) {
  const [documents, setDocuments] = useState(data?.documents || [])
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState({})

  const requiredDocs = [
    { type: 'business_license', label: 'Business License', required: true },
    { type: 'certificate_of_incorporation', label: 'Certificate of Incorporation', required: true },
    { type: 'tax_compliance', label: 'Tax Compliance Certificate', required: true },
    { type: 'kra_pin', label: 'KRA PIN Certificate', required: false },
    { type: 'insurance', label: 'Insurance Certificate', required: false }
  ]

  const uploadDocument = async (file, docType) => {
    setUploading(true)
    const supabase = createClient()
    
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${docType}-${Date.now()}.${fileExt}`
      const filePath = `company-documents/${fileName}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath)

      const newDoc = {
        type: docType,
        url: publicUrl,
        fileName: file.name,
        fileSize: file.size
      }

      setDocuments(prev => [...prev.filter(d => d.type !== docType), newDoc])
      
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload document. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e, docType) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB')
        return
      }
      uploadDocument(file, docType)
    }
  }

  const validate = () => {
    const newErrors = {}
    const requiredTypes = requiredDocs.filter(d => d.required).map(d => d.type)
    const uploadedTypes = documents.map(d => d.type)
    
    requiredTypes.forEach(type => {
      if (!uploadedTypes.includes(type)) {
        const doc = requiredDocs.find(d => d.type === type)
        newErrors[type] = `${doc.label} is required`
      }
    })
    
    return newErrors
  }

  const handleSubmit = () => {
    const newErrors = validate()
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    updateData({ documents })
    nextStep()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Upload Documents</h2>
      <p className="text-gray-600 mb-6">
        Upload required business documents for verification
      </p>

      <div className="space-y-4">
        {requiredDocs.map(doc => {
          const uploaded = documents.find(d => d.type === doc.type)
          
          return (
            <div key={doc.type} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-medium">
                    {doc.label}
                    {doc.required && <span className="text-red-500 ml-1">*</span>}
                  </h3>
                  {uploaded && (
                    <p className="text-sm text-green-600 mt-1">
                      ✓ {uploaded.fileName}
                    </p>
                  )}
                  {errors[doc.type] && (
                    <p className="text-sm text-red-500 mt-1">{errors[doc.type]}</p>
                  )}
                </div>
                <label className={`px-4 py-2 rounded-lg cursor-pointer ${
                  uploaded 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}>
                  {uploaded ? 'Replace' : 'Upload'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => handleFileChange(e, doc.type)}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Accepted: PDF, JPG, PNG (Max 5MB)
              </p>
            </div>
          )
        })}
      </div>

      {uploading && (
        <div className="mt-4 text-center text-blue-600">
          Uploading document...
        </div>
      )}

      <div className="flex justify-between pt-6 mt-6 border-t">
        <button
          onClick={previousStep}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          Continue
        </button>
      </div>
    </div>
  )
}