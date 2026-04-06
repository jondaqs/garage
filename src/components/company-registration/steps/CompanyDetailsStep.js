'use client'
import { useState } from 'react'
import { COUNTRIES } from '@/lib/constants/countries'

const DAYS = [
  { key: 'monday',    label: 'Mon' },
  { key: 'tuesday',  label: 'Tue' },
  { key: 'wednesday',label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday',   label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday',   label: 'Sun' },
]

export default function CompanyDetailsStep({ data, updateData, nextStep, previousStep }) {
  const [formData, setFormData] = useState({
    bio:              data?.companyDetails?.bio              || '',
    website:          data?.companyDetails?.website          || '',
    phone:            data?.companyDetails?.phone            || '',
    address:          data?.companyDetails?.address          || '',
    city:             data?.companyDetails?.city             || '',
    country:          data?.companyDetails?.country          || 'Kenya',
    yearsInOperation: data?.companyDetails?.yearsInOperation || '',
    openingTime:      data?.companyDetails?.openingTime      || '08:00',
    closingTime:      data?.companyDetails?.closingTime      || '18:00',
    // 3.2 — working days stored as array of keys e.g. ['monday','tuesday',...]
    workingDays:      data?.companyDetails?.workingDays      || ['monday','tuesday','wednesday','thursday','friday'],
  })

  const [errors, setErrors] = useState({})

  const toggleDay = (key) => {
    setFormData(prev => ({
      ...prev,
      workingDays: prev.workingDays.includes(key)
        ? prev.workingDays.filter(d => d !== key)
        : [...prev.workingDays, key],
    }))
  }

  const validate = () => {
    const e = {}
    if (!formData.bio)     e.bio     = 'Company description is required'
    if (!formData.phone)   e.phone   = 'Phone number is required'
    if (!formData.address) e.address = 'Address is required'
    if (!formData.city)    e.city    = 'City is required'
    if (formData.workingDays.length === 0) e.workingDays = 'Select at least one working day'
    return e
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

  const field = (name) => ({
    className: `w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
      errors[name] ? 'border-red-400' : 'border-gray-300'
    }`,
  })

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Company Details</h2>
      <p className="text-gray-600 mb-6">Tell us more about your company and operating hours</p>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Company Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.bio}
            onChange={e => setFormData({ ...formData, bio: e.target.value })}
            rows={4}
            {...field('bio')}
            placeholder="Briefly describe your company and the services you offer..."
          />
          {errors.bio && <p className="text-red-500 text-xs mt-1">{errors.bio}</p>}
        </div>

        {/* Website */}
        <div>
          <label className="block text-sm font-medium mb-1">Website</label>
          <input
            type="url"
            value={formData.website}
            onChange={e => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://www.yourcompany.com"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
            {...field('phone')}
            placeholder="+254 712 345 678"
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Physical Address <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
            {...field('address')}
            placeholder="123 Main Street"
          />
          {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
        </div>

        {/* City + Country — 3.1: full COUNTRIES list matching ProviderInfoStep */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={e => setFormData({ ...formData, city: e.target.value })}
              {...field('city')}
              placeholder="Nairobi"
            />
            {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <select
              value={formData.country}
              onChange={e => setFormData({ ...formData, country: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <optgroup label="East Africa (Recommended)">
                {COUNTRIES.slice(0, 10).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </optgroup>
              <optgroup label="Other African Countries">
                {COUNTRIES.slice(10, 60).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </optgroup>
              <optgroup label="International">
                {COUNTRIES.slice(60).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Years in operation */}
        <div>
          <label className="block text-sm font-medium mb-1">Years in Operation</label>
          <input
            type="number"
            value={formData.yearsInOperation}
            onChange={e => setFormData({ ...formData, yearsInOperation: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="5"
            min="0"
            max="200"
          />
        </div>

        {/* Working days — 3.2 */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Working Days <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(({ key, label }) => {
              const active = formData.workingDays.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {errors.workingDays && (
            <p className="text-red-500 text-xs mt-1">{errors.workingDays}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {formData.workingDays.length > 0
              ? `${formData.workingDays.length} day${formData.workingDays.length !== 1 ? 's' : ''} selected`
              : 'No days selected'}
          </p>
        </div>

        {/* Operating hours */}
        <div>
          <label className="block text-sm font-medium mb-2">Operating Hours</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Opening Time</label>
              <input
                type="time"
                value={formData.openingTime}
                onChange={e => setFormData({ ...formData, openingTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Closing Time</label>
              <input
                type="time"
                value={formData.closingTime}
                onChange={e => setFormData({ ...formData, closingTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-6 border-t">
          <button
            type="button"
            onClick={previousStep}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            Back
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  )
}