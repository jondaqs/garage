'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { generateWorkOrderReport } from '@/lib/reports/workOrderReport'

/**
 * Drop-in button that downloads a Work Order PDF report.
 *
 * Props:
 *   wo – the work order object (same shape every WO detail page uses)
 *   className – optional extra classes on the outer button
 */
export default function DownloadWorkOrderReport({ wo, className = '' }) {
  const [downloading, setDownloading] = useState(false)

  const handleClick = async () => {
    if (!wo) return
    setDownloading(true)
    try {
      await generateWorkOrderReport(wo)
    } catch (err) {
      console.error('WO report PDF error:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={downloading || !wo}
      title="Download a full PDF report for this work order"
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        border border-gray-200 bg-white text-gray-700
        hover:bg-gray-50 hover:border-gray-300
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors ${className}`}
    >
      {downloading
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : <Download className="w-4 h-4" />}
      {downloading ? 'Generating…' : 'Download Report'}
    </button>
  )
}
