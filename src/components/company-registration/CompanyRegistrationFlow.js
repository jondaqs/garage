'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CompanyIntroStep from './steps/CompanyIntroStep'
import CompanyInfoStep from './steps/CompanyInfoStep'
import CompanyDetailsStep from './steps/CompanyDetailsStep'
import DocumentsStep from './steps/DocumentsStep'
import TeamMembersStep from './steps/TeamMembersStep'
import FleetSetupStep from './steps/FleetSetupStep'
import ReviewSubmitStep from './steps/ReviewSubmitStep'

export default function CompanyRegistrationFlow() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    companyInfo: {
      name: '',
      registrationNumber: '',
      taxId: '',
      industryType: '',
      companySize: ''
    },
    companyDetails: {
      bio: '',
      website: '',
      phone: '',
      address: '',
      city: '',
      country: 'Kenya',
      yearsInOperation: '',
      openingTime: '08:00',
      closingTime: '18:00'
    },
    documents: [],
    teamMembers: [],
    fleet: []
  })

  const steps = [
    { id: 1, name: 'Introduction', component: CompanyIntroStep },
    { id: 2, name: 'Company Info', component: CompanyInfoStep },
    { id: 3, name: 'Details', component: CompanyDetailsStep },
    { id: 4, name: 'Documents', component: DocumentsStep },
    { id: 5, name: 'Team (Optional)', component: TeamMembersStep },
    { id: 6, name: 'Fleet (Optional)', component: FleetSetupStep },
    { id: 7, name: 'Review & Submit', component: ReviewSubmitStep }
  ]

  const updateData = (newData) => {
    setFormData(prev => ({ ...prev, ...newData }))
  }

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const previousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const CurrentStepComponent = steps[currentStep - 1].component

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  currentStep >= step.id 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  {step.id}
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 ${
                    currentStep > step.id ? 'bg-blue-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm">
            {steps.map(step => (
              <div 
                key={step.id} 
                className={`flex-1 text-center ${
                  currentStep === step.id ? 'font-bold text-blue-600' : 'text-gray-500'
                }`}
              >
                {step.name}
              </div>
            ))}
          </div>
        </div>

        {/* Current Step Component */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <CurrentStepComponent
            data={formData}
            updateData={updateData}
            nextStep={nextStep}
            previousStep={previousStep}
            router={router}
          />
        </div>
      </div>
    </div>
  )
}