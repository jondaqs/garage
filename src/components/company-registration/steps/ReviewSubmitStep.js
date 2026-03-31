'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, AlertCircle } from 'lucide-react'

export default function ReviewSubmitStep({ data, previousStep, userProfile }) {
  const router = useRouter()
  const supabase = createClient()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    try {
      // Submit company registration
      const response = await fetch('/api/company/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyInfo: data.companyInfo,
          companyDetails: data.companyDetails,
          documents: data.documents,
          teamMembers: data.teamMembers,
          fleet: data.fleet
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create company')
      }

      // Success
      alert('✅ Company registered successfully! Awaiting admin approval.')
      router.push('/company/dashboard')
      
    } catch (err) {
      console.error('Submit error:', err)
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Review & Submit</h2>
      <p className="text-gray-600 mb-6">
        Please review your information before submitting
      </p>

      {/* Company Information */}
      <div className="bg-white rounded-lg border p-6 mb-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle className="text-green-600" size={20} />
          Company Information
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Name:</span>
            <p className="font-medium">{data.companyInfo?.name}</p>
          </div>
          <div>
            <span className="text-gray-600">Registration Number:</span>
            <p className="font-medium">{data.companyInfo?.registrationNumber}</p>
          </div>
          <div>
            <span className="text-gray-600">Tax ID:</span>
            <p className="font-medium">{data.companyInfo?.taxId}</p>
          </div>
          <div>
            <span className="text-gray-600">Industry:</span>
            <p className="font-medium">{data.companyInfo?.industry}</p>
          </div>
        </div>
      </div>

      {/* Company Details */}
      <div className="bg-white rounded-lg border p-6 mb-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle className="text-green-600" size={20} />
          Company Details
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Phone:</span>
            <p className="font-medium">{data.companyDetails?.phone}</p>
          </div>
          <div>
            <span className="text-gray-600">Website:</span>
            <p className="font-medium">{data.companyDetails?.website || 'N/A'}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-600">Address:</span>
            <p className="font-medium">
              {data.companyDetails?.address}, {data.companyDetails?.city}, {data.companyDetails?.country}
            </p>
          </div>
        </div>
      </div>

      {/* Documents */}
      <div className="bg-white rounded-lg border p-6 mb-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle className="text-green-600" size={20} />
          Documents Uploaded
        </h3>
        <p className="text-sm text-gray-600">
          {data.documents?.length || 0} document(s) uploaded
        </p>
      </div>

      {/* Team Members */}
      {data.teamMembers && data.teamMembers.length > 0 && (
        <div className="bg-white rounded-lg border p-6 mb-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="text-green-600" size={20} />
            Team Members
          </h3>
          <p className="text-sm text-gray-600">
            {data.teamMembers.length} team member(s) to be invited
          </p>
        </div>
      )}

      {/* Fleet */}
      {data.fleet && data.fleet.length > 0 && (
        <div className="bg-white rounded-lg border p-6 mb-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="text-green-600" size={20} />
            Fleet Vehicles
          </h3>
          <p className="text-sm text-gray-600">
            {data.fleet.length} vehicle(s) added to fleet
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle size={20} />
            <span className="font-medium">Error: {error}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between pt-6 mt-6 border-t">
        <button
          onClick={previousStep}
          disabled={submitting}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Submitting...
            </span>
          ) : (
            'Submit Registration'
          )}
        </button>
      </div>

      {/* Terms Notice */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          By submitting, you agree to our terms and conditions. Your company registration
          will be reviewed by our team within 2-5 business days.
        </p>
      </div>
    </div>
  )
}