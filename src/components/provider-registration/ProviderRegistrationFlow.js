'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  User, Building2, Briefcase, MapPin, Users, Package, 
  Check, AlertCircle, ChevronRight, ChevronLeft 
} from 'lucide-react'

// Import step components
import AuthenticationStep from './steps/AuthenticationStep'
import ProviderIntroStep from './steps/ProviderIntroStep'
import ProviderTypeStep from './steps/ProviderTypeStep'
import ProviderInfoStep from './steps/ProviderInfoStep'
import ServicesStep from './steps/ServicesStep'
import DocumentsStep from './steps/DocumentsStep'
import ShopSetupStep from './steps/ShopSetupStep'
import MechanicsStep from './steps/MechanicsStep'
import SparePartsStep from './steps/SparePartsStep'
import BankingInfoStep from './steps/BankingInfoStep'
import ReviewSubmitStep from './steps/ReviewSubmitStep'

const STEPS = [
  { id: 'auth', title: 'Account', icon: User, component: AuthenticationStep },
  { id: 'intro', title: 'Introduction', icon: AlertCircle, component: ProviderIntroStep },
  { id: 'type', title: 'Provider Type', icon: Building2, component: ProviderTypeStep },
  { id: 'info', title: 'Business Info', icon: Briefcase, component: ProviderInfoStep },
  { id: 'services', title: 'Services', icon: Briefcase, component: ServicesStep },
  { id: 'documents', title: 'Documents', icon: Briefcase, component: DocumentsStep },
  { id: 'shops', title: 'Shop Locations', icon: MapPin, component: ShopSetupStep },
  { id: 'mechanics', title: 'Team Members', icon: Users, component: MechanicsStep },
  { id: 'parts', title: 'Inventory', icon: Package, component: SparePartsStep },
  { id: 'banking', title: 'Banking', icon: Briefcase, component: BankingInfoStep },
  { id: 'review', title: 'Review & Submit', icon: Check, component: ReviewSubmitStep }
]

export default function ProviderRegistrationFlow() {
  const router = useRouter()
  const supabase = createClient()
  
  const [currentStep, setCurrentStep] = useState(0)
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Registration data state
  const [registrationData, setRegistrationData] = useState({
    // Auth data
    authData: null,
    
    // Provider type
    providerType: null,
    
    // Provider info
    providerInfo: {
      businessName: '',
      registrationNumber: '',
      taxId: '',
      description: ''
    },
    
    // Services
    selectedServices: [],
    
    // Documents
    documents: [],
    
    // Shops
    shops: [],
    
    // Mechanics
    mechanics: [],
    
    // Spare parts
    spareParts: [],
    
    // Banking
    banking: {
      bankName: '',
      accountNumber: '',
      accountName: '',
      mobileMoneyNumber: ''
    },
    
    // Provider ID after creation
    providerId: null
  })

  // Check if user is already authenticated
  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        setUser(user)
        
        // Check if user profile exists
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('auth_user_id', user.id)
          .single()
        
        if (profile) {
          setUserProfile(profile)
          // Skip auth step if already authenticated
          setCurrentStep(1)
        }
      }
    } catch (error) {
      console.error('Error checking user:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateRegistrationData = (stepData) => {
    setRegistrationData(prev => ({
      ...prev,
      ...stepData
    }))
  }

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const goToStep = (stepIndex) => {
    setCurrentStep(stepIndex)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const CurrentStepComponent = STEPS[currentStep].component

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-700">
            Step {currentStep + 1} of {STEPS.length}
          </h3>
          <span className="text-sm text-gray-500">
            {Math.round(((currentStep + 1) / STEPS.length) * 100)}% Complete
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="hidden md:flex justify-between mt-6">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isCompleted = index < currentStep
            const isCurrent = index === currentStep
            
            return (
              <div 
                key={step.id}
                className={`flex flex-col items-center cursor-pointer transition-all ${
                  isCompleted || isCurrent ? 'opacity-100' : 'opacity-40'
                }`}
                onClick={() => isCompleted && goToStep(index)}
              >
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center mb-2
                  ${isCompleted ? 'bg-green-500 text-white' : 
                    isCurrent ? 'bg-blue-600 text-white' : 
                    'bg-gray-200 text-gray-500'}
                `}>
                  {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                </div>
                <span className={`text-xs text-center ${
                  isCurrent ? 'font-semibold text-blue-600' : 'text-gray-600'
                }`}>
                  {step.title}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current step component */}
      <div className="bg-gray-50 rounded-lg p-6">
        <CurrentStepComponent
          data={registrationData}
          updateData={updateRegistrationData}
          nextStep={nextStep}
          previousStep={previousStep}
          user={user}
          setUser={setUser}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
        />
      </div>
    </div>
  )
}
