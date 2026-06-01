import { Calendar, MapPin, Car, User, BadgeCheck, Store } from 'lucide-react'
import StatusBadge from './StatusBadge'

export default function BookingCard({ booking, isProvider, onClick }) {
  const provider = booking.service_provider || booking.provider
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition cursor-pointer"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            #{booking.booking_number}
          </h3>
          <StatusBadge status={booking.status} />
        </div>
        <div className="text-right text-sm text-gray-500">
          {new Date(booking.created_at).toLocaleDateString()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {isProvider && (
          <div className="flex items-center text-sm text-gray-600">
            <User size={16} className="mr-2" />
            <span>{booking.customer?.first_name} {booking.customer?.last_name}</span>
          </div>
        )}
        {!isProvider && provider?.name && (
          <div className="flex items-center text-sm text-gray-600 col-span-2">
            <Store size={16} className="mr-2 flex-shrink-0" />
            <span className="font-medium">{provider.name}</span>
            {provider.is_verified && (
              <BadgeCheck size={14} className="ml-1 text-blue-500 flex-shrink-0" />
            )}
            {provider.verification_score > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                provider.verification_score >= 80 ? 'bg-green-100 text-green-700' :
                provider.verification_score >= 50 ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {provider.verification_score}%
              </span>
            )}
          </div>
        )}
        <div className="flex items-center text-sm text-gray-600">
          <Car size={16} className="mr-2" />
          <span>{booking.vehicle?.plate_number}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Calendar size={16} className="mr-2" />
          <span>{new Date(booking.booking_date).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <MapPin size={16} className="mr-2" />
          <span>{booking.shop?.name}</span>
        </div>
      </div>

      {booking.booking_services?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {booking.booking_services.slice(0, 3).map((bs, idx) => (
            <span
              key={idx}
              className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
            >
              {bs.service?.name}
            </span>
          ))}
          {booking.booking_services.length > 3 && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
              +{booking.booking_services.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}