'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Truck, Plus, Calendar } from 'lucide-react'

export default function FleetPage() {
  const [fleet, setFleet] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchFleet()
  }, [])

  const fetchFleet = async () => {
    try {
      const response = await fetch('/api/company/fleet')
      const data = await response.json()

      if (data.success) {
        setFleet(data.fleet)
      } else {
        setError(data.error || 'Failed to load fleet')
      }
    } catch (err) {
      console.error('Error fetching fleet:', err)
      setError('Failed to load fleet')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
        {error}
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Fleet</h1>
          <p className="text-sm text-gray-500 mt-1">{fleet.length} vehicle{fleet.length !== 1 ? 's' : ''} registered</p>
        </div>
        <Link
          href="/company/fleet/add"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Vehicle
        </Link>
      </div>

      {fleet.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles in your fleet</h3>
          <p className="text-gray-500 mb-6">Get started by adding your first vehicle</p>
          <Link
            href="/company/fleet/add"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Your First Vehicle
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fleet.map((item) => (
            <Link
              key={item.vehicle_id}
              href={`/company/fleet/${item.vehicle_id}`}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Truck className="w-6 h-6 text-blue-600" />
                </div>
                <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                  Active
                </span>
              </div>

              {/* BUG 1.5 FIX: plate_number not license_plate */}
              <h3 className="font-bold text-lg mb-1 text-gray-900">
                {item.vehicle?.plate_number || '—'}
              </h3>

              {/* BUG 1.5 FIX: year_of_manufacture not year */}
              <p className="text-gray-600 text-sm">
                {[item.vehicle?.year_of_manufacture, item.vehicle?.make, item.vehicle?.model]
                  .filter(Boolean)
                  .join(' ')}
              </p>

              {item.vehicle?.color && (
                <p className="text-xs text-gray-400 mt-1 capitalize">
                  {item.vehicle.color}
                </p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-400">
                <Calendar className="w-3 h-3" />
                Added {item.vehicle?.created_at
                  ? new Date(item.vehicle.created_at).toLocaleDateString()
                  : '—'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}