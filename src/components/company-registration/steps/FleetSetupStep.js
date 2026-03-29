'use client'
import { useState } from 'react'

export default function FleetSetupStep({ data, updateData, nextStep, previousStep }) {
  const [vehicles, setVehicles] = useState(data?.fleet || [])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    licensePlate: '',
    make: '',
    model: '',
    year: '',
    vin: '',
    color: ''
  })

  const addVehicle = () => {
    if (!formData.licensePlate || !formData.make || !formData.model) {
      alert('Please fill in license plate, make, and model')
      return
    }

    setVehicles([...vehicles, { ...formData }])
    setFormData({
      licensePlate: '',
      make: '',
      model: '',
      year: '',
      vin: '',
      color: ''
    })
    setShowForm(false)
  }

  const removeVehicle = (index) => {
    setVehicles(vehicles.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    updateData({ fleet: vehicles })
    nextStep()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Add Fleet Vehicles</h2>
      <p className="text-gray-600 mb-6">
        Add vehicles to your company fleet (Optional - you can do this later)
      </p>

      {vehicles.length > 0 && (
        <div className="mb-6 space-y-3">
          {vehicles.map((vehicle, index) => (
            <div key={index} className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
              <div>
                <p className="font-medium text-lg">{vehicle.licensePlate}</p>
                <p className="text-sm text-gray-600">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </p>
                {vehicle.color && (
                  <p className="text-xs text-gray-500">Color: {vehicle.color}</p>
                )}
              </div>
              <button
                onClick={() => removeVehicle(index)}
                className="text-red-600 hover:text-red-700 px-3 py-1 rounded hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition"
        >
          + Add Vehicle to Fleet
        </button>
      ) : (
        <div className="border rounded-lg p-6 space-y-4 bg-gray-50">
          <h3 className="font-semibold text-lg mb-4">Vehicle Details</h3>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              License Plate Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., KAA 123B"
              value={formData.licensePlate}
              onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Make <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Toyota"
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Model <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Hilux"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Year</label>
              <input
                type="number"
                placeholder="e.g., 2022"
                min="1900"
                max={new Date().getFullYear() + 1}
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Color</label>
              <input
                type="text"
                placeholder="e.g., White"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">VIN (Optional)</label>
            <input
              type="text"
              placeholder="Vehicle Identification Number"
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">17-character vehicle identification number</p>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              onClick={addVehicle}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Vehicle
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setFormData({
                  licensePlate: '',
                  make: '',
                  model: '',
                  year: '',
                  vin: '',
                  color: ''
                })
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {vehicles.length > 0 && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>{vehicles.length}</strong> vehicle{vehicles.length !== 1 ? 's' : ''} added to your fleet.
            You can add more vehicles later from your dashboard.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-6 mt-6 border-t">
        <button
          onClick={previousStep}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {vehicles.length > 0 ? 'Continue' : 'Skip for Now'}
        </button>
      </div>
    </div>
  )
}