'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import ReceiptCard from '@/components/ReceiptCard'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, CheckCircle, AlertCircle, Loader2,
  DollarSign, Send, Lock, BadgeCheck, CreditCard,
  Banknote, Building2, ChevronDown, ChevronUp,
  Wrench, Package, Clock, Bell, CheckCircle2, Download
} from 'lucide-react'

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',     icon: Banknote   },
  { value: 'mpesa',         label: 'M-Pesa',   icon: CreditCard },
  { value: 'card',          label: 'Card',     icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank',     icon: Building2  },
  { value: 'cheque',        label: 'Cheque',   icon: FileText   },
]

export default function InvoiceTab({ workOrder, permissions = null }) {
  const canConfirm = permissions?.canConfirm ?? false
  const supabase = createClient()

  const [invoice,      setInvoice]      = useState(null)   // { invoice, line_items, receipt }
  const [loading,      setLoading]      = useState(true)
  const [generating,   setGenerating]   = useState(false)
  const [sending,      setSending]      = useState(false)
  const [paying,       setPaying]       = useState(false)
  const [downloading,  setDownloading]  = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')

  // Ref to the invoice document container — used by the Download PDF button to
  // capture the rendered DOM via html2canvas.
  const printRef = useRef(null)
  const [showItems,    setShowItems]    = useState(true)
  const [vatPct,       setVatPct]       = useState('16')
  const [discountPct,  setDiscountPct]  = useState('0')
  const [showPayForm,  setShowPayForm]  = useState(false)
  const [payMethod,    setPayMethod]    = useState('cash')
  const [amountPaid,   setAmountPaid]   = useState('')
  const [payNotes,     setPayNotes]     = useState('')

  // Work order's billing currency — fetched once on mount. The work_order_id
  // prop carries currency_id; we resolve it to a row here so we can label
  // amounts throughout the invoice and the payment form. Falls back to a
  // bare number with no prefix if no currency is set on the work order.
  const [woCurrency, setWoCurrency] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadWoCurrency () {
      if (!workOrder.currency_id) { setWoCurrency(null); return }
      const { data } = await supabase
        .from('currencies')
        .select('id, code, symbol, display_name')
        .eq('id', workOrder.currency_id)
        .single()
      if (!cancelled) setWoCurrency(data || null)
    }
    loadWoCurrency()
    return () => { cancelled = true }
  }, [workOrder.currency_id])

  // Currency-aware formatter. Falls back to bare number if no currency set,
  // so the file degrades cleanly even before a billing currency is chosen.
  const fmt   = (n, opts = {}) => {
    const num = Number(n || 0).toLocaleString('en-KE', {
      minimumFractionDigits: opts.minimumFractionDigits ?? 0,
      maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    })
    if (!woCurrency) return num
    return `${woCurrency.symbol || woCurrency.code} ${num}`
  }
  // Short string for input labels, e.g. "(KES)" or "(USD)".
  const currencyLabel = woCurrency ? (woCurrency.code || woCurrency.symbol || 'currency') : 'currency'
  const fmtD  = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const statusCode = workOrder.status?.code
  const woComplete = ['completed', 'closed', 'quality_check'].includes(statusCode)

  const canGenerate      = permissions ? (permissions.canGenerate      && woComplete) : woComplete
  const canSendInvoice   = permissions ? permissions.canSendInvoice    : true
  const canRecordPayment = permissions ? permissions.canRecordPayment  : true

  // ── Load invoice + items + receipt via direct queries ────────────────────
  const loadInvoice = useCallback(async () => {
    try {
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, work_order_id, service_provider_id, issued_to_user_id, status, subtotal, discount, discount_pct, tax_rate, tax_amount, total_amount, notes, due_date, issued_at, paid_at')
        .eq('work_order_id', workOrder.id)
        .maybeSingle()

      if (invErr) { console.error('invoices query error:', invErr.message); setLoading(false); return }

      if (inv) {
        const [{ data: items }, { data: receipt }] = await Promise.all([
          supabase
            .from('invoice_items')
            .select('id, item_type, item_name, description, quantity, unit_price, total_price')
            .eq('invoice_id', inv.id)
            .order('item_type'),
          supabase
            .from('receipts')
            .select('id, receipt_number, payment_method, amount_paid, paid_at, notes, confirmed, confirmed_at')
            .eq('invoice_id', inv.id)
            .maybeSingle(),
        ])
        setInvoice({ invoice: inv, line_items: items || [], receipt: receipt || null })
      } else {
        setInvoice(null)
      }
    } catch (e) { console.error('loadInvoice threw:', e.message) }
    finally { setLoading(false) }
  }, [workOrder.id])

  useEffect(() => { loadInvoice() }, [loadInvoice])

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true); setError(''); setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const taxRate     = Math.max(0, Math.min(100, parseFloat(vatPct)     || 0)) / 100
      const discountRate = Math.max(0, Math.min(100, parseFloat(discountPct) || 0)) / 100
      const { data: result, error: rpcErr } = await supabase.rpc('generate_invoice_for_provider', {
        p_work_order_id:   workOrder.id,
        p_caller_auth_uid: user.id,
        p_tax_rate:        taxRate,
        p_discount_pct:    discountRate,
        p_notes:           null,
      })
      if (rpcErr) throw rpcErr
      if (!result.success && result.invoice_id) {
        // Already exists — just load it
        await loadInvoice()
        return
      }
      if (!result.success) throw new Error(result.error)
      setSuccess(`Invoice ${result.invoice_number} generated.`)
      await loadInvoice()
    } catch (err) { setError(err.message) }
    finally { setGenerating(false) }
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!confirm('Send this invoice to the customer?')) return
    setSending(true); setError(''); setSuccess('')
    try {
      const resp = await fetch(`/api/work-orders/${workOrder.id}/send-invoice`, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to send invoice')
      const msgs = [data.email_sent && 'Email', data.sms_sent && 'SMS'].filter(Boolean)
      setSuccess(`Invoice sent.${msgs.length ? ` Delivered via ${msgs.join(' & ')}.` : ''}`)
      await loadInvoice()
    } catch (err) { setError(err.message) }
    finally { setSending(false) }
  }

  // ── Record payment ────────────────────────────────────────────────────────
  const handlePayment = async () => {
    if (!amountPaid || parseFloat(amountPaid) <= 0) { setError('Enter a valid amount'); return }
    setPaying(true); setError(''); setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: result, error: rpcErr } = await supabase.rpc('process_payment', {
        p_invoice_id: invoice.invoice.id, p_payment_method: payMethod,
        p_amount_paid: parseFloat(amountPaid), p_payer_user_id: user.id, p_notes: payNotes || null,
      })
      if (rpcErr) throw rpcErr
      if (!result.success) throw new Error(result.error)
      const change = result.change_given > 0 ? ` · Change: ${fmt(result.change_given)}` : ''
      setSuccess(`Payment recorded! Receipt ${result.receipt_number}${change}`)
      setShowPayForm(false)
      await loadInvoice()
    } catch (err) { setError(err.message) }
    finally { setPaying(false) }
  }

  // ── Download PDF ─────────────────────────────────────────────────────────
  // html2canvas (and the layout libraries underneath it) can't parse the
  // newer CSS colour functions: oklch, oklab, lab, lch, color-mix, color().
  // Tailwind v4 / modern browsers emit these in gradients and computed
  // borders, even when the source uses regular palette colours. We can't
  // know up front which CSS properties carry them, so we scan EVERY
  // computed style property on every element and override any that
  // contains an unsupported colour function.
  //
  // The override values are chosen to be visually safe defaults:
  //   * any `color`-suffixed property → black or transparent
  //   * any `background`-related      → transparent (kills colourful gradients)
  //   * any `*-image`                  → none (drops gradient images)
  //   * any `fill` / `stroke` (SVG)   → currentColor / transparent
  //   * everything else                → empty string (revert to UA default)
  const stripModernColors = (root) => {
    const UNSUPPORTED = /\b(?:oklch|oklab|lab|lch|color-mix|color\()/i

    const fallbackFor = (prop) => {
      if (prop === 'color' || /-color$/i.test(prop))           return '#000000'
      if (/^background(-color)?$/i.test(prop))                 return '#ffffff'
      if (/^background/.test(prop) || /-image$/i.test(prop))   return 'none'
      if (prop === 'fill')                                     return 'currentColor'
      if (prop === 'stroke')                                   return 'currentColor'
      if (prop === 'caret-color')                              return 'auto'
      return ''
    }

    // Accept either a Document or an Element. querySelectorAll works on both.
    root.querySelectorAll('*').forEach(el => {
      const cs = window.getComputedStyle(el)
      for (let i = 0; i < cs.length; i++) {
        const prop = cs[i]
        let val
        try { val = cs.getPropertyValue(prop) } catch (_) { continue }
        if (val && UNSUPPORTED.test(val)) {
          try { el.style.setProperty(prop, fallbackFor(prop), 'important') } catch (_) {}
        }
      }
      if (el.getAttribute('style') && UNSUPPORTED.test(el.getAttribute('style'))) {
        const cleaned = el.getAttribute('style').replace(/[a-z-]+\s*:\s*[^;]*(?:oklch|oklab|lab|lch|color-mix|color\()[^;]*;?/gi, '')
        el.setAttribute('style', cleaned)
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

      const A4_PX = 794   // A4 width @ 96dpi
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:' + A4_PX + 'px;background:#ffffff;overflow:visible;'
      const cloneEl = el.cloneNode(true)
      cloneEl.style.cssText = 'width:100%;background:#ffffff;'
      wrapper.appendChild(cloneEl)
      document.body.appendChild(wrapper)

      // Pre-strip on the off-screen wrapper. We can't always rely on `onclone`
      // to run before html2canvas starts parsing colours, so we sweep the
      // wrapper itself first. Scope is limited to the wrapper so the live
      // page isn't mutated.
      stripModernColors(wrapper)

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
        const pdfH   = (canvas.height / canvas.width) * pdfW

        if (pdfH <= pageH - margin * 2) {
          pdf.addImage(imgData, 'PNG', margin, (pageH - pdfH) / 2, pdfW, pdfH)
        } else {
          // Multi-page: slice the canvas row by row
          const pxPerMm  = canvas.width / pdfW
          const slicePx  = Math.floor((pageH - margin * 2) * pxPerMm)
          let srcY = 0
          while (srcY < canvas.height) {
            if (srcY > 0) pdf.addPage()
            const h = Math.min(slicePx, canvas.height - srcY)
            const slice = document.createElement('canvas')
            slice.width  = canvas.width
            slice.height = h
            slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, h, 0, 0, canvas.width, h)
            const slicePdfH = (h / pxPerMm)
            pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, pdfW, slicePdfH)
            srcY += slicePx
          }
        }

        pdf.save('Invoice-' + (invoice?.invoice?.invoice_number || workOrder.work_order_number) + '.pdf')
      } finally {
        document.body.removeChild(wrapper)
      }
    } catch (e) {
      console.error('PDF download error:', e)
      setError('Could not generate PDF: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="animate-spin text-gray-300" size={28} />
    </div>
  )

  const inv       = invoice?.invoice
  const lineItems = invoice?.line_items || []
  const receipt   = invoice?.receipt
  const isPaid    = inv?.status === 'paid'
  const isSent    = inv?.status === 'sent'
  const isOverdue = inv?.status === 'overdue'
  const serviceItems = lineItems.filter(i => i.item_type === 'service')
  const partItems    = lineItems.filter(i => i.item_type === 'part')
  const change       = parseFloat(amountPaid) > (inv?.total_amount || 0)
    ? parseFloat(amountPaid) - inv.total_amount : 0

  // ── No invoice ────────────────────────────────────────────────────────────
  if (!inv) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <FileText className="text-gray-400" size={28} />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">No invoice yet</p>
          <p className="text-sm text-gray-500 mt-1">
            {!woComplete
              ? `Available once work order is completed (currently: ${workOrder.status?.display_name}).`
              : 'Generate an invoice from the completed services and parts.'}
          </p>
        </div>
        {canGenerate ? (
          <div className="w-full space-y-4">
            {/* VAT & Discount inline form */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Invoice Settings</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    VAT Rate (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number" min="0" max="100" step="0.1"
                      value={vatPct}
                      onChange={e => setVatPct(e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Default: 16% (Kenya VAT)</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Discount (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number" min="0" max="100" step="0.1"
                      value={discountPct}
                      onChange={e => setDiscountPct(e.target.value)}
                      className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">0 = no discount shown on invoice</p>
                </div>
              </div>
              {/* Live preview */}
              {(() => {
                const sub  = workOrder.total_amount || workOrder.subtotal || 0
                const disc = Math.max(0, Math.min(100, parseFloat(discountPct) || 0))
                const vat  = Math.max(0, Math.min(100, parseFloat(vatPct)     || 0))
                const discAmt  = sub * disc / 100
                const taxable  = sub - discAmt
                const taxAmt   = taxable * vat / 100
                const total    = taxable + taxAmt
                return (
                  <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{fmt(sub)}</span>
                    </div>
                    {disc > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount ({disc}%)</span>
                        <span>− {fmt(discAmt, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {vat > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>VAT ({vat}%)</span>
                        <span>{fmt(taxAmt, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
                      <span>Total</span>
                      <span>{fmt(total, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            <button onClick={handleGenerate} disabled={generating}
              className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 text-sm font-semibold transition-colors shadow-sm">
              {generating ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><FileText size={15} /> Generate Invoice</>}
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Lock size={12} /> Requires owner, admin, or accountant access to generate.
          </p>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>
    )
  }

  // ── Invoice exists ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Feedback */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={14} />
          <span className="text-red-700">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-sm">
          <CheckCircle className="text-emerald-500 flex-shrink-0 mt-0.5" size={14} />
          <span className="text-emerald-700">{success}</span>
        </div>
      )}

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {downloading ? 'Generating PDF…' : 'Download PDF'}
        </button>
      </div>

      {/* ── Invoice document ─────────────────────────────────────────── */}
      <div ref={printRef} className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">

        {/* Header */}
        <div className="bg-gray-900 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-amber-400 uppercase mb-1">Tax Invoice</p>
            <p className="text-2xl font-black text-white tracking-tight">{inv.invoice_number}</p>
            <p className="text-gray-500 text-xs mt-1">Work Order · {workOrder.work_order_number}</p>
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide ${
              isPaid    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' :
              isOverdue ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30' :
                          'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
            }`}>
              {isPaid    && <BadgeCheck size={11} />}
              {isOverdue && <Clock size={11} />}
              {isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : inv.status?.toUpperCase() || 'ISSUED'}
            </span>
            <div>
              <p className="text-gray-500 text-xs">Issued</p>
              <p className="text-white text-sm font-semibold">{fmtD(inv.issued_at)}</p>
            </div>
            {inv.due_date && (
              <div>
                <p className="text-gray-500 text-xs">Due</p>
                <p className={`text-sm font-semibold ${isOverdue ? 'text-red-400' : 'text-amber-300'}`}>
                  {fmtD(inv.due_date)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Gold accent */}
        <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-300 to-transparent" />

        {/* Line items toggle */}
        <div className="px-6 py-4">
          <button onClick={() => setShowItems(v => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-700 transition-colors">
            <span>Line Items ({lineItems.length})</span>
            {showItems ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showItems && lineItems.length > 0 && (
            <div className="space-y-4">
              {serviceItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Wrench size={12} className="text-blue-500" />
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Services</span>
                  </div>
                  {serviceItems.map((item, i) => (
                    <div key={item.id || i} className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                        {item.description && item.description !== item.item_name && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.description}</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 ml-4 flex-shrink-0">{fmt(item.total_price)}</p>
                    </div>
                  ))}
                </div>
              )}
              {partItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Package size={12} className="text-orange-500" />
                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Parts & Materials</span>
                  </div>
                  {partItems.map((item, i) => (
                    <div key={item.id || i} className="flex items-start justify-between py-2.5 border-b border-gray-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.quantity} × {fmt(item.unit_price)}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 ml-4 flex-shrink-0">{fmt(item.total_price)}</p>
                    </div>
                  ))}
                </div>
              )}
              {lineItems.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No line items on this invoice.</p>
              )}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50">
          <div className="space-y-2 max-w-xs ml-auto">
                        <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900">{fmt(inv.subtotal)}</span>
            </div>
            {inv.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount ({Math.round((inv.discount_pct || 0) * 100)}%)</span>
                <span>− {fmt(inv.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-500">
              <span>VAT ({Math.round((inv.tax_rate || 0.16) * 100)}%)</span>
              <span>{fmt(inv.tax_amount)}</span>
            </div>
            <div className="h-px bg-gray-200" />
            <div className="flex justify-between">
              <span className="text-base font-bold text-gray-900">Total</span>
              <span className="text-xl font-black text-gray-900">{fmt(inv.total_amount)}</span>
            </div>
          </div>
        </div>

        {inv.notes && (
          <div className="px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 italic">{inv.notes}</p>
          </div>
        )}
      </div>

      {/* ── Send invoice / Sent state ──────────────────────────────────── */}
      {!isPaid && isSent ? (
        // Invoice already sent — show confirmation + reminder option
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Send size={13} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Invoice sent to customer</p>
                <p className="text-xs text-gray-500 mt-0.5">
Customer has been notified via email, SMS, and in-app notification.
                </p>
              </div>
            </div>
          </div>
          {canSendInvoice && (
            <div className="flex items-center justify-between pt-2 border-t border-green-200">
              <p className="text-xs text-gray-500">Customer hasn't paid yet? Send a reminder.</p>
              <button onClick={handleSend} disabled={sending}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-green-300 text-green-800 rounded-lg text-xs font-semibold hover:bg-green-100 disabled:opacity-50 transition-colors">
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                Send Reminder
              </button>
            </div>
          )}
        </div>
      ) : !isPaid && canSendInvoice ? (
        // Not yet sent
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Send invoice to customer</p>
            <p className="text-xs text-gray-500 mt-0.5">Customer receives email (with invoice attached), SMS, and in-app notification.</p>
          </div>
          <button onClick={handleSend} disabled={sending}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 flex-shrink-0 transition-colors">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Invoice
          </button>
        </div>
      ) : !isPaid && !canSendInvoice ? (
        <p className="text-xs text-gray-400 flex items-center gap-1.5 py-1">
          <Lock size={12} /> Sending requires owner, admin, or accountant access.
        </p>
      ) : null}

      {/* ── Receipt ─────────────────────────────────────────────────────── */}
      {receipt && (
        <ReceiptCard
          receipt={receipt}
          canConfirm={canConfirm}
          workOrderId={workOrder.id}
          currency={woCurrency}
          onConfirmed={loadInvoice}
        />
      )}

      {/* ── Record payment ───────────────────────────────────────────────── */}
      {!isPaid && canRecordPayment && (
        <div>
          {!showPayForm ? (
            <button
              onClick={() => { setShowPayForm(true); setAmountPaid(inv.total_amount?.toString() || '') }}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-900 hover:text-gray-900 font-medium transition-colors">
              <DollarSign size={15} /> Record Payment
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-900 px-5 py-3 flex items-center gap-2">
                <DollarSign size={14} className="text-amber-400" />
                <span className="text-white font-semibold text-sm">Record Payment</span>
              </div>
              <div className="p-5 space-y-4 bg-white">
                <div className="grid grid-cols-5 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} onClick={() => setPayMethod(m.value)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        payMethod === m.value
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}>
                      <m.icon size={15} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Amount ({currencyLabel})</label>
                    <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Reference / Notes</label>
                    <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                      placeholder="e.g. M-Pesa QXZ12345"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                  </div>
                </div>
                {change > 0 && (
                  <div className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
                    Change to give customer: {fmt(change)}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handlePayment} disabled={paying}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors">
                    {paying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                    Confirm Payment
                  </button>
                  <button onClick={() => setShowPayForm(false)} className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!isPaid && !canRecordPayment && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5 py-1">
          <Lock size={12} /> Recording payment requires owner, admin, or accountant access.
        </p>
      )}
    </div>
  )
}