'use client'

import React, { useState } from 'react'
import { Upload, File, X, Check } from 'lucide-react'

const REQUIRED_DOCUMENTS = [
  { id: 'business_license', name: 'Business License', required: true },
  { id: 'insurance', name: 'Insurance Certificate', required: true },
  { id: 'tax_compliance', name: 'Tax Compliance Certificate', required: true },
  { id: 'id_passport', name: 'ID/Passport Copy', required: true }
]

export default function DocumentsStep({ data, updateData, nextStep, previousStep }) {
  const [documents, setDocuments] = useState(data.documents || [])
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = (docType, file) => {
    // In a real app, upload to storage (Supabase Storage)
    const newDoc = {
      id: Date.now(),
      type: docType,
      name: file.name,
      size: file.size,
      file: file
    }
    
    setDocuments(prev => [...prev.filter(d => d.type !== docType), newDoc])
  }

  const removeDocument = (docId) => {
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  const handleContinue = () => {
    updateData({ documents })
    nextStep()
  }

  const allRequiredUploaded = REQUIRED_DOCUMENTS
    .filter(d => d.required)
    .every(reqDoc => documents.some(doc => doc.type === reqDoc.id))

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Upload Documents
        </h2>
        <p className="text-gray-600">
          Upload required business documents for verification
        </p>
      </div>

      <div className="space-y-4 mb-8">
        {REQUIRED_DOCUMENTS.map(docType => {
          const uploadedDoc = documents.find(d => d.type === docType.id)
          
          return (
            <div key={docType.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <h4 className="font-medium text-gray-800">{docType.name}</h4>
                  {docType.required && (
                    <span className="ml-2 text-xs text-red-600">*Required</span>
                  )}
                </div>
                {uploadedDoc && (
                  <Check className="text-green-500" size={20} />
                )}
              </div>

              {uploadedDoc ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded p-3">
                  <div className="flex items-center">
                    <File className="text-green-600 mr-2" size={20} />
                    <span className="text-sm text-gray-700">{uploadedDoc.name}</span>
                  </div>
                  <button
                    onClick={() => removeDocument(uploadedDoc.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <label className="block">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      if (e.target.files[0]) {
                        handleFileUpload(docType.id, e.target.files[0])
                      }
                    }}
                    className="hidden"
                  />
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition">
                    <Upload className="mx-auto text-gray-400 mb-2" size={24} />
                    <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                    <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG (max 10MB)</p>
                  </div>
                </label>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-between">
        <button
          onClick={previousStep}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!allRequiredUploaded}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
