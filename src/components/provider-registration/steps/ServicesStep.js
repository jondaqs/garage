'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Check, AlertCircle } from 'lucide-react'

export default function ServicesStep({ data, updateData, nextStep, previousStep }) {
  const supabase = createClient()
  const [services, setServices] = useState([])
  const [selectedServices, setSelectedServices] = useState(data.selectedServices || [])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchServices()
  }, [])

  const fetchServices = async () => {
    try {
      const { data: servicesData, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('display_name', { ascending: true })

      if (error) throw error

      setServices(servicesData || [])
    } catch (err) {
      setError('Failed to load services')
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleService = (service) => {
    setSelectedServices(prev => {
      const isSelected = prev.some(s => s.id === service.id)
      if (isSelected) {
        return prev.filter(s => s.id !== service.id)
      } else {
        return [...prev, service]
      }
    })
  }

  const handleContinue = () => {
    if (selectedServices.length > 0) {
      updateData({ selectedServices })
      nextStep()
    }
  }

  const filteredServices = services.filter(service =>
    service.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (service.category && service.category.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Group services by category
  const servicesByCategory = filteredServices.reduce((acc, service) => {
    const category = service.category || 'Other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(service)
    return acc
  }, {})

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
          Select Services Offered
        </h2>
        <p className="text-gray-600">
          Choose all the services your business provides
        </p>
      </div>

      {/* Selected count */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800">
          <strong>{selectedServices.length}</strong> service{selectedServices.length !== 1 ? 's' : ''} selected
          {selectedServices.length === 0 && ' (Select at least 1 service to continue)'}
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search services..."
            className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* Services by category */}
      <div className="space-y-6 max-h-[500px] overflow-y-auto mb-6">
        {Object.keys(servicesByCategory).length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No services found matching your search
          </div>
        ) : (
          Object.entries(servicesByCategory).map(([category, categoryServices]) => (
            <div key={category} className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3 text-lg">
                {category}
              </h3>
              <div className="grid md:grid-cols-2 gap-3">
                {categoryServices.map((service) => {
                  const isSelected = selectedServices.some(s => s.id === service.id)
                  
                  return (
                    <div
                      key={service.id}
                      onClick={() => toggleService(service)}
                      className={`
                        relative border-2 rounded-lg p-3 cursor-pointer transition-all
                        ${isSelected 
                          ? 'border-blue-600 bg-blue-50' 
                          : 'border-gray-200 hover:border-blue-300'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-2">
                          <h4 className="font-medium text-gray-800">
                            {service.display_name}
                          </h4>
                          {service.description && (
                            <p className="text-xs text-gray-600 mt-1">
                              {service.description}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <div className="bg-blue-600 text-white rounded-full p-1 flex-shrink-0">
                            <Check size={14} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedServices.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start">
          <AlertCircle className="text-yellow-600 mr-3 flex-shrink-0" size={20} />
          <p className="text-sm text-yellow-800">
            Please select at least one service to continue
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
          disabled={selectedServices.length === 0}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue ({selectedServices.length} selected)
        </button>
      </div>
    </div>
  )
}
