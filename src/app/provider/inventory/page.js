'use client'

// FIXED VERSION with Debug Logging and Safety Checks
// This version has console.log statements to help diagnose the UUID error

import { useState, useEffect } from 'react'
import TabbedFormModal from './components/TabbedFormModal'
import DetailsModal from './components/DetailsModal'
import AdjustStockModal from './components/AdjustStockModal'

export default function ProviderInventoryPage() {
  const [inventory, setInventory] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [readOnly, setReadOnly] = useState(false)
  const [shops, setShops] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [provider, setProvider] = useState(null)

  useEffect(() => {
    loadInventory()
  }, [])

  async function loadInventory() {
    try {
      setLoading(true)
      const response = await fetch('/api/inventory')
      const data = await response.json()

      if (response.ok) {
        console.log('✅ Loaded inventory:', data.inventory?.length, 'items') // DEBUG
        console.log('Sample item:', data.inventory?.[0]) // DEBUG - Check if ID exists
        setInventory(data.inventory || [])
        setStats(data.stats)
        setReadOnly(data.readOnly || false)
        if (data.shops) setShops(data.shops)
        if (data.currencies) setCurrencies(data.currencies)
        if (data.provider) setProvider(data.provider)
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

  async function deleteItem(id) {
    if (!id) {
      console.error('❌ Delete called with undefined ID')
      alert('Error: Item ID is missing')
      return
    }

    try {
      console.log('🗑️ Deleting item with ID:', id) // DEBUG
      const response = await fetch(`/api/inventory/${id}`, { method: 'DELETE' })
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

  // Safe handlers with validation
  const handleView = (item) => {
    console.log('👁️ View clicked, item:', item) // DEBUG
    console.log('Item ID:', item?.id) // DEBUG
    if (!item || !item.id) {
      console.error('❌ Invalid item for view:', item)
      alert('Error: Invalid item data (missing ID)')
      return
    }
    setSelectedItem(item)
    setShowDetailsModal(true)
  }

  const handleEdit = (item) => {
    console.log('✏️ Edit clicked, item:', item) // DEBUG
    console.log('Item ID:', item?.id) // DEBUG
    if (!item || !item.id) {
      console.error('❌ Invalid item for edit:', item)
      alert('Error: Invalid item data (missing ID)')
      return
    }
    setSelectedItem(item)
    setShowEditModal(true)
  }

  const handleAdjust = (item) => {
    console.log('📊 Adjust clicked, item:', item) // DEBUG
    console.log('Item ID:', item?.id) // DEBUG
    if (!item || !item.id) {
      console.error('❌ Invalid item for adjust:', item)
      alert('Error: Invalid item data (missing ID)')
      return
    }
    setSelectedItem(item)
    setShowAdjustModal(true)
  }

  const handleDelete = (item) => {
    console.log('🗑️ Delete clicked, item:', item) // DEBUG
    console.log('Item ID:', item?.id) // DEBUG
    if (!item || !item.id) {
      console.error('❌ Invalid item for delete:', item)
      alert('Error: Invalid item data (missing ID)')
      return
    }
    if (confirm(`Delete "${item.name}"?`)) {
      deleteItem(item.id)
    }
  }

  const categories = [...new Set(inventory.map(item => item.category).filter(Boolean))]
  const suppliers = [...new Set(inventory.map(item => item.supplier_name).filter(Boolean))]
  const locations = [...new Set(inventory.map(item => item.location_in_shop).filter(Boolean))]

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.part_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description?.toLowerCase().includes(searchTerm.toLowerCase())
    
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
          <StatCard title="Total Items" value={stats.totalItems} icon="📦" color="blue" />
          <StatCard title="Active Items" value={stats.activeItems} icon="✅" color="green" />
          <StatCard title="Low Stock" value={stats.lowStockItems} icon="⚠️" color="yellow" />
          <StatCard title="Out of Stock" value={stats.outOfStockItems} icon="❌" color="red" />
          <StatCard title="Total Value" value={`KES ${stats.totalValue?.toLocaleString() || 0}`} icon="💰" color="purple" />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, SKU, barcode..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Stock Status</label>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Part Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
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
                    onView={() => handleView(item)}
                    onEdit={() => handleEdit(item)}
                    onAdjust={() => handleAdjust(item)}
                    onDelete={() => handleDelete(item)}
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
        <TabbedFormModal
          mode="add"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            loadInventory()
          }}
          existingCategories={categories}
          existingSuppliers={suppliers}
          existingLocations={locations}
          shops={shops}
          currencies={currencies}
          provider={provider}
        />
      )}

      {showEditModal && selectedItem && (
        <TabbedFormModal
          mode="edit"
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
          existingCategories={categories}
          existingSuppliers={suppliers}
          existingLocations={locations}
          shops={shops}
          currencies={currencies}
          provider={provider}
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

      {showDetailsModal && selectedItem && (
        <DetailsModal
          item={selectedItem}
          onClose={() => {
            setShowDetailsModal(false)
            setSelectedItem(null)
          }}
          onEdit={() => {
            setShowDetailsModal(false)
            setShowEditModal(true)
          }}
        />
      )}
    </div>
  )
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
function InventoryRow({ item, onView, onEdit, onAdjust, onDelete, readOnly }) {
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
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">Out of Stock</span>
        )}
        {stockStatus === 'low' && (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">Low Stock</span>
        )}
        {stockStatus === 'ok' && (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">In Stock</span>
        )}
      </td>
      <td className="px-6 py-4 text-right space-x-2">
        <button onClick={onView} className="text-gray-600 hover:text-gray-800 text-sm font-medium">
          View
        </button>
        {!readOnly && (
          <>
            <button onClick={onAdjust} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Adjust
            </button>
            <button onClick={onEdit} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
              Edit
            </button>
            <button onClick={onDelete} className="text-red-600 hover:text-red-800 text-sm font-medium">
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  )
}