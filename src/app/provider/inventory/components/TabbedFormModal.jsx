// src/app/provider/inventory/components/TabbedFormModal.jsx
// FINAL FIX: UUID bug resolved with extensive debugging

'use client'

import { useState } from 'react'
import { TabContainer, TabPanel, AutocompleteInput, InputField, TextAreaField, SelectField, CheckboxField, calculateProfitMargin } from './FormUtilities'

export default function TabbedFormModal({ 
  mode = 'add', 
  item = null, 
  onClose, 
  onSuccess,
  existingCategories = [],
  existingSuppliers = [],
  existingLocations = []
}) {
  const [activeTab, setActiveTab] = useState('basic')
  const [submitting, setSubmitting] = useState(false)
  
  // DEBUG: Log what we received
  console.log('🔧 TabbedFormModal props:', { mode, item, itemId: item?.id })
  
  // CRITICAL: Save item ID separately so it's not lost during state updates
  const itemId = item?.id
  
  console.log('💾 Saved itemId:', itemId) // DEBUG
  
  // Initialize form data
  const [formData, setFormData] = useState({
    // Basic Info
    name: item?.name || '',
    description: item?.description || '',
    sku: item?.sku || '',
    part_number: item?.part_number || '',
    barcode: item?.barcode || '',
    category: item?.category || '',
    
    // Stock & Location
    stock: item?.stock || 0,
    min_stock_level: item?.min_stock_level || 0,
    reorder_level: item?.reorder_level || '',
    reorder_quantity: item?.reorder_quantity || '',
    location_in_shop: item?.location_in_shop || '',
    
    // Pricing
    cost_price: item?.cost_price || '',
    unit_price: item?.unit_price || 0,
    currency: item?.currency || 'KES',
    
    // Notes
    notes: item?.notes || '',
    is_active: item?.is_active !== false
  })

  // Handle field change
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Tab configuration
  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: '📝', required: true },
    { id: 'stock', label: 'Stock & Location', icon: '📦', required: true },
    { id: 'pricing', label: 'Pricing', icon: '💰', required: true },
    { id: 'notes', label: 'Notes', icon: '📄' }
  ]

  // Validate required fields
  const validateForm = () => {
    if (!formData.name) {
      alert('Part name is required')
      setActiveTab('basic')
      return false
    }
    if (formData.stock < 0) {
      alert('Stock cannot be negative')
      setActiveTab('stock')
      return false
    }
    if (!formData.unit_price || formData.unit_price <= 0) {
      alert('Unit price is required and must be greater than 0')
      setActiveTab('pricing')
      return false
    }
    return true
  }

  // Handle save button click (not form submit)
  const handleSaveClick = async () => {
    if (!validateForm()) return
    
    // Validate we have ID for edit mode
    if (mode === 'edit' && !itemId) {
      console.error('❌ Edit mode but no item ID available')
      console.error('Item prop:', item)
      console.error('itemId variable:', itemId)
      alert('Error: Item ID is missing. Cannot update.')
      return
    }
    
    setSubmitting(true)

    try {
      const url = mode === 'add' 
        ? '/api/inventory'
        : `/api/inventory/${itemId}`
      
      const method = mode === 'add' ? 'POST' : 'PUT'
      
      console.log(`📡 ${mode.toUpperCase()} request to:`, url) // DEBUG
      console.log('📦 Data being sent:', formData) // DEBUG
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        console.log('✅ Success:', data) // DEBUG
        onSuccess()
      } else {
        console.error('❌ Server error:', data) // DEBUG
        alert(data.error || `Failed to ${mode} item`)
      }
    } catch (error) {
      console.error(`❌ ${mode} error:`, error)
      alert(`Failed to ${mode} item`)
    } finally {
      setSubmitting(false)
    }
  }

  // Navigate tabs
  const currentTabIndex = tabs.findIndex(t => t.id === activeTab)
  const canGoNext = currentTabIndex < tabs.length - 1
  const canGoPrevious = currentTabIndex > 0

  const handleNext = () => {
    if (canGoNext) {
      setActiveTab(tabs[currentTabIndex + 1].id)
    }
  }

  const handlePrevious = () => {
    if (canGoPrevious) {
      setActiveTab(tabs[currentTabIndex - 1].id)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">
              {mode === 'add' ? 'Add Inventory Item' : `Edit Inventory Item ${itemId ? `(ID: ${itemId.slice(0, 8)}...)` : ''}`}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content - NOT wrapped in form to prevent auto-submit */}
        <div className="p-6">
          <TabContainer tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
            {/* Tab 1: Basic Info */}
            <TabPanel id="basic" activeTab={activeTab}>
              <BasicInfoTab 
                formData={formData}
                onChange={handleChange}
                existingCategories={existingCategories}
              />
            </TabPanel>

            {/* Tab 2: Stock & Location */}
            <TabPanel id="stock" activeTab={activeTab}>
              <StockTab 
                formData={formData}
                onChange={handleChange}
                existingLocations={existingLocations}
              />
            </TabPanel>

            {/* Tab 3: Pricing */}
            <TabPanel id="pricing" activeTab={activeTab}>
              <PricingTab 
                formData={formData}
                onChange={handleChange}
              />
            </TabPanel>

            {/* Tab 4: Notes */}
            <TabPanel id="notes" activeTab={activeTab}>
              <NotesTab 
                formData={formData}
                onChange={handleChange}
              />
            </TabPanel>
          </TabContainer>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
            <div>
              {canGoPrevious && (
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ← Previous
                </button>
              )}
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              
              {canGoNext ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : mode === 'add' ? 'Add Item' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// TAB COMPONENTS
// ============================================

// Tab 1: Basic Info
function BasicInfoTab({ formData, onChange, existingCategories }) {
  return (
    <div className="space-y-6">
      {/* Part Name - Required */}
      <InputField
        label="Part Name"
        value={formData.name}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="e.g., Engine Oil Filter"
        required
      />

      {/* Description */}
      <TextAreaField
        label="Description"
        value={formData.description}
        onChange={(e) => onChange('description', e.target.value)}
        placeholder="Detailed description of the part..."
        rows={3}
      />

      {/* SKU, Part Number, Barcode - Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InputField
          label="SKU"
          value={formData.sku}
          onChange={(e) => onChange('sku', e.target.value)}
          placeholder="SKU-001"
        />
        <InputField
          label="Part Number"
          value={formData.part_number}
          onChange={(e) => onChange('part_number', e.target.value)}
          placeholder="PN-12345"
        />
        <InputField
          label="Barcode"
          value={formData.barcode}
          onChange={(e) => onChange('barcode', e.target.value)}
          placeholder="123456789"
        />
      </div>

      {/* Category with Autocomplete */}
      <AutocompleteInput
        label="Category"
        value={formData.category}
        onChange={(value) => onChange('category', value)}
        suggestions={existingCategories}
        placeholder="e.g., Filters, Brakes, Engine"
      />
    </div>
  )
}

// Tab 2: Stock & Location
function StockTab({ formData, onChange, existingLocations }) {
  return (
    <div className="space-y-6">
      {/* Stock Levels - Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <InputField
          label="Current Stock"
          type="number"
          value={formData.stock}
          onChange={(e) => onChange('stock', e.target.value)}
          min="0"
          required
        />
        <InputField
          label="Minimum Level"
          type="number"
          value={formData.min_stock_level}
          onChange={(e) => onChange('min_stock_level', e.target.value)}
          min="0"
        />
        <InputField
          label="Reorder At"
          type="number"
          value={formData.reorder_level}
          onChange={(e) => onChange('reorder_level', e.target.value)}
          min="0"
          placeholder="Optional"
        />
        <InputField
          label="Reorder Quantity"
          type="number"
          value={formData.reorder_quantity}
          onChange={(e) => onChange('reorder_quantity', e.target.value)}
          min="0"
          placeholder="Optional"
        />
      </div>

      {/* Location with Autocomplete */}
      <AutocompleteInput
        label="Location in Shop"
        value={formData.location_in_shop}
        onChange={(value) => onChange('location_in_shop', value)}
        suggestions={existingLocations}
        placeholder="e.g., Shelf A-12, Bin 5, Warehouse"
      />

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Set a minimum stock level to get low stock alerts. 
          Set a reorder level to know when to restock.
        </p>
      </div>
    </div>
  )
}

// Tab 3: Pricing
function PricingTab({ formData, onChange }) {
  const profitMargin = calculateProfitMargin(
    parseFloat(formData.cost_price) || 0,
    parseFloat(formData.unit_price) || 0
  )

  const showWarning = formData.cost_price && formData.unit_price && 
                      parseFloat(formData.cost_price) > parseFloat(formData.unit_price)

  return (
    <div className="space-y-6">
      {/* Pricing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InputField
          label="Cost Price"
          type="number"
          value={formData.cost_price}
          onChange={(e) => onChange('cost_price', e.target.value)}
          min="0"
          step="0.01"
          placeholder="What you pay"
        />
        <InputField
          label="Unit Price"
          type="number"
          value={formData.unit_price}
          onChange={(e) => onChange('unit_price', e.target.value)}
          min="0"
          step="0.01"
          required
          placeholder="What you charge"
        />
        <SelectField
          label="Currency"
          value={formData.currency}
          onChange={(e) => onChange('currency', e.target.value)}
          options={[
            { value: 'KES', label: 'KES - Kenyan Shilling' },
            { value: 'USD', label: 'USD - US Dollar' },
            { value: 'EUR', label: 'EUR - Euro' },
            { value: 'GBP', label: 'GBP - British Pound' }
          ]}
        />
      </div>

      {/* Profit Margin Display */}
      {profitMargin && (
        <div className={`rounded-lg p-4 ${showWarning ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Profit Margin</p>
              <p className={`text-2xl font-bold ${showWarning ? 'text-red-600' : 'text-green-600'}`}>
                {profitMargin}%
              </p>
            </div>
            {showWarning && (
              <div className="text-red-600">
                <p className="text-sm font-medium">⚠️ Warning</p>
                <p className="text-xs">Cost is higher than price!</p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Calculation: ((Unit Price - Cost Price) / Cost Price) × 100
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Enter the cost price to track profit margins. 
          This helps you understand which parts are most profitable.
        </p>
      </div>
    </div>
  )
}

// Tab 4: Notes
function NotesTab({ formData, onChange }) {
  return (
    <div className="space-y-6">
      {/* Internal Notes */}
      <TextAreaField
        label="Internal Notes"
        value={formData.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        placeholder="Add any internal notes, comments, or special instructions..."
        rows={6}
      />

      {/* Active Status */}
      <div className="pt-4 border-t border-gray-200">
        <CheckboxField
          label="Active"
          checked={formData.is_active}
          onChange={(e) => onChange('is_active', e.target.checked)}
        />
        <p className="text-sm text-gray-500 mt-2 ml-6">
          Inactive items are hidden from most views but can still be found in searches.
        </p>
      </div>
    </div>
  )
}