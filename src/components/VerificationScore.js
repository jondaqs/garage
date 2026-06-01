// src/components/VerificationScore.js
// Compact circular gauge showing provider verification score.
// Import and use anywhere a provider's trust level needs to be shown.
//
// Usage:
//   <VerificationScore score={85} />
//   <VerificationScore score={85} size={24} showLabel />

'use client'

export default function VerificationScore({ score, size = 20, showLabel = false }) {
  if (!score || score <= 0) return null

  const radius     = (size - 3) / 2
  const circumference = 2 * Math.PI * radius
  const filled     = (score / 100) * circumference
  const gap        = circumference - filled

  const color = score >= 80
    ? { stroke: '#16a34a', bg: '#f0fdf4', text: 'text-green-700' }   // green
    : score >= 50
      ? { stroke: '#ca8a04', bg: '#fefce8', text: 'text-yellow-700' } // yellow
      : { stroke: '#9ca3af', bg: '#f9fafb', text: 'text-gray-500' }   // gray

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
          stroke="#e5e7eb"
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
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color.stroke}
          fontSize={size * 0.32}
          fontWeight="700"
          style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
        >
          {score}
        </text>
      </svg>
      {showLabel && (
        <span className={`text-[10px] font-medium ${color.text} leading-tight`}>
          Verified
        </span>
      )}
    </span>
  )
}