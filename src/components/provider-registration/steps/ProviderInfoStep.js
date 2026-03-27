// src/components/provider-registration/steps/ProviderInfoStep.js
// FIXED VERSION - Correct data structure to match ReviewSubmitStep

'use client'

import { useState } from 'react'
import { COUNTRIES } from '@/lib/constants/countries'

export default function ProviderInfoStep({ data, updateData, nextStep, previousStep }) {
  const [formData, setFormData] = useState({
    businessName: data?.providerInfo?.businessName || '',
    registrationNumber: data?.providerInfo?.registrationNumber || '',
    taxId: data?.providerInfo?.taxId || '',
    description: data?.providerInfo?.description || '',
    phone: data?.providerInfo?.phone || '',
    email: data?.providerInfo?.email || '',
    yearsInOperation: data?.providerInfo?.yearsInOperation || '',
    country: data?.providerInfo?.country || 'Kenya'
  })

  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = () => {
    const newErrors = {}

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Business name is required'
    }

    if (!formData.country) {
      newErrors.country = 'Country is required'
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }

    if (formData.yearsInOperation && (isNaN(formData.yearsInOperation) || formData.yearsInOperation < 0)) {
      newErrors.yearsInOperation = 'Must be a positive number'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (isSubmitting) {
      console.log('Already submitting, please wait...')
      return
    }

    console.log('Form submitted, validating...')
    
    if (!validate()) {
      console.log('Validation failed:', errors)
      return
    }

    console.log('Validation passed, form data:', formData)

    if (typeof updateData !== 'function') {
      console.error('updateData is not a function:', updateData)
      alert('Configuration error: updateData callback is missing')
      return
    }

    if (typeof nextStep !== 'function') {
      console.error('nextStep is not a function:', nextStep)
      alert('Configuration error: nextStep callback is missing')
      return
    }

    setIsSubmitting(true)

    try {
      // ✅ CRITICAL FIX: Wrap data in providerInfo object
      updateData({ providerInfo: formData })
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      console.log('Calling nextStep...')
      nextStep()
    } catch (error) {
      console.error('Error during form submission:', error)
      alert('An error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    if (typeof previousStep === 'function') {
      previousStep()
    } else {
      console.error('previousStep is not a function')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Business Information</h2>
      <p className="text-gray-600 mb-6">Tell us about your business</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Name *
          </label>
          <input
            type="text"
            name="businessName"
            value={formData.businessName}
            onChange={handleChange}
            disabled={isSubmitting}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              errors.businessName ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="ABC Garage Services Ltd"
          />
          {errors.businessName && (
            <p className="mt-1 text-sm text-red-600">{errors.businessName}</p>
          )}
        </div>

        {/* Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Country *
          </label>
          <select
            name="country"
            value={formData.country}
            onChange={handleChange}
            disabled={isSubmitting}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              errors.country ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select a country</option>
            {COUNTRIES.map(country => (
              <option key={country.code} value={country.name}>
                {country.flag} {country.name}
              </option>
            ))}
          </select>
          {errors.country && (
            <p className="mt-1 text-sm text-red-600">{errors.country}</p>
          )}
        </div>

        {/* Registration Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Registration Number
          </label>
          <input
            type="text"
            name="registrationNumber"
            value={formData.registrationNumber}
            onChange={handleChange}
            disabled={isSubmitting}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="BN/2024/12345"
          />
        </div>

        {/* Tax ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tax ID / VAT Number
          </label>
          <input
            type="text"
            name="taxId"
            value={formData.taxId}
            onChange={handleChange}
            disabled={isSubmitting}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="P051234567A"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Phone Number *
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            disabled={isSubmitting}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              errors.phone ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="0712345678"
          />
          {errors.phone && (
            <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Email (Optional)
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            disabled={isSubmitting}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="info@abcgarage.com"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email}</p>
          )}
        </div>

        {/* Years in Operation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Years in Operation (Optional)
          </label>
          <input
            type="number"
            name="yearsInOperation"
            value={formData.yearsInOperation}
            onChange={handleChange}
            disabled={isSubmitting}
            min="0"
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
              errors.yearsInOperation ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="5"
          />
          {errors.yearsInOperation && (
            <p className="mt-1 text-sm text-red-600">{errors.yearsInOperation}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Description (Optional)
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            disabled={isSubmitting}
            rows="4"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="Brief description of your business and services..."
          />
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={isSubmitting}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}