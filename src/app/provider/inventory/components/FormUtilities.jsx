// src/app/provider/inventory/components/FormUtilities.jsx
// ENHANCED - Added TagInput and MultiCheckbox for Phase 2

'use client'

import { useState, useRef, useEffect } from 'react'

// Tab Container Component
export function TabContainer({ tabs, activeTab, onChange, children }) {
  return (
    <div>
      {/* Tab Headers */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                whitespace-nowrap py-4 px-4 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
              {tab.required && <span className="text-red-500 ml-1">*</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {children}
      </div>
    </div>
  )
}

// Tab Panel Component
export function TabPanel({ id, activeTab, children }) {
  if (id !== activeTab) return null
  return <div>{children}</div>
}

// Autocomplete Input Component
export function AutocompleteInput({ 
  value, 
  onChange, 
  suggestions = [], 
  placeholder = '',
  label = '',
  required = false
}) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    if (value && suggestions.length > 0) {
      const filtered = suggestions.filter(s => 
        s.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredSuggestions(filtered)
    } else {
      setFilteredSuggestions(suggestions)
    }
  }, [value, suggestions])

  const handleInputChange = (e) => {
    onChange(e.target.value)
    setShowSuggestions(true)
  }

  const handleSelectSuggestion = (suggestion) => {
    onChange(suggestion)
    setShowSuggestions(false)
  }

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      
      {/* Suggestions Dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredSuggestions.slice(0, 10).map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Tag Input Component (NEW for Phase 2)
export function TagInput({ 
  value = [], 
  onChange, 
  placeholder = 'Type and press Enter',
  label = ''
}) {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault()
      if (!value.includes(inputValue.trim())) {
        onChange([...value, inputValue.trim()])
      }
      setInputValue('')
    }
  }

  const handleRemove = (tagToRemove) => {
    onChange(value.filter(tag => tag !== tagToRemove))
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}
      
      {/* Tags Display */}
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(tag)}
              className="hover:text-blue-900"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Input */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <p className="text-xs text-gray-500 mt-1">Press Enter to add</p>
    </div>
  )
}

// Helper function to calculate profit margin
export function calculateProfitMargin(costPrice, unitPrice) {
  if (!costPrice || !unitPrice || costPrice === 0) return null
  return (((unitPrice - costPrice) / costPrice) * 100).toFixed(2)
}

// Input field component
export function InputField({ 
  label, 
  value, 
  onChange, 
  type = 'text',
  placeholder = '',
  required = false,
  min,
  max,
  step
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}

// Textarea field component
export function TextAreaField({ 
  label, 
  value, 
  onChange, 
  placeholder = '',
  rows = 3,
  required = false
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={rows}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )
}

// Select field component
export function SelectField({ 
  label, 
  value, 
  onChange, 
  options = [],
  required = false
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        value={value}
        onChange={onChange}
        required={required}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {options.map((option, index) => (
          <option key={index} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Checkbox field component
export function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  )
}

// Radio Group Component (NEW for Phase 2)
export function RadioGroup({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange(e.target.value)}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}