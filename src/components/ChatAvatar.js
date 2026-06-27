'use client'

import { useState } from 'react'

/**
 * ChatAvatar — shared avatar component for all chat surfaces.
 *
 * Shows the user/provider's profile photo when available,
 * otherwise falls back to a gradient circle with the first
 * letter of their name.
 *
 * Props:
 *   src         — profile picture URL (or null/undefined)
 *   name        — display name (used for fallback initial)
 *   size        — 'sm' (36px, chat header) | 'md' (40px, conv list) — default 'md'
 *   gradient    — tailwind gradient classes for the fallback circle
 *                 default: 'from-blue-500 to-blue-700'
 */
export default function ChatAvatar({
  src,
  name = '?',
  size = 'md',
  gradient = 'from-blue-500 to-blue-700',
}) {
  const [imgError, setImgError] = useState(false)
  const px = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10'
  const textSize = 'text-sm'
  const initial = name?.[0]?.toUpperCase() || '?'

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => {
          console.warn('[ChatAvatar] Image failed to load:', src)
          setImgError(true)
        }}
        className={`${px} rounded-full object-cover flex-shrink-0`}
      />
    )
  }

  return (
    <div
      className={`${px} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold ${textSize} flex-shrink-0`}
    >
      {initial}
    </div>
  )
}