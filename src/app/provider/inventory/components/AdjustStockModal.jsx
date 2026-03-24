// src/app/provider/inventory/components/AdjustStockModal.jsx
// Stock Adjustment Modal

'use client'

import { useState } from 'react'

export default function AdjustStockModal({ item, onClose, onSuccess }) {
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