// src/components/provider-registration/steps/ProviderInfoStep.js
// UPDATED VERSION - Includes Country Field

'use client'

import { useState, useEffect } from 'react'
import { COUNTRIES } from '@/lib/constants/countries'

export default function ProviderInfoStep({ data, onUpdate, onNext, onBack }) {
  const [formData, setFormData] = useState({
    name: data.name || '',
    registration_number: data.registration_number || '',
    tax_id: data.tax_id || '',
    description: data.description || '',
    phone: data.phone || '',
    email: data.email || '',
    years_in_operation: data.years_in_operation || '',
    country: data.country || 'Kenya' // Default to Kenya
  })

  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Business name is required'
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

    if (formData.years_in_operation && (isNaN(formData.years_in_operation) || formData.years_in_operation < 0)) {
      newErrors.years_in_operation = 'Must be a positive number'
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (validate()) {
      onUpdate(formData)
      onNext()
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
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="ABC Garage Services Ltd"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
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
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.country ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select Country</option>
            <optgroup label="East Africa">
              {COUNTRIES.slice(0, 10).map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </optgroup>
            <optgroup label="Other African Countries">
              {COUNTRIES.slice(10, 60).map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </optgroup>
            <optgroup label="International">
              {COUNTRIES.slice(60).map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </optgroup>
          </select>
          {errors.country && (
            <p className="mt-1 text-sm text-red-600">{errors.country}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Select the country where your business is registered
          </p>
        </div>

        {/* Registration Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Business Registration Number (Optional)
          </label>
          <input
            type="text"
            name="registration_number"
            value={formData.registration_number}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="PVT-1234567890"
          />
          <p className="mt-1 text-xs text-gray-500">
            Company registration or business permit number
          </p>
        </div>

        {/* Tax ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tax ID / KRA PIN (Optional)
          </label>
          <input
            type="text"
            name="tax_id"
            value={formData.tax_id}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="A123456789X"
          />
          <p className="mt-1 text-xs text-gray-500">
            Tax identification number (e.g., KRA PIN for Kenya)
          </p>
        </div>

        {/* Phone and Email */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Phone *
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.phone ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="+254712345678"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Email (Optional)
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="info@abcgarage.com"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
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
            name="years_in_operation"
            value={formData.years_in_operation}
            onChange={handleChange}
            min="0"
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.years_in_operation ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="5"
          />
          {errors.years_in_operation && (
            <p className="mt-1 text-sm text-red-600">{errors.years_in_operation}</p>
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
            rows="4"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Tell potential customers about your business, services, and what makes you unique..."
          />
          <p className="mt-1 text-xs text-gray-500">
            This will be shown to customers when they browse providers
          </p>
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
          >
            Back
          </button>
          <button
            type="submit"
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  )
}