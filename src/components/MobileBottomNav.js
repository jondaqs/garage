import { useRouter } from 'next/navigation'

export default function MobileBottomNav() {
  const router = useRouter()

  return (
    <nav className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-around sticky bottom-0 z-10">
      <button onClick={() => router.push('/dashboard')} className="flex flex-col items-center gap-1">
        <span className="text-orange-500">🏠</span>
        <span className="text-xs font-semibold text-orange-500">Home</span>
      </button>

      <button onClick={() => router.push('/dashboard/bookings')} className="flex flex-col items-center gap-1">
        🔧
        <span className="text-xs text-gray-500">Services</span>
      </button>

      <button onClick={() => router.push('/dashboard/history')} className="flex flex-col items-center gap-1">
        📄
        <span className="text-xs text-gray-500">History</span>
      </button>

      <button onClick={() => router.push('/dashboard/profile')} className="flex flex-col items-center gap-1">
        👤
        <span className="text-xs text-gray-500">Profile</span>
      </button>
    </nav>
  )
}
