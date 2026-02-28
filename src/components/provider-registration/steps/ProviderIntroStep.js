'use client'

import React, { useState } from 'react'
import { CheckCircle2, AlertCircle, FileText, Shield, Clock } from 'lucide-react'

export default function ProviderIntroStep({ nextStep, previousStep }) {
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const requirements = [
    {
      icon: FileText,
      title: 'Business Documentation',
      description: 'Valid business registration, tax compliance certificates, and insurance documents'
    },
    {
      icon: Shield,
      title: 'Quality Standards',
      description: 'Commitment to providing quality service and maintaining professional standards'
    },
    {
      icon: Clock,
      title: 'Response Time',
      description: 'Ability to respond to bookings within 24 hours and maintain good customer communication'
    }
  ]

  const benefits = [
    'Access to a growing customer base',
    'Online booking and scheduling system',
    'Payment processing and invoicing tools',
    'Customer management dashboard',
    'Marketing and visibility on our platform',
    'Performance analytics and insights'
  ]

  const handleContinue = () => {
    if (acceptedTerms) {
      nextStep()
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-3">
          Welcome to GariCare Provider Network
        </h2>
        <p className="text-lg text-gray-600">
          Join Kenya's leading automotive service platform
        </p>
      </div>

      {/* Benefits Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <CheckCircle2 className="text-blue-600 mr-2" size={24} />
          Benefits of Joining
        </h3>
        <ul className="space-y-2">
          {benefits.map((benefit, index) => (
            <li key={index} className="flex items-start">
              <CheckCircle2 className="text-green-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
              <span className="text-gray-700">{benefit}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Requirements Section */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">
          Registration Requirements
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {requirements.map((req, index) => {
            const Icon = req.icon
            return (
              <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                <Icon className="text-blue-600 mb-3" size={32} />
                <h4 className="font-semibold text-gray-800 mb-2">{req.title}</h4>
                <p className="text-sm text-gray-600">{req.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Process Timeline */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">
          Registration Process
        </h3>
        <div className="space-y-4">
          <div className="flex items-start">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">
              1
            </div>
            <div className="ml-4">
              <h4 className="font-semibold text-gray-800">Complete Registration Form</h4>
              <p className="text-sm text-gray-600">Provide your business information, services, and documentation (~15 minutes)</p>
            </div>
          </div>
          <div className="flex items-start">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">
              2
            </div>
            <div className="ml-4">
              <h4 className="font-semibold text-gray-800">Verification Process</h4>
              <p className="text-sm text-gray-600">Our team reviews your application and documents (2-5 business days)</p>
            </div>
          </div>
          <div className="flex items-start">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">
              3
            </div>
            <div className="ml-4">
              <h4 className="font-semibold text-gray-800">Activation & Onboarding</h4>
              <p className="text-sm text-gray-600">Get access to your dashboard and start receiving bookings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Terms and Conditions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Terms & Conditions
        </h3>
        <div className="max-h-48 overflow-y-auto bg-gray-50 rounded p-4 mb-4 text-sm text-gray-700">
          <p className="mb-3">
            <strong>1. Service Quality:</strong> You agree to provide professional automotive services 
            and maintain high standards of quality and customer service.
          </p>
          <p className="mb-3">
            <strong>2. Documentation:</strong> All business licenses, certificates, and insurance 
            must be valid and kept up to date.
          </p>
          <p className="mb-3">
            <strong>3. Platform Fees:</strong> A service fee will be charged on completed bookings 
            through the platform. Details will be provided upon approval.
          </p>
          <p className="mb-3">
            <strong>4. Customer Communication:</strong> You must respond to customer inquiries and 
            booking requests within 24 hours.
          </p>
          <p className="mb-3">
            <strong>5. Compliance:</strong> You agree to comply with all applicable laws and regulations 
            in the provision of automotive services.
          </p>
          <p className="mb-3">
            <strong>6. Data Protection:</strong> Customer information must be handled in accordance 
            with data protection laws and used only for service delivery.
          </p>
        </div>

        <label className="flex items-start cursor-pointer">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="ml-3 text-gray-700">
            I have read and agree to the Terms & Conditions and commit to maintaining 
            the required standards as a GariCare service provider
          </span>
        </label>
      </div>

      {!acceptedTerms && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start">
          <AlertCircle className="text-yellow-600 mr-3 flex-shrink-0" size={20} />
          <p className="text-sm text-yellow-800">
            Please read and accept the Terms & Conditions to continue with registration
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={previousStep}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!acceptedTerms}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Accept & Continue
        </button>
      </div>
    </div>
  )
}
