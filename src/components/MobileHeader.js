export default function MobileHeader({ userName }) {
  return (
    <header className="px-6 py-4 flex items-center justify-between bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="flex-1">
        <p className="text-xs text-gray-500 font-medium">Welcome back</p>
        <h1 className="font-bold text-lg text-gray-800">{userName}</h1>
      </div>

      <button className="relative w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
        🔔
      </button>
    </header>
  )
}
