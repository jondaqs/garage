// src/components/VerificationScore.js
// Compact circular gauge showing provider verification score.
// Import and use anywhere a provider's trust level needs to be shown.
//
// Usage:
//   <VerificationScore score={85} />
//   <VerificationScore score={85} size={24} showLabel />

'use client'

export default function VerificationScore({ score, size = 14, showLabel = false }) {
  if (!score || score <= 0) return null

  const radius     = (size - 3) / 2
  const circumference = 2 * Math.PI * radius
  const filled     = (score / 100) * circumference
  const gap        = circumference - filled

  const color = score >= 80
    ? { stroke: '#059669', bg: '#d1fae5', text: 'text-emerald-700' }    // emerald green
    : score >= 50
      ? { stroke: '#2563eb', bg: '#dbeafe', text: 'text-blue-700' }     // blue
      : { stroke: '#6366f1', bg: '#e0e7ff', text: 'text-indigo-600' }   // indigo

  return (
    <span
      className="inline-flex items-center gap-1 flex-shrink-0"
      title={`Verification Score: ${score}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="flex-shrink-0"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={2.5}
        />
        {/* Filled ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={2.5}
          strokeDasharray={`${filled} ${gap}`}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      {showLabel && (
        <span className={`text-[10px] font-medium ${color.text} leading-tight`}>
          Verified
        </span>
      )}
    </span>
  )
}