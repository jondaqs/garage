export default function MobileVehicleCard({ vehicle, onDelete, onBook }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-600 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 flex items-center justify-center bg-blue-100 rounded-xl">
          🚗
        </div>

        <div className="flex-1">
          <h3 className="font-bold text-gray-800">
            {vehicle.make} {vehicle.model}
          </h3>

          <p className="text-sm text-gray-500">
            {vehicle.year} • {vehicle.plate_number}
          </p>
        </div>

        <button
          onClick={() => onDelete(vehicle.id)}
          className="text-red-500 text-sm"
        >
          ✕
        </button>
      </div>

      <button
        onClick={() => onBook()}
        className="mt-3 w-full bg-blue-50 text-blue-600 py-2 rounded-lg text-sm font-medium"
      >
        Book Service
      </button>
    </div>
  )
}
