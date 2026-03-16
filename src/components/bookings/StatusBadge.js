export default function StatusBadge({ status }) {
  if (!status) return null

  const getColor = (code) => {
    switch (code) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'confirmed':
        return 'bg-blue-100 text-blue-800'
      case 'in_progress':
        return 'bg-purple-100 text-purple-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getColor(status.code)}`}>
      {status.display_name}
    </span>
  )
}
