'use client'

export default function FleetSetupStep({ data, updateData, nextStep, previousStep }) {

  const handleContinue = () => {
    // Pass empty fleet — vehicles are added from the dashboard after approval
    updateData({ fleet: [] })
    nextStep()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Company Fleet</h2>
      <p className="text-gray-600 mb-8">
        Vehicle registration is done from your company dashboard after your account is approved.
      </p>

      {/* Why not here */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-blue-900 mb-1">Why add fleet after approval?</p>
            <p className="text-sm text-blue-800 leading-relaxed">
              Adding vehicles requires your company account to be active. Once our team verifies 
              your registration (typically 2–5 business days), you'll have full access to the 
              Fleet section of your dashboard where you can add, manage, and assign vehicles.
            </p>
          </div>
        </div>
      </div>

      {/* What you can do after approval */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <p className="font-semibold text-gray-900 mb-4">From your dashboard you'll be able to:</p>
        <div className="space-y-3">
          {[
            { icon: '🚗', text: 'Add vehicles individually with full details (plate, make, model, VIN)' },
            { icon: '📋', text: 'Upload a CSV to bulk-import your entire fleet at once' },
            { icon: '👤', text: 'Assign drivers to specific vehicles' },
            { icon: '🔧', text: 'Book services for any vehicle in your fleet' },
            { icon: '📊', text: 'Track service history and costs per vehicle' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-lg leading-tight">{icon}</span>
              <p className="text-sm text-gray-700">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6 border-t">
        <button
          onClick={previousStep}
          className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Continue to Review →
        </button>
      </div>
    </div>
  )
}