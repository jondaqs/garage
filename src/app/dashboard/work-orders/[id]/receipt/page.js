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

function fmt(n)  { return `KES ${Number(n || 0).toLocaleString('en-KE')}` }
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

      // Receipt (with confirmed fields — direct query since policy covers this user)
      const { data: rct } = await supabase
        .from('receipts')
        .select('id, receipt_number, payment_method, amount_paid, paid_at, notes, confirmed, confirmed_at, paid_by_user_id')
        .eq('invoice_id', data.invoice.id)
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setReceipt(rct || null)

      // Customer
      if (data.invoice.issued_to_user_id) {
        const { data: cust } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, email, phone')
          .eq('id', data.invoice.issued_to_user_id)
          .maybeSingle()
        setCustomer(cust)
      }

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
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: el.scrollWidth,
        height: el.scrollHeight,
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach(s => s.remove())
          stripModernColors(clonedDoc)
        },
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW   = pdf.internal.pageSize.getWidth()
      const pageH   = pdf.internal.pageSize.getHeight()
      const ratio   = canvas.width / canvas.height
      const pdfW    = pageW - 20
      const pdfH    = pdfW / ratio
      const yOff    = pdfH < pageH ? (pageH - pdfH) / 2 : 10
      pdf.addImage(imgData, 'PNG', 10, yOff, pdfW, Math.min(pdfH, pageH - 20))
      pdf.save(`Receipt-${receipt?.receipt_number || params.id}.pdf`)
    } catch (e) {
      console.error('PDF error:', e)
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
  const tax         = Math.round((invoice.tax_rate || 0.16) * 100)
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

      {/* Printable area */}
      <div ref={printRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <ReceiptContent
          receipt={receipt}
          invoice={invoice}
          items={items}
          vehicle={vehicle}
          provider={provider}
          customer={customer}
          custName={custName}
          services={services}
          parts={parts}
          tax={tax}
          fmt={fmt}
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