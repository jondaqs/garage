import { useRouter } from 'next/navigation'

export default function MobileVehicleCard({ vehicle }) {
  const router = useRouter()

  return (
    <div
      onClick={() => router.push(`/dashboard/vehicles/${vehicle.id}`)}
      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-400 transition-colors cursor-pointer"
    >
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

        <span className="text-xs text-blue-400 font-medium mt-1">›</span>
      </div>

      <p className="mt-2 text-xs text-gray-400">Tap to view, edit or delete</p>
    </div>
  )
}s