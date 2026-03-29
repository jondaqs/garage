'use client'
import { useState } from 'react'

export default function ReviewSubmitStep({ data, previousStep, router }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/company/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed')
      }

      // Show success and redirect
      alert('Company registered successfully! Awaiting admin approval.')
      router.push('/company/dashboard')

    } catch (err) {
      console.error('Submit error:', err)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Review & Submit</h2>
      <p className="text-gray-600 mb-6">
        Please review your information before submitting
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Company Info */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">Company Information</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-600">Company Name</dt>
              <dd className="font-medium">{data.companyInfo.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Registration Number</dt>
              <dd className="font-medium">{data.companyInfo.registrationNumber}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Tax ID</dt>
              <dd className="font-medium">{data.companyInfo.taxId}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Industry</dt>
              <dd className="font-medium">{data.companyInfo.industryType}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Company Size</dt>
              <dd className="font-medium">{data.companyInfo.companySize}</dd>
            </div>
          </dl>
        </div>

        {/* Company Details */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">Company Details</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <dt className="text-sm text-gray-600">Description</dt>
              <dd className="font-medium">{data.companyDetails.bio}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Phone</dt>
              <dd className="font-medium">{data.companyDetails.phone}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Website</dt>
              <dd className="font-medium">{data.companyDetails.website || 'N/A'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-sm text-gray-600">Address</dt>
              <dd className="font-medium">
                {data.companyDetails.address}, {data.companyDetails.city}, {data.companyDetails.country}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Operating Hours</dt>
              <dd className="font-medium">
                {data.companyDetails.openingTime} - {data.companyDetails.closingTime}
              </dd>
            </div>
          </dl>
        </div>

        {/* Documents */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-lg mb-4">Documents</h3>
          <p className="text-sm text-gray-600 mb-2">{data.documents.length} documents uploaded</p>
          <ul className="space-y-1">
            {data.documents.map((doc, index) => (
              <li key={index} className="text-sm">
                ✓ {doc.fileName}
              </li>
            ))}
          </ul>
        </div>

        {/* Team Members */}
        {data.teamMembers && data.teamMembers.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">Team Members</h3>
            <p className="text-sm text-gray-600 mb-2">
              {data.teamMembers.length} member(s) will be invited
            </p>
            <ul className="space-y-1">
              {data.teamMembers.map((member, index) => (
                <li key={index} className="text-sm">
                  • {member.firstName} {member.lastName} ({member.staffRole})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Next Steps:</strong> Your registration will be reviewed within 2-5 business days. 
          You'll receive an email notification once approved.
        </p>
      </div>

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
          className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          {submitting ? 'Submitting...' : 'Submit Registration'}
        </button>
      </div>
    </div>
  )
}