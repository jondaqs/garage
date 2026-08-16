'use client'

/**
 * Standalone receipt view page.
 * Route: /dashboard/work-orders/[id]/receipt
 *        /company/work-orders/[id]/receipt
 *
 * Accepts a `back` prop to customise the back-button path.
 * Default export wraps with the correct back path.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ReceiptContent } from '@/components/ReceiptTab'
import {
  ArrowLeft, Loader2, AlertCircle, Download,
  Receipt, Clock, CreditCard
} from 'lucide-react'

const METHOD_ICONS = {
  cash: null, mpesa: CreditCard, card: CreditCard,
  bank_transfer: null, cheque: null,
}

function fmt(n, currency)  {
  const num = Number(n || 0).toLocaleString('en-KE')
  if (!currency) return num
  return `${currency.symbol || currency.code} ${num}`
}
function fmtD(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function fmtDs(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function ReceiptPageInner({ backPath }) {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const printRef = useRef(null)

  const [receipt,     setReceipt]     = useState(null)
  const [invoice,     setInvoice]     = useState(null)
  const [vehicle,     setVehicle]     = useState(null)
  const [provider,    setProvider]    = useState(null)
  const [customer,    setCustomer]    = useState(null)
  const [workOrder,   setWorkOrder]   = useState(null)
  // Work order's billing currency, surfaced by /api/work-orders/[id]/invoice.
  const [currency,    setCurrency]    = useState(null)
  const [branding,    setBranding]    = useState({ headerUrl: null, footerUrl: null })
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    try {
      // Load via API route to bypass RLS (same as invoice page)
      const resp = await fetch(`/api/work-orders/${params.id}/invoice`)
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Failed') }
      const data = await resp.json()
      if (!data.success) throw new Error(data.error || 'Failed')
      if (!data.invoice) { setLoading(false); return }

      setInvoice(data.invoice)
      setItems(data.line_items || [])
      setVehicle(data.vehicle || null)
      setProvider(data.provider || null)
      setCurrency(data.currency || null)
      setWorkOrder(data.work_order || null)

      // Customer — resolved server-side by the API route (bypasses RLS)
      if (data.customer) setCustomer(data.customer)

      // Fetch provider branding images (header/footer)
      const providerId = data.provider?.id
      if (providerId) {
        try {
          const { data: brandingFiles } = await supabase
            .from('uploaded_files')
            .select('reference_type, storage_path, storage_bucket')
            .eq('reference_id', providerId)
            .in('reference_type', ['provider_branding_header', 'provider_branding_footer'])
          if (brandingFiles && brandingFiles.length > 0) {
            const b = { headerUrl: null, footerUrl: null }
            for (const row of brandingFiles) {
              const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${row.storage_bucket}/${row.storage_path}`
              if (row.reference_type === 'provider_branding_header') b.headerUrl = url
              else b.footerUrl = url
            }
            setBranding(b)
          }
        } catch { /* non-fatal */ }
      }

      // Receipt (with confirmed fields — direct query since policy covers this user)
      const { data: rct } = await supabase
        .from('receipts')
        .select('id, receipt_number, payment_method, amount_paid, paid_at, notes, confirmed, confirmed_at, paid_by_user_id')
        .eq('invoice_id', data.invoice.id)
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setReceipt(rct || null)

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  const stripModernColors = (doc) => {
    const FALLBACKS = { color: '#000000', backgroundColor: 'transparent', borderColor: '#e5e7eb', outlineColor: 'transparent' }
    const UNSUPPORTED = /oklch|oklab|lab|color-mix|lch/i
    doc.querySelectorAll('*').forEach(el => {
      Object.keys(FALLBACKS).forEach(prop => {
        try {
          const cs  = window.getComputedStyle(el)
          const val = cs.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase())
          if (val && UNSUPPORTED.test(val)) el.style[prop] = FALLBACKS[prop]
        } catch (_) {}
      })
      const style = el.getAttribute('style')
      if (style && UNSUPPORTED.test(style)) {
        el.setAttribute('style', style.replace(/[a-z-]+\s*:\s*(?:oklch|oklab|lab|lch|color-mix)[^;]+;?/gi, ''))
      }
    })
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const el = printRef.current
      if (!el) return

      // ── Load branding as base64 data URLs ──────────────────────────
      let headerDataUrl = null
      let footerDataUrl = null
      const loadImg = async (url) => {
        if (!url) return null
        try {
          const resp = await fetch(url)
          if (!resp.ok) return null
          const blob = await resp.blob()
          return new Promise(resolve => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
        } catch { return null }
      }
      if (branding.headerUrl) headerDataUrl = await loadImg(branding.headerUrl)
      if (branding.footerUrl) footerDataUrl = await loadImg(branding.footerUrl)

      // ── Capture receipt HTML ───────────────────────────────────────
      const A4_PX = 794
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:' + A4_PX + 'px;background:#ffffff;overflow:visible;'
      const cloneEl = el.cloneNode(true)
      cloneEl.style.cssText = 'width:100%;background:#ffffff;'
      wrapper.appendChild(cloneEl)
      document.body.appendChild(wrapper)

      try {
        const canvas = await html2canvas(wrapper, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: A4_PX,
          height: wrapper.scrollHeight,
          windowWidth: A4_PX,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach(s => s.remove())
            stripModernColors(clonedDoc)
          },
        })

        const imgData = canvas.toDataURL('image/png')
        const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pageW  = pdf.internal.pageSize.getWidth()
        const pageH  = pdf.internal.pageSize.getHeight()
        const margin = 8
        const pdfW   = pageW - margin * 2

        // ── Header branding ──────────────────────────────────────────
        let headerH = 0
        if (headerDataUrl) {
          try {
            const hProps = pdf.getImageProperties(headerDataUrl)
            headerH = (pdfW / hProps.width) * hProps.height
            const fmt = (headerDataUrl.match(/^data:image\/(\w+)/) || [])[1]?.toUpperCase() || 'PNG'
            pdf.addImage(headerDataUrl, fmt, margin, margin, pdfW, headerH)
            headerH += 2
          } catch { headerH = 0 }
        }

        // ── Receipt content ──────────────────────────────────────────
        const contentTop = margin + headerH
        const pdfH = (canvas.height / canvas.width) * pdfW

        if (pdfH <= pageH - contentTop - margin) {
          pdf.addImage(imgData, 'PNG', margin, contentTop, pdfW, pdfH)
        } else {
          const pxPerMm = canvas.width / pdfW
          const firstSliceMm = pageH - contentTop - margin
          const slicePx = Math.floor((pageH - margin * 2) * pxPerMm)
          const firstSlicePx = Math.floor(firstSliceMm * pxPerMm)
          let srcY = 0
          let pageIdx = 0

          while (srcY < canvas.height) {
            if (pageIdx > 0) pdf.addPage()
            const maxH = pageIdx === 0 ? firstSlicePx : slicePx
            const h = Math.min(maxH, canvas.height - srcY)
            const slice = document.createElement('canvas')
            slice.width  = canvas.width
            slice.height = h
            slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, h, 0, 0, canvas.width, h)
            const yPos = pageIdx === 0 ? contentTop : margin
            pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, yPos, pdfW, h / pxPerMm)
            srcY += maxH
            pageIdx++
          }
        }

        // ── Footer branding (last page) ──────────────────────────────
        if (footerDataUrl) {
          try {
            const fProps = pdf.getImageProperties(footerDataUrl)
            const footerH = (pdfW / fProps.width) * fProps.height
            const fmt = (footerDataUrl.match(/^data:image\/(\w+)/) || [])[1]?.toUpperCase() || 'PNG'
            const footerY = pageH - margin - footerH

            if (pdfH <= pageH - contentTop - margin && contentTop + pdfH >= footerY) {
              pdf.addPage()
            }
            const lastPage = pdf.internal.getNumberOfPages()
            pdf.setPage(lastPage)
            pdf.addImage(footerDataUrl, fmt, margin, pageH - margin - footerH, pdfW, footerH)
          } catch { /* skip */ }
        }

        pdf.save('Receipt-' + (receipt?.receipt_number || params.id) + '.pdf')
      } finally {
        document.body.removeChild(wrapper)
      }
    } catch (e) {
      console.error('PDF error:')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-gray-400" size={32} />
    </div>
  )

  const backTo = backPath.replace('[id]', params.id)

  if (error) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.push(backTo)} className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Back
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    </div>
  )

  if (!invoice || !receipt) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.push(backTo)} className="flex items-center text-gray-500 hover:text-gray-800 mb-6 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Back
      </button>
      <div className="bg-white rounded-xl shadow-sm p-10 text-center">
        <Clock size={36} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm font-semibold text-gray-700">
          {!invoice ? 'No Invoice Yet' : 'No Receipt Yet'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {!invoice
            ? 'An invoice has not been issued for this work order.'
            : 'A receipt will appear here once payment has been recorded.'}
        </p>
        <button onClick={() => router.push(backTo)}
          className="mt-5 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
          Go Back
        </button>
      </div>
    </div>
  )

  const isConfirmed = receipt.confirmed
  const services    = items.filter(i => i.item_type === 'service')
  const parts       = items.filter(i => i.item_type === 'part')
  const tax         = Math.round((invoice.tax_rate != null ? invoice.tax_rate : 0) * 100)
  const custName    = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push(backTo)}
          className="flex items-center text-gray-500 hover:text-gray-800 text-sm">
          <ArrowLeft size={16} className="mr-1" /> Back
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {downloading ? 'Generating PDF…' : 'Download PDF'}
        </button>
      </div>

      {/* Printable area — branding header/footer are added during PDF
          generation only; they must NOT be inside printRef or html2canvas
          captures them and the download adds them again (double). */}
      <div ref={printRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <ReceiptContent
          receipt={receipt}
          invoice={invoice}
          items={items}
          vehicle={vehicle}
          provider={provider}
          customer={customer}
          workOrder={workOrder}
          custName={custName}
          services={services}
          parts={parts}
          tax={tax}
          fmt={(n) => fmt(n, currency)}
          fmtD={fmtD}
          fmtDs={fmtDs}
          isConfirmed={isConfirmed}
        />
      </div>
    </div>
  )
}

// ── User dashboard receipt page ───────────────────────────────────────────────
export default function UserReceiptPage() {
  return <ReceiptPageInner backPath="/dashboard/work-orders/[id]" />
}