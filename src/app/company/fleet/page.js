'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Truck, Plus } from 'lucide-react'

export default function FleetPage() {
  const [fleet, setFleet] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchFleet()
  }, [])

  const fetchFleet = async () => {
    try {
      const response = await fetch('/api/company/fleet')
      const data = await response.json()
      
      if (data.success) {
        setFleet(data.fleet)
      }
    } catch (error) {
      console.error('Error fetching fleet:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12">Loading fleet...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Company Fleet</h1>
        <Link
          href="/company/fleet/add"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Add Vehicle
        </Link>
      </div>

      {fleet.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Truck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No vehicles in your fleet
          </h3>
          <p className="text-gray-500 mb-6">
            Get started by adding your first vehicle
          </p>
          <Link
            href="/company/fleet/add"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Add Your First Vehicle
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fleet.map((item) => (
            <Link
              key={item.id}
              href={`/company/fleet/${item.id}`}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <Truck className="w-8 h-8 text-blue-600" />
                <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                  Active
                </span>
              </div>
              <h3 className="font-bold text-lg mb-2">
                {item.vehicle.license_plate}
              </h3>
              <p className="text-gray-600">
                {item.vehicle.year} {item.vehicle.make} {item.vehicle.model}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Color: {item.vehicle.color}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}