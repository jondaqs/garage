'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Reusable pagination bar for admin list pages.
 *
 * Props:
 *   page        – current 1-based page number
 *   pageSize    – rows per page
 *   totalCount  – total row count from the query
 *   onPageChange(newPage) – callback when user clicks prev/next/page
 */
export default function Pagination({ page, pageSize, totalCount, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from       = (page - 1) * pageSize + 1
  const to         = Math.min(page * pageSize, totalCount)

  if (totalCount <= pageSize) return null // no pagination needed

  // Build page numbers with ellipsis
  const pages = []
  const addPage = (n) => { if (!pages.includes(n)) pages.push(n) }

  addPage(1)
  if (totalPages > 1) addPage(totalPages)
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) addPage(i)
  pages.sort((a, b) => a - b)

  const withGaps = []
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) withGaps.push('...')
    withGaps.push(pages[i])
  }

  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 text-sm">
      <span className="text-gray-500">
        Showing <span className="font-medium text-gray-700">{from}–{to}</span> of{' '}
        <span className="font-medium text-gray-700">{totalCount}</span>
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>

        {withGaps.map((p, i) =>
          p === '...' ? (
            <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[28px] h-7 rounded-md text-xs font-medium ${
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}