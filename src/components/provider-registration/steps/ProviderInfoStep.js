'use client'

import React, { useState } from 'react'
import { Building2, FileText, Hash, AlertCircle } from 'lucide-react'

export default function ProviderInfoStep({ data, updateData, nextStep, previousStep }) {
  const [formData, setFormData] = useState(data.providerInfo || {
    businessName: '',
    registrationNumber: '',
    taxId: '',
    description: '',
    yearsInOperation: '',
    email: '',
    phone: ''
  })
  
  const [errors, setErrors] = useState({})

  const validateForm = () => {
    const newErrors = {}

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Business name is required'
    }

    if (!formData.registrationNumber.trim()) {
      newErrors.registrationNumber = 'Registration number is required'
    }

    if (!formData.taxId.trim()) {
      newErrors.taxId = 'Tax ID/PIN is required'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Business description is required'
    } else if (formData.description.length < 50) {
      newErrors.description = 'Description should be at least 50 characters'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required'
    }

    if (formData.yearsInOperation && (isNaN(formData.yearsInOperation) || formData.yearsInOperation < 0)) {
      newErrors.yearsInOperation = 'Invalid number of years'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleContinue = () => {
    if (validateForm()) {
      updateData({ providerInfo: formData })
      nextStep()
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Business Information
        </h2>
        <p className="text-gray-600">
          Tell us about your business
        </p>
      </div>

      <div className="space-y-6">
        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Name *
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={formData.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
              className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.businessName ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., ABC Auto Garage"
            />
          </div>
          {errors.businessName && (
            <p className="mt-1 text-sm text-red-600 flex items-center">
              <AlertCircle size={14} className="mr-1" />
              {errors.businessName}
            </p>
          )}
        </div>

        {/* Registration Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Registration Number *
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={formData.registrationNumber}
              onChange={(e) => handleChange('registrationNumber', e.target.value)}
              className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.registrationNumber ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., BN/2024/12345"
            />
          </div>
          {errors.registrationNumber && (
            <p className="mt-1 text-sm text-red-600 flex items-center">
              <AlertCircle size={14} className="mr-1" />
              {errors.registrationNumber}
            </p>
          )}
        </div>

        {/* Tax ID/PIN */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tax ID/KRA PIN *
          </label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={formData.taxId}
              onChange={(e) => handleChange('taxId', e.target.value)}
              className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.taxId ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., A001234567B"
            />
          </div>
          {errors.taxId && (
            <p className="mt-1 text-sm text-red-600 flex items-center">
              <AlertCircle size={14} className="mr-1" />
              {errors.taxId}
            </p>
          )}
        </div>

        {/* Contact Information */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="info@yourbusiness.com"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle size={14} className="mr-1" />
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Phone *
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.phone ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="+254 712 345 678"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle size={14} className="mr-1" />
                {errors.phone}
              </p>
            )}
          </div>
        </div>

        {/* Years in Operation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Years in Operation (Optional)
          </label>
          <input
            type="number"
            min="0"
            value={formData.yearsInOperation}
            onChange={(e) => handleChange('yearsInOperation', e.target.value)}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.yearsInOperation ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="e.g., 5"
          />
          {errors.yearsInOperation && (
            <p className="mt-1 text-sm text-red-600 flex items-center">
              <AlertCircle size={14} className="mr-1" />
              {errors.yearsInOperation}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Description *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={5}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.description ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Describe your business, services offered, specializations, and what makes you unique... (minimum 50 characters)"
          />
          <div className="flex justify-between items-center mt-1">
            <div>
              {errors.description && (
                <p className="text-sm text-red-600 flex items-center">
                  <AlertCircle size={14} className="mr-1" />
                  {errors.description}
                </p>
              )}
            </div>
            <p className={`text-sm ${
              formData.description.length < 50 ? 'text-red-600' : 'text-gray-500'
            }`}>
              {formData.description.length} / 50 characters
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={previousStep}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
