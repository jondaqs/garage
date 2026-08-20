'use client'

export default function AssessmentsError({ error, reset }) {
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white border border-red-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-red-700 mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-600 mb-4">
          {isDev ? error?.message : 'An unexpected error occurred. Please try again or contact support.'}
        </p>
        {isDev && error?.stack && (
          <pre className="bg-gray-900 text-gray-300 text-xs p-4 rounded-lg overflow-x-auto mb-4 max-h-48 overflow-y-auto">
            {error.stack}
          </pre>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  )
}