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
      const supabase = createClient()

      // ── Enrich wo with services, parts, issues if missing ───────────
      // The customer-side RPC returns these nested in the wo object, but
      // the provider-side direct query doesn't. Fetch them separately so
      // the report is complete regardless of which page triggers it.
      const enriched = { ...wo }

      if (!enriched.services || enriched.services.length === 0) {
        try {
          const { data } = await supabase
            .from('work_order_services')
            .select(`
              id, estimated_cost, actual_cost,
              service:services(name),
              status:work_order_services_statuses(code)
            `)
            .eq('work_order_id', wo.id)
          if (data) {
            enriched.services = data
              .filter(s => s.status?.code !== 'cancelled')
              .map(s => ({
                ...s,
                service_name: s.service?.name || 'Service',
              }))
          }
        } catch { /* non-fatal */ }
      }

      if (!enriched.parts || enriched.parts.length === 0) {
        try {
          const { data } = await supabase
            .from('work_order_parts')
            .select(`
              id, quantity, unit_price,
              status:work_order_parts_statuses(code),
              part:spare_parts(name)
            `)
            .eq('work_order_id', wo.id)
          if (data) {
            enriched.parts = data
              .filter(p => ['reserved', 'in_use', 'used'].includes(p.status?.code))
              .map(p => ({
                ...p,
                part_name: p.part?.name || 'Part',
              }))
          }
        } catch { /* non-fatal */ }
      }

      if (!enriched.issues || enriched.issues.length === 0) {
        try {
          const { data } = await supabase
            .from('vehicle_issues')
            .select('id, title, description, severity')
            .eq('work_order_id', wo.id)
          if (data) enriched.issues = data
        } catch { /* non-fatal */ }
      }

      // ── Fetch provider branding images (header/footer) ──────────────
      let branding = {}
      const providerId = wo.service_provider?.id || wo.service_provider_id
      if (providerId) {
        try {
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

      await generateWorkOrderReport(enriched, branding)
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