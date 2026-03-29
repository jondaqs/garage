'use client'
import { useState } from 'react'

export default function CompanyDetailsStep({ data, updateData, nextStep, previousStep }) {
  const [formData, setFormData] = useState({
    bio: data?.companyDetails?.bio || '',
    website: data?.companyDetails?.website || '',
    phone: data?.companyDetails?.phone || '',
    address: data?.companyDetails?.address || '',
    city: data?.companyDetails?.city || '',
    country: data?.companyDetails?.country || 'Kenya',
    yearsInOperation: data?.companyDetails?.yearsInOperation || '',
    openingTime: data?.companyDetails?.openingTime || '08:00',
    closingTime: data?.companyDetails?.closingTime || '18:00'
  })

  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}
    if (!formData.bio) newErrors.bio = 'Company description is required'
    if (!formData.phone) newErrors.phone = 'Phone number is required'
    if (!formData.address) newErrors.address = 'Address is required'
    if (!formData.city) newErrors.city = 'City is required'
    return newErrors
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = validate()
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    updateData({ companyDetails: formData })
    nextStep()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Company Details</h2>
      <p className="text-gray-600 mb-6">
        Tell us more about your company and operating hours
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Company Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            rows={4}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.bio ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Briefly describe your company and services..."
          />
          {errors.bio && <p className="text-red-500 text-sm mt-1">{errors.bio}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Website
          </label>
          <input
            type="url"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="https://www.yourcompany.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.phone ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="+254 712 345 678"
          />
          {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Physical Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.address ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="123 Main Street"
          />
          {errors.address && <p className="text-red-500 text-sm mt-1">{errors.address}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.city ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Nairobi"
            />
            {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Country
            </label>
            <select
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="Kenya">Kenya</option>
              <option value="Uganda">Uganda</option>
              <option value="Tanzania">Tanzania</option>
              <option value="Rwanda">Rwanda</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Years in Operation
          </label>
          <input
            type="number"
            value={formData.yearsInOperation}
            onChange={(e) => setFormData({ ...formData, yearsInOperation: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="5"
            min="0"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-4">
            Operating Hours
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Opening Time
              </label>
              <input
                type="time"
                value={formData.openingTime}
                onChange={(e) => setFormData({ ...formData, openingTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Closing Time
              </label>
              <input
                type="time"
                value={formData.closingTime}
                onChange={(e) => setFormData({ ...formData, closingTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
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