'use client'

import React, { Suspense } from 'react'
import CompanyRegistrationFlow from '@/components/company-registration/CompanyRegistrationFlow'
import { Car } from 'lucide-react'
import Link from 'next/link'

function CompanySignupContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="mb-4 inline-block text-blue-600 hover:text-blue-700 font-medium">
          ← Back to Home
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Car className="text-blue-600 mr-2" size={40} />
              <h1 className="text-3xl font-bold text-gray-800">GariCare</h1>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Company Fleet Registration</h2>
            <p className="text-gray-600 mt-2">
              Register your company to manage your fleet efficiently
            </p>
          </div>

          <CompanyRegistrationFlow />
        </div>
      </div>
    </div>
  )
}

export default function CompanySignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CompanySignupContent />
    </Suspense>
  )
}