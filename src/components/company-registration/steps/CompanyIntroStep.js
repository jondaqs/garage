'use client'
import { useState } from 'react'

export default function CompanyIntroStep({ nextStep }) {
  const [accepted, setAccepted] = useState(false)

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Welcome to Carfix-Connect Company Registration
      </h1>
      
      <div className="prose max-w-none mb-8">
        <p className="text-lg text-gray-700 mb-4">
          Register your company to access our comprehensive fleet management and vehicle service platform.
        </p>

        <h2 className="text-xl font-semibold mt-6 mb-3">What You'll Get:</h2>
        <ul className="space-y-2 text-gray-700">
          <li>✓ Centralized fleet management dashboard</li>
          <li>✓ Easy booking of vehicle services for your entire fleet</li>
          <li>✓ Team member management with role-based permissions</li>
          <li>✓ Budget tracking and expense reporting</li>
          <li>✓ Service history and maintenance schedules</li>
          <li>✓ Priority support for company accounts</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-3">Registration Process:</h2>
        <ol className="space-y-2 text-gray-700">
          <li>1. Provide company information and details</li>
          <li>2. Upload required business documents</li>
          <li>3. Add team members (optional)</li>
          <li>4. Add fleet vehicles (optional)</li>
          <li>5. Review and submit for approval</li>
        </ol>

        <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mt-6">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> The registration process takes approximately 10-15 minutes. 
            Your application will be reviewed within 2-5 business days.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-6 mb-3">Terms & Conditions</h2>
        <div className="bg-gray-50 p-4 rounded-lg max-h-64 overflow-y-auto text-sm">
          <p className="mb-3">
            By registering your company on Carfix-Connect, you agree to the following terms:
          </p>
          <ul className="space-y-2 list-disc pl-5">
            <li>All information provided must be accurate and up-to-date</li>
            <li>You have the authority to register your company</li>
            <li>Business documents provided are valid and current</li>
            <li>You agree to our privacy policy and data handling practices</li>
            <li>Your company will comply with all service terms</li>
            <li>You authorize Carfix-Connect to verify the information provided</li>
          </ul>
        </div>
      </div>

      <div className="border-t pt-6">
        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 w-5 h-5 text-blue-600 rounded"
          />
          <span className="text-sm text-gray-700">
            I have read and agree to the Terms & Conditions and Privacy Policy. 
            I confirm that I have the authority to register this company.
          </span>
        </label>

        <div className="mt-8 flex justify-end">
          <button
            onClick={nextStep}
            disabled={!accepted}
            className={`px-8 py-3 rounded-lg font-medium ${
              accepted 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Start Registration
          </button>
        </div>
      </div>
    </div>
  )
}