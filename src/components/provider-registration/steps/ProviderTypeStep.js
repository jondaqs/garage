'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Store, Wrench, Building, Sparkles, Check } from 'lucide-react'

const PROVIDER_TYPE_ICONS = {
  garage: Store,
  mobile: Wrench,
  dealership: Building,
  specialist: Sparkles
}

export default function ProviderTypeStep({ data, updateData, nextStep, previousStep }) {
  const supabase = createClient()
  const [providerTypes, setProviderTypes] = useState([])
  const [selectedType, setSelectedType] = useState(data.providerType || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchProviderTypes()
  }, [])

  const fetchProviderTypes = async () => {
    try {
      const { data: types, error } = await supabase
        .from('service_provider_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (error) throw error

      setProviderTypes(types || [])
    } catch (err) {
      setError('Failed to load provider types')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = () => {
    if (selectedType) {
      updateData({ providerType: selectedType })
      nextStep()
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Select Your Provider Type
        </h2>
        <p className="text-gray-600">
          Choose the category that best describes your business
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {providerTypes.map((type) => {
          const IconComponent = PROVIDER_TYPE_ICONS[type.code] || Store
          const isSelected = selectedType?.id === type.id

          return (
            <div
              key={type.id}
              onClick={() => setSelectedType(type)}
              className={`
                relative border-2 rounded-xl p-6 cursor-pointer transition-all
                ${isSelected 
                  ? 'border-blue-600 bg-blue-50 shadow-md' 
                  : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                }
              `}
            >
              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div className="bg-blue-600 text-white rounded-full p-1">
                    <Check size={16} />
                  </div>
                </div>
              )}

              <div className="flex items-start space-x-4">
                <div className={`
                  p-3 rounded-lg
                  ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}
                `}>
                  <IconComponent size={28} />
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    {type.display_name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {type.description}
                  </p>

                  {/* Features/Examples */}
                  <div className="text-xs text-gray-500 space-y-1">
                    {type.code === 'garage' && (
                      <>
                        <div>• Full-service auto repair shop</div>
                        <div>• Multiple service bays</div>
                        <div>• Team of mechanics</div>
                      </>
                    )}
                    {type.code === 'mobile' && (
                      <>
                        <div>• On-location service</div>
                        <div>• Flexible scheduling</div>
                        <div>• Mobile equipment</div>
                      </>
                    )}
                    {type.code === 'dealership' && (
                      <>
                        <div>• Authorized dealer</div>
                        <div>• Brand-specific service</div>
                        <div>• OEM parts</div>
                      </>
                    )}
                    {type.code === 'specialist' && (
                      <>
                        <div>• Focused expertise</div>
                        <div>• Specialized equipment</div>
                        <div>• Specific services</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

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
          disabled={!selectedType}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
