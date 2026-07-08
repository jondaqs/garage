'use client'
import { useState } from 'react'

export default function CompanyInfoStep({ data, updateData, nextStep, previousStep }) {
  const [formData, setFormData] = useState({
    name: data?.companyInfo?.name || '',
    registrationNumber: data?.companyInfo?.registrationNumber || '',
    taxId: data?.companyInfo?.taxId || '',
    industryType: data?.companyInfo?.industryType || '',
    companySize: data?.companyInfo?.companySize || ''
  })

  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}
    if (!formData.name) newErrors.name = 'Company name is required'
    if (!formData.registrationNumber) newErrors.registrationNumber = 'Registration number is required'
    if (!formData.taxId) newErrors.taxId = 'Tax ID is required'
    if (!formData.industryType) newErrors.industryType = 'Industry type is required'
    if (!formData.companySize) newErrors.companySize = 'Company size is required'
    return newErrors
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = validate()
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    updateData({ companyInfo: formData })
    nextStep()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Company Information</h2>
      <p className="text-gray-600 mb-6">
        Provide your company's official registration details
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Company Legal Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="e.g., ABC Transport Limited"
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Enter your company's full legal name as registered
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Company Registration Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.registrationNumber}
            onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.registrationNumber ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="e.g., C.123456"
          />
          {errors.registrationNumber && <p className="text-red-500 text-sm mt-1">{errors.registrationNumber}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Tax ID / TAX PIN <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.taxId}
            onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.taxId ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="e.g., P051234567X"
          />
          {errors.taxId && <p className="text-red-500 text-sm mt-1">{errors.taxId}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Industry Type <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.industryType}
            onChange={(e) => setFormData({ ...formData, industryType: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.industryType ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select Industry</option>
            <option value="Transportation">Transportation & Logistics</option>
            <option value="Construction">Construction</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="Retail">Retail</option>
            <option value="Technology">Technology</option>
            <option value="Healthcare">Healthcare</option>
            <option value="Hospitality">Hospitality</option>
            <option value="Agriculture">Agriculture</option>
            <option value="Other">Other</option>
          </select>
          {errors.industryType && <p className="text-red-500 text-sm mt-1">{errors.industryType}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Company Size <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.companySize}
            onChange={(e) => setFormData({ ...formData, companySize: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.companySize ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select Company Size</option>
            <option value="1-10">1-10 employees</option>
            <option value="11-50">11-50 employees</option>
            <option value="51-100">51-100 employees</option>
            <option value="101-500">101-500 employees</option>
            <option value="500+">500+ employees</option>
          </select>
          {errors.companySize && <p className="text-red-500 text-sm mt-1">{errors.companySize}</p>}
        </div>

        <div className="flex justify-between pt-6 border-t">
          <button
            type="button"
            onClick={previousStep}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  )
}