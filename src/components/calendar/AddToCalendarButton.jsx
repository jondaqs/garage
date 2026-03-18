'use client'

import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { getCalendarOptions } from '@/lib/calendar/addToCalendar'

export default function AddToCalendarButton({ booking, variant = 'default' }) {
  const [isOpen, setIsOpen] = useState(false)
  const calendarOptions = getCalendarOptions(booking)

  if (variant === 'dropdown') {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
        >
          <Calendar size={18} />
          Add to Calendar
          <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown Menu */}
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
              <div className="py-2">
                {calendarOptions.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      option.action()
                      setIsOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition"
                  >
                    <span className="text-2xl">{option.icon}</span>
                    <span className="text-sm font-medium text-gray-900">{option.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // Grid variant - show all buttons
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
        <Calendar size={20} />
        Add to Calendar
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {calendarOptions.map((option, index) => (
          <button
            key={index}
            onClick={option.action}
            className={`px-4 py-3 text-white rounded-lg transition flex items-center justify-center gap-2 ${option.color}`}
          >
            <span className="text-xl">{option.icon}</span>
            <span className="text-sm font-medium">{option.name}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Click a button to add this booking to your calendar app
      </p>
    </div>
  )
}