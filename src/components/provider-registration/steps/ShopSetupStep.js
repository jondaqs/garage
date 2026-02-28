'use client'

import React, { useState } from 'react'
import { MapPin, Plus, Trash2, Clock } from 'lucide-react'

export default function ShopSetupStep({ data, updateData, nextStep, previousStep }) {
  const [shops, setShops] = useState(data.shops || [])
  const [showAddForm, setShowAddForm] = useState(shops.length === 0)
  const [currentShop, setCurrentShop] = useState({
    name: '',
    description: '',
    phone: '',
    email: '',
    county: '',
    town: '',
    street: '',
    latitude: '',
    longitude: '',
    openingTime: '08:00',
    closingTime: '18:00'
  })

  const handleAddShop = () => {
    if (currentShop.name && currentShop.county && currentShop.town) {
      setShops(prev => [...prev, { ...currentShop, id: Date.now() }])
      setCurrentShop({
        name: '',
        description: '',
        phone: '',
        email: '',
        county: '',
        town: '',
        street: '',
        latitude: '',
        longitude: '',
        openingTime: '08:00',
        closingTime: '18:00'
      })
      setShowAddForm(false)
    }
  }

  const handleRemoveShop = (shopId) => {
    setShops(prev => prev.filter(s => s.id !== shopId))
  }

  const handleContinue = () => {
    updateData({ shops })
    nextStep()
  }

  const handleSkip = () => {
    updateData({ shops: [] })
    nextStep()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Shop Locations
        </h2>
        <p className="text-gray-600">
          Add your physical shop locations (optional for mobile services)
        </p>
      </div>

      {shops.length > 0 && (
        <div className="space-y-4 mb-6">
          {shops.map(shop => (
            <div key={shop.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-800">{shop.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {shop.street}, {shop.town}, {shop.county}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    <Clock size={14} className="inline mr-1" />
                    {shop.openingTime} - {shop.closingTime}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveShop(shop.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">Add Shop Location</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shop Name *</label>
              <input
                type="text"
                value={currentShop.name}
                onChange={(e) => setCurrentShop({...currentShop, name: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="Main Workshop"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">County *</label>
                <input
                  type="text"
                  value={currentShop.county}
                  onChange={(e) => setCurrentShop({...currentShop, county: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Nairobi"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Town *</label>
                <input
                  type="text"
                  value={currentShop.town}
                  onChange={(e) => setCurrentShop({...currentShop, town: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Westlands"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
              <input
                type="text"
                value={currentShop.street}
                onChange={(e) => setCurrentShop({...currentShop, street: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="Waiyaki Way"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Opening Time</label>
                <input
                  type="time"
                  value={currentShop.openingTime}
                  onChange={(e) => setCurrentShop({...currentShop, openingTime: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Closing Time</label>
                <input
                  type="time"
                  value={currentShop.closingTime}
                  onChange={(e) => setCurrentShop({...currentShop, closingTime: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddShop}
                disabled={!currentShop.name || !currentShop.county || !currentShop.town}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Add Shop
              </button>
              {shops.length > 0 && (
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition"
        >
          <Plus className="mx-auto text-gray-400 mb-2" size={32} />
          <p className="text-gray-600">Add Another Shop Location</p>
        </button>
      )}

      <div className="flex justify-between mt-8">
        <button
          onClick={previousStep}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
        >
          Back
        </button>
        <div className="flex gap-3">
          {shops.length === 0 && (
            <button
              onClick={handleSkip}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
            >
              Skip (Mobile Service)
            </button>
          )}
          <button
            onClick={handleContinue}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
