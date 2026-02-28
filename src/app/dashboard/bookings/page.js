'use client'

import { Calendar } from 'lucide-react'

export default function BookingsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-800 mb-8">My Bookings</h2>

      <div className="text-center py-12">
        <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
        <p className="text-gray-600 mb-4">No bookings yet</p>
        <button className="text-blue-600 hover:text-blue-700 font-medium">
          Book your first service →
        </button>
      </div>
    </div>
  )
}