'use client'

// src/app/provider/inventory/page.js
// Complete inventory management for service providers

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProviderInventoryPage() {
  const [inventory, setInventory] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    loadInventory()
  }, [])

  async function loadInventory() {
    try {
      setLoading(true)
      const response = await fetch('/api/inventory')
      const data = await response.json()

      if (response.ok) {
        setInventory(data.inventory || [])
        setStats(data.stats)
        setReadOnly(data.readOnly || false)
      } else {
        alert(data.error || 'Failed to load inventory')
      }
    } catch (error) {
      console.error('Load inventory error:', error)
      alert('Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }

  // Get unique categories
  const categories = [...new Set(inventory.map(item => item.category).filter(Boolean))]

  // Filter inventory
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.part_number?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory
    
    const matchesStatus = filterStatus === 'all' ||
                         (filterStatus === 'low_stock' && item.stock <= item.min_stock_level) ||
                         (filterStatus === 'out_of_stock' && item.stock === 0) ||
                         (filterStatus === 'in_stock' && item.stock > item.min_stock_level)
    
    return matchesSearch && matchesCategory && matchesStatus
  })

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600 mt-1">Manage your spare parts and stock levels</p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <span>➕</span>
            Add Part
          </button>
        )}
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <StatCard
            title="Total Items"
            value={stats.totalItems}
            icon="📦"
            color="blue"
          />
          <StatCard
            title="Active Items"
            value={stats.activeItems}
            icon="✅"
            color="green"
          />
          <StatCard
            title="Low Stock"
            value={stats.lowStockItems}
            icon="⚠️"
            color="yellow"
          />
          <StatCard
            title="Out of Stock"
            value={stats.outOfStockItems}
            icon="❌"
            color="red"
          />
          <StatCard
            title="Total Value"
            value={`KES ${stats.totalValue.toLocaleString()}`}
            icon="💰"
            color="purple"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, SKU, or part number..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stock Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Part Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    {searchTerm || filterCategory !== 'all' || filterStatus !== 'all' 
                      ? 'No items match your filters' 
                      : 'No inventory items yet. Click "Add Part" to get started.'}
                  </td>
                </tr>
              ) : (
                filteredInventory.map(item => (
                  <InventoryRow
                    key={item.id}
                    item={item}
                    onEdit={() => {
                      setSelectedItem(item)
                      setShowEditModal(true)
                    }}
                    onAdjust={() => {
                      setSelectedItem(item)
                      setShowAdjustModal(true)
                    }}
                    onDelete={async () => {
                      if (confirm(`Delete "${item.name}"?`)) {
                        await deleteItem(item.id)
                      }
                    }}
                    readOnly={readOnly}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            loadInventory()
          }}
        />
      )}

      {showEditModal && selectedItem && (
        <EditItemModal
          item={selectedItem}
          onClose={() => {
            setShowEditModal(false)
            setSelectedItem(null)
          }}
          onSuccess={() => {
            setShowEditModal(false)
            setSelectedItem(null)
            loadInventory()
          }}
        />
      )}

      {showAdjustModal && selectedItem && (
        <AdjustStockModal
          item={selectedItem}
          onClose={() => {
            setShowAdjustModal(false)
            setSelectedItem(null)
          }}
          onSuccess={() => {
            setShowAdjustModal(false)
            setSelectedItem(null)
            loadInventory()
          }}
        />
      )}
    </div>
  )

  async function deleteItem(id) {
    try {
      const response = await fetch(`/api/inventory/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        loadInventory()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete item')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete item')
    }
  }
}

// Stat Card Component
function StatCard({ title, value, icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200'
  }

  return (
    <div className={`rounded-lg p-6 border-2 ${colors[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  )
}

// Inventory Row Component
function InventoryRow({ item, onEdit, onAdjust, onDelete, readOnly }) {
  const stockStatus = item.stock === 0 ? 'out' : item.stock <= item.min_stock_level ? 'low' : 'ok'
  
  return (
    <tr className={!item.is_active ? 'opacity-50 bg-gray-50' : ''}>
      <td className="px-6 py-4">
        <div>
          <div className="font-medium text-gray-900">{item.name}</div>
          <div className="text-sm text-gray-500">
            {item.part_number && `PN: ${item.part_number}`}
            {item.sku && ` • SKU: ${item.sku}`}
            {item.brand && ` • ${item.brand}`}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        {item.category && (
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
            {item.category}
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div>
          <div className="font-medium">{item.stock}</div>
          <div className="text-xs text-gray-500">Min: {item.min_stock_level}</div>
        </div>
      </td>
      <td className="px-6 py-4">
        {item.currency} {item.unit_price?.toLocaleString() || '0'}
      </td>
      <td className="px-6 py-4 font-medium">
        {item.currency} {((item.stock * item.unit_price) || 0).toLocaleString()}
      </td>
      <td className="px-6 py-4">
        {stockStatus === 'out' && (
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
            Out of Stock
          </span>
        )}
        {stockStatus === 'low' && (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
            Low Stock
          </span>
        )}
        {stockStatus === 'ok' && (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
            In Stock
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-right space-x-2">
        {!readOnly && (
          <>
            <button
              onClick={onAdjust}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Adjust
            </button>
            <button
              onClick={onEdit}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  )
}

// Add Item Modal
function AddItemModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    part_number: '',
    brand: '',
    category: '',
    stock: 0,
    min_stock_level: 0,
    unit_price: 0
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to add item')
      }
    } catch (error) {
      console.error('Add item error:', error)
      alert('Failed to add item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">Add Inventory Item</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Part Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SKU
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Part Number
              </label>
              <input
                type="text"
                value={formData.part_number}
                onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand
              </label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Filters, Brakes, Engine"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Initial Stock
              </label>
              <input
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Stock Level
              </label>
              <input
                type="number"
                min="0"
                value={formData.min_stock_level}
                onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit Price (KES)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Item Modal (similar to Add, but with existing data)
function EditItemModal({ item, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: item.name || '',
    sku: item.sku || '',
    part_number: item.part_number || '',
    brand: item.brand || '',
    category: item.category || '',
    stock: item.stock || 0,
    min_stock_level: item.min_stock_level || 0,
    unit_price: item.unit_price || 0,
    is_active: item.is_active !== false
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch(`/api/inventory/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to update item')
      }
    } catch (error) {
      console.error('Update item error:', error)
      alert('Failed to update item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">Edit Inventory Item</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Part Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SKU
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Part Number
              </label>
              <input
                type="text"
                value={formData.part_number}
                onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand
              </label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stock
              </label>
              <input
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Stock Level
              </label>
              <input
                type="number"
                min="0"
                value={formData.min_stock_level}
                onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit Price (KES)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Adjust Stock Modal
function AdjustStockModal({ item, onClose, onSuccess }) {
  const [adjustment, setAdjustment] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const newStock = item.stock + (parseInt(adjustment) || 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          adjustment: parseInt(adjustment),
          reason 
        })
      })

      const data = await response.json()

      if (response.ok) {
        onSuccess()
      } else {
        alert(data.error || 'Failed to adjust stock')
      }
    } catch (error) {
      console.error('Adjust stock error:', error)
      alert('Failed to adjust stock')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">Adjust Stock</h2>
          <p className="text-gray-600 mt-1">{item.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="text-sm text-gray-600 mb-1">Current Stock</div>
              <div className="text-3xl font-bold text-gray-900">{item.stock}</div>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Adjustment
            </label>
            <input
              type="number"
              required
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="Enter + or - value (e.g., +10 or -5)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-1">
              Use positive numbers to add stock, negative to reduce
            </p>

            {adjustment && (
              <div className={`mt-4 p-4 rounded-lg ${newStock < 0 ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
                <div className="text-sm font-medium mb-1">
                  {newStock < 0 ? '❌ Invalid' : '✅ New Stock'}
                </div>
                <div className="text-2xl font-bold">
                  {item.stock} {parseInt(adjustment) > 0 ? '+' : ''}{adjustment} = {newStock}
                </div>
                {newStock < 0 && (
                  <p className="text-sm text-red-600 mt-1">Stock cannot be negative</p>
                )}
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason (Optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., New shipment arrived, Stock check correction, Used for work order"
              rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !adjustment || newStock < 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Adjusting...' : 'Adjust Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}