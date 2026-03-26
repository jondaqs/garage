// src/app/provider/inventory/components/DetailsModal.jsx
// View Details Modal with 4 Core Tabs (Read-only)

'use client'

import { useState } from 'react'
import { TabContainer, TabPanel, calculateProfitMargin } from './FormUtilities'

export default function DetailsModal({ item, onClose, onEdit }) {
  const [activeTab, setActiveTab] = useState('basic')

  // Calculate derived values
  const profitMargin = calculateProfitMargin(item.cost_price, item.unit_price)
  const totalValue = (item.stock * item.unit_price) || 0
  const totalCost = (item.stock * (item.cost_price || 0)) || 0
  const needsReorder = item.reorder_level && item.stock <= item.reorder_level

  // Tab configuration
  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: '📝' },
    { id: 'stock', label: 'Stock & Location', icon: '📦' },
    { id: 'pricing', label: 'Pricing', icon: '💰' },
    { id: 'notes', label: 'Notes', icon: '📄' }
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">{item.name}</h2>
              <p className="text-gray-600 mt-1">
                {item.category && `${item.category} • `}
                {item.sku && `SKU: ${item.sku}`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={onEdit}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <TabContainer tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
            {/* Tab 1: Basic Info */}
            <TabPanel id="basic" activeTab={activeTab}>
              <BasicInfoView item={item} />
            </TabPanel>

            {/* Tab 2: Stock & Location */}
            <TabPanel id="stock" activeTab={activeTab}>
              <StockView item={item} needsReorder={needsReorder} />
            </TabPanel>

            {/* Tab 3: Pricing */}
            <TabPanel id="pricing" activeTab={activeTab}>
              <PricingView item={item} profitMargin={profitMargin} totalValue={totalValue} totalCost={totalCost} />
            </TabPanel>

            {/* Tab 4: Notes */}
            <TabPanel id="notes" activeTab={activeTab}>
              <NotesView item={item} />
            </TabPanel>
          </TabContainer>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              Created: {new Date(item.created_at).toLocaleDateString()}
            </div>
            <div>
              Last Updated: {new Date(item.updated_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// VIEW COMPONENTS (Read-only displays)
// ============================================

// Basic Info View
function BasicInfoView({ item }) {
  return (
    <div className="space-y-6">
      {/* Description */}
      {item.description && (
        <DetailRow label="Description" value={item.description} />
      )}

      {/* Identification */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {item.sku && <DetailRow label="SKU" value={item.sku} />}
        {item.part_number && <DetailRow label="Part Number" value={item.part_number} />}
        {item.barcode && <DetailRow label="Barcode" value={item.barcode} />}
      </div>

      {/* Category */}
      {item.category && (
        <DetailRow 
          label="Category" 
          value={
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {item.category}
            </span>
          } 
        />
      )}

      {/* If no data */}
      {!item.description && !item.sku && !item.part_number && !item.barcode && !item.category && (
        <p className="text-gray-500 text-center py-8">No additional information available</p>
      )}
    </div>
  )
}

// Stock & Location View
function StockView({ item, needsReorder }) {
  const stockStatus = item.stock === 0 ? 'out' : item.stock <= item.min_stock_level ? 'low' : 'ok'
  
  return (
    <div className="space-y-6">
      {/* Stock Status Card */}
      <div className={`rounded-lg p-6 border-2 ${
        stockStatus === 'out' ? 'bg-red-50 border-red-200' :
        stockStatus === 'low' ? 'bg-yellow-50 border-yellow-200' :
        'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Current Stock</p>
            <p className="text-4xl font-bold mt-2">
              {item.stock}
            </p>
          </div>
          <div className="text-4xl">
            {stockStatus === 'out' ? '❌' : stockStatus === 'low' ? '⚠️' : '✅'}
          </div>
        </div>
        {stockStatus === 'out' && (
          <p className="text-red-600 font-medium mt-2">Out of Stock</p>
        )}
        {stockStatus === 'low' && (
          <p className="text-yellow-600 font-medium mt-2">Low Stock - Below Minimum Level</p>
        )}
      </div>

      {/* Stock Levels Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DetailBox label="Minimum Level" value={item.min_stock_level} />
        {item.reorder_level && (
          <DetailBox 
            label="Reorder At" 
            value={item.reorder_level}
            highlight={needsReorder}
          />
        )}
        {item.reorder_quantity && (
          <DetailBox label="Reorder Qty" value={item.reorder_quantity} />
        )}
      </div>

      {/* Reorder Alert */}
      {needsReorder && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-orange-800 font-medium">
            🔔 Reorder Alert: Stock has reached reorder level ({item.reorder_level})
          </p>
          <p className="text-sm text-orange-600 mt-1">
            Consider ordering {item.reorder_quantity} units
          </p>
        </div>
      )}

      {/* Location */}
      {item.location_in_shop && (
        <DetailRow 
          label="Location in Shop" 
          value={
            <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
              📍 {item.location_in_shop}
            </span>
          }
        />
      )}

      {/* Last Restocked */}
      {item.last_restocked_at && (
        <DetailRow 
          label="Last Restocked" 
          value={new Date(item.last_restocked_at).toLocaleString()}
        />
      )}
    </div>
  )
}

// Pricing View
function PricingView({ item, profitMargin, totalValue, totalCost }) {
  return (
    <div className="space-y-6">
      {/* Price Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {item.cost_price && (
          <DetailBox label="Cost Price" value={`${item.currency} ${item.cost_price.toLocaleString()}`} />
        )}
        <DetailBox label="Unit Price" value={`${item.currency} ${item.unit_price.toLocaleString()}`} />
        <DetailBox label="Currency" value={item.currency} />
      </div>

      {/* Profit Margin */}
      {profitMargin && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Profit Margin</p>
              <p className="text-4xl font-bold text-green-600 mt-2">
                {profitMargin}%
              </p>
            </div>
            <div className="text-4xl">💰</div>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Per Unit Profit: {item.currency} {(item.unit_price - item.cost_price).toLocaleString()}
          </p>
        </div>
      )}

      {/* Total Values */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-700">Total Inventory Value</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {item.currency} {totalValue.toLocaleString()}
          </p>
          <p className="text-xs text-gray-600 mt-2">
            {item.stock} units × {item.currency} {item.unit_price}
          </p>
        </div>

        {item.cost_price && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-700">Total Cost</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">
              {item.currency} {totalCost.toLocaleString()}
            </p>
            <p className="text-xs text-gray-600 mt-2">
              {item.stock} units × {item.currency} {item.cost_price}
            </p>
          </div>
        )}
      </div>

      {/* Potential Profit */}
      {item.cost_price && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Potential Total Profit</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {item.currency} {(totalValue - totalCost).toLocaleString()}
              </p>
            </div>
            <div className="text-4xl">📈</div>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            If all {item.stock} units are sold at current price
          </p>
        </div>
      )}
    </div>
  )
}

// Notes View
function NotesView({ item }) {
  return (
    <div className="space-y-6">
      {/* Notes */}
      {item.notes ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Internal Notes</p>
          <p className="text-gray-900 whitespace-pre-wrap">{item.notes}</p>
        </div>
      ) : (
        <p className="text-gray-500 text-center py-8">No notes added</p>
      )}

      {/* Status */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Status:</span>
          {item.is_active ? (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              ✅ Active
            </span>
          ) : (
            <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
              ❌ Inactive
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// UTILITY COMPONENTS
// ============================================

function DetailRow({ label, value }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-gray-900">{value}</p>
    </div>
  )
}

function DetailBox({ label, value, highlight = false }) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-orange-50 border-2 border-orange-300' : 'bg-gray-50 border border-gray-200'}`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-orange-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}