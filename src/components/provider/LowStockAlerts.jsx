// src/components/provider/LowStockAlerts.jsx
// Dashboard widget showing low stock items

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function LowStockAlerts() {
  const [lowStockItems, setLowStockItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLowStockItems()
  }, [])

  async function loadLowStockItems() {
    try {
      const response = await fetch('/api/inventory')
      const data = await response.json()

      if (response.ok) {
        // Filter for low stock and out of stock items
        const lowStock = (data.inventory || []).filter(
          item => item.is_active && item.stock <= item.min_stock_level
        )
        setLowStockItems(lowStock)
      }
    } catch (error) {
      console.error('Load low stock error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (lowStockItems.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          📦 Inventory Status
        </h3>
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-gray-600">All items well stocked</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            ⚠️ Low Stock Alerts
          </h3>
          <Link
            href="/provider/inventory"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            View All →
          </Link>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} need attention
        </p>
      </div>

      <div className="divide-y divide-gray-200">
        {lowStockItems.slice(0, 5).map(item => (
          <LowStockItem key={item.id} item={item} />
        ))}
      </div>

      {lowStockItems.length > 5 && (
        <div className="p-4 bg-gray-50 text-center">
          <Link
            href="/provider/inventory?filter=low_stock"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            View {lowStockItems.length - 5} more items →
          </Link>
        </div>
      )}
    </div>
  )
}

function LowStockItem({ item }) {
  const isOutOfStock = item.stock === 0
  const stockPercentage = item.min_stock_level > 0 
    ? (item.stock / item.min_stock_level) * 100 
    : 0

  return (
    <div className="p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{item.name}</p>
          <p className="text-sm text-gray-500 mt-1">
            {item.part_number && `PN: ${item.part_number}`}
            {item.sku && ` • SKU: ${item.sku}`}
            {item.category && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded">
                {item.category}
              </span>
            )}
          </p>
        </div>
        <div className="ml-4 flex-shrink-0">
          {isOutOfStock ? (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
              Out of Stock
            </span>
          ) : (
            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
              Low Stock
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-600">Stock Level</span>
          <span className={`font-medium ${isOutOfStock ? 'text-red-600' : 'text-yellow-600'}`}>
            {item.stock} / {item.min_stock_level}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              isOutOfStock ? 'bg-red-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${Math.min(stockPercentage, 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  )
}