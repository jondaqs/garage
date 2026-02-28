'use client'

import React from 'react'

export default function MechanicsStep({ data, updateData, nextStep, previousStep }) {
  const handleSkip = () => {
    updateData({ mechanics: [] })
    nextStep()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Team Members / Mechanics
        </h2>
        <p className="text-gray-600">
          Add your team members (can be added later from dashboard)
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
        <p className="text-blue-800 mb-4">
          You can add your team members after registration from your dashboard
        </p>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={previousStep}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
        >
          Back
        </button>
        <button
          onClick={handleSkip}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Skip for Now
        </button>
      </div>
    </div>
  )
}
