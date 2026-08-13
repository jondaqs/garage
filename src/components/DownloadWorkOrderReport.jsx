'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { generateWorkOrderReport } from '@/lib/reports/workOrderReport'
import { createClient } from '@/lib/supabase/client'

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
      // Fetch provider branding images (header/footer) if available
      let branding = {}
      const providerId = wo.service_provider?.id || wo.service_provider_id
      if (providerId) {
        try {
          const supabase = createClient()
          const { data } = await supabase
            .from('uploaded_files')
            .select('reference_type, storage_path, storage_bucket')
            .eq('reference_id', providerId)
            .in('reference_type', ['provider_branding_header', 'provider_branding_footer'])
          if (data && data.length > 0) {
            for (const row of data) {
              const { data: { publicUrl } } = supabase.storage
                .from(row.storage_bucket)
                .getPublicUrl(row.storage_path)
              if (row.reference_type === 'provider_branding_header') branding.headerUrl = publicUrl
              else branding.footerUrl = publicUrl
            }
          }
        } catch { /* non-fatal, continue without branding */ }
      }
      await generateWorkOrderReport(wo, branding)
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