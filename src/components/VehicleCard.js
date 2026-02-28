import { Car } from 'lucide-react'

export default function VehicleCard({ vehicle }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-bold text-lg text-gray-800">{vehicle.plateNumber}</h4>
          <p className="text-gray-600">{vehicle.make} {vehicle.model}</p>
        </div>
        <div className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-sm font-medium">
          {vehicle.year}
        </div>
      </div>
      <div className="flex items-center text-sm text-gray-600 mb-4">
        <span className="mr-4">Color: {vehicle.color}</span>
        {vehicle.vin && <span>VIN: {vehicle.vin}</span>}
      </div>
      <button className="w-full bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition font-medium flex items-center justify-center">
        <Car size={18} className="mr-2" />
        Book Service
      </button>
    </div>
  )
}