export default function MobileQuickActions({ router }) {
  return (
    <section className="mt-6">
      <h2 className="font-bold text-base mb-4">Quick Actions</h2>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push('/dashboard/bookings')}
          className="h-24 bg-white border-2 border-gray-200 hover:border-blue-600 rounded-xl flex flex-col items-center justify-center gap-2"
        >
          📅
          <span className="text-sm font-semibold">Book Service</span>
        </button>

        <button
          onClick={() => router.push('/dashboard/history')}
          className="h-24 bg-white border-2 border-gray-200 hover:border-blue-600 rounded-xl flex flex-col items-center justify-center gap-2"
        >
          🧾
          <span className="text-sm font-semibold">Service History</span>
        </button>
      </div>
    </section>
  )
}
