'use client'

/**
 * ReceiptTab
 * Shows the receipt for a work order inside a tab.
 * Used by: provider work order page, my-teams work order page.
 *
 * Props:
 *   workOrder   — { id, service_provider_id, work_order_number, ... }
 *   canConfirm  — boolean (owner / admin / accountant / mechanic-invoice)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Receipt, Loader2, AlertCircle, Download,
  CheckCircle, Clock, CreditCard, Banknote, Building2,
  FileText, BadgeCheck, Car, Wrench
} from 'lucide-react'

const METHOD_ICONS = {
  cash: Banknote, mpesa: CreditCard, card: CreditCard,
  bank_transfer: Building2, cheque: FileText,
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

export default function ReceiptTab({ workOrder, canConfirm = false }) {
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
  const [confirming,  setConfirming]  = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [confirmErr,  setConfirmErr]  = useState('')

  const load = useCallback(async () => {
    try {
      // 1. Invoice for this work order
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, discount, total_amount, notes, due_date, issued_at, paid_at, vehicle_id, service_provider_id, issued_to_user_id')
        .eq('work_order_id', workOrder.id)
        .maybeSingle()
      if (invErr) throw invErr
      if (!inv) { setLoading(false); return }
      setInvoice(inv)

      // 2. Receipt
      const { data: rct } = await supabase
        .from('receipts')
        .select('id, receipt_number, payment_method, amount_paid, paid_at, notes, confirmed, confirmed_at, confirmed_by, paid_by_user_id')
        .eq('invoice_id', inv.id)
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setReceipt(rct || null)

      // 3. Line items
      const { data: lineItems } = await supabase
        .from('invoice_items')
        .select('id, item_type, item_name, description, quantity, unit_price, total_price')
        .eq('invoice_id', inv.id)
        .order('item_type')
      setItems(lineItems || [])

      // 4. Vehicle
      if (inv.vehicle_id) {
        const { data: veh } = await supabase
          .from('vehicles').select('plate_number, make, model, year').eq('id', inv.vehicle_id).maybeSingle()
        setVehicle(veh)
      }

      // 5. Provider
      if (inv.service_provider_id) {
        const { data: sp } = await supabase
          .from('service_providers').select('name, phone, email, address').eq('id', inv.service_provider_id).maybeSingle()
        setProvider(sp)
      }

      // 6. Customer — issued_to_user_id, then vehicle_ownership fallback
      if (inv.issued_to_user_id) {
        const { data: cust } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, email, phone')
          .eq('id', inv.issued_to_user_id)
          .maybeSingle()
        if (cust?.first_name || cust?.last_name) {
          setCustomer(cust)
        }
      }
      // Fallback: resolve from vehicle_ownership (individual or company)
      if (!customer && inv.vehicle_id) {
        const { data: vo } = await supabase
          .from('vehicle_ownership')
          .select('owner_user_id, owner_company_id, user_profiles!vehicle_ownership_owner_user_id_fkey(first_name, last_name, email, phone), company_profiles!vehicle_ownership_owner_company_id_fkey(name, phone, email)')
          .eq('vehicle_id', inv.vehicle_id)
          .maybeSingle()
        if (vo?.user_profiles?.first_name || vo?.user_profiles?.last_name) {
          setCustomer(vo.user_profiles)
        } else if (vo?.company_profiles?.name) {
          setCustomer({ first_name: vo.company_profiles.name, last_name: '', phone: vo.company_profiles.phone, email: vo.company_profiles.email })
        }
      }

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [workOrder.id])

  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirm('Confirm this payment has been received and verified?')) return
    setConfirming(true); setConfirmErr('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('confirm_receipt', {
        p_receipt_id:      receipt.id,
        p_caller_auth_uid: user.id,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      await load()
    } catch (e) {
      setConfirmErr(e.message)
    } finally {
      setConfirming(false)
    }
  }

  // Strip oklch/lab/color-mix colors that html2canvas can't parse.
  // Called via onclone so the original DOM is untouched.
  const stripModernColors = (doc) => {
    const FALLBACKS = { color: '#000000', backgroundColor: 'transparent', borderColor: '#e5e7eb', outlineColor: 'transparent' }
    const UNSUPPORTED = /oklch|oklab|\blab\b|color-mix|lch/i
    doc.querySelectorAll('*').forEach(el => {
      const cs = window.getComputedStyle(el)
      Object.keys(FALLBACKS).forEach(prop => {
        try {
          const val = cs.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase())
          if (val && UNSUPPORTED.test(val)) {
            el.style[prop] = FALLBACKS[prop]
          }
        } catch (_) {}
      })
      // Also scrub inline style attributes that contain these functions
      if (el.getAttribute('style') && UNSUPPORTED.test(el.getAttribute('style'))) {
        const cleaned = el.getAttribute('style').replace(/[a-z-]+\s*:\s*(?:oklch|oklab|lab|lch|color-mix)[^;]+;?/gi, '')
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

      // Render into a fixed A4-width (794px @96dpi) off-screen container so the
      // capture is never constrained by the on-screen column layout
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
        const pageW  = pdf.internal.pageSize.getWidth()   // 210mm
        const pageH  = pdf.internal.pageSize.getHeight()  // 297mm
        const margin = 8
        const pdfW   = pageW - margin * 2                 // 194mm
        const pdfH   = (canvas.height / canvas.width) * pdfW

        if (pdfH <= pageH - margin * 2) {
          // Single page — centre vertically
          pdf.addImage(imgData, 'PNG', margin, (pageH - pdfH) / 2, pdfW, pdfH)
        } else {
          // Multi-page: slice canvas row by row
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

        pdf.save('Receipt-' + (receipt?.receipt_number || workOrder.work_order_number) + '.pdf')
      } finally {
        document.body.removeChild(wrapper)
      }
    } catch (e) {
      console.error('PDF download error:', e)
    } finally {
      setDownloading(false)
    }
  }


  if (loading) return (
    <div className="flex justify-center items-center h-40">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  if (error) return (
    <div className="flex items-center gap-2 p-4 bg-red-50 rounded-xl text-sm text-red-700">
      <AlertCircle size={16} /> {error}
    </div>
  )

  if (!invoice) return (
    <div className="text-center py-12 text-gray-400">
      <Receipt size={40} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium">No invoice yet</p>
      <p className="text-xs mt-1 text-gray-400">A receipt will appear here once an invoice is generated and paid.</p>
    </div>
  )

  if (!receipt) return (
    <div className="text-center py-12 text-gray-400">
      <Clock size={40} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium">Awaiting Payment</p>
      <p className="text-xs mt-1">Invoice {invoice.invoice_number} · {fmt(invoice.total_amount)}</p>
      <p className="text-xs mt-1 text-gray-400">A receipt will appear here once payment is submitted.</p>
    </div>
  )

  const MethodIcon   = METHOD_ICONS[receipt.payment_method] || CreditCard
  const isConfirmed  = receipt.confirmed
  const services     = items.filter(i => i.item_type === 'service')
  const parts        = items.filter(i => i.item_type === 'part')
  const tax          = Math.round((invoice.tax_rate || 0.16) * 100)
  const custName     = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : null

  return (
    <div className="space-y-4">
      {/* ── Action bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConfirmed
            ? <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                <BadgeCheck size={13} /> Confirmed
              </span>
            : <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                <Clock size={13} /> Awaiting Confirmation
              </span>
          }
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {downloading ? 'Generating PDF…' : 'Download PDF'}
        </button>
      </div>

      {/* ── Printable receipt ── */}
      <div ref={printRef} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
        <ReceiptContent
          receipt={receipt} invoice={invoice} items={items}
          vehicle={vehicle} provider={provider} customer={customer}
          custName={custName} services={services} parts={parts}
          tax={tax} fmt={fmt} fmtD={fmtD} fmtDs={fmtDs}
          MethodIcon={MethodIcon} isConfirmed={isConfirmed}
        />
      </div>

      {/* ── Confirm action ── */}
      {!isConfirmed && canConfirm && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Confirm Payment Received</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Mark this payment as verified and reconciled by your garage.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {confirmErr && (
              <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {confirmErr}</p>
            )}
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {confirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {confirming ? 'Confirming…' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Pure receipt layout (also used by standalone receipt page) ────────────────
export function ReceiptContent({
  receipt, invoice, items, vehicle, provider, customer,
  custName, services, parts, tax, fmt, fmtD, fmtDs,
  MethodIcon = CreditCard, isConfirmed,
}) {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Dark header */}
      <div style={{ background: '#0f172a', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#f59e0b', textTransform: 'uppercase' }}>
              Motiifix
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, color: '#fff' }}>
              Payment Receipt
            </p>
            {provider && (
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>{provider.name}</p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, maxWidth: '45%' }}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#fff', wordBreak: 'break-all' }}>
              {receipt.receipt_number}
            </p>
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 20,
              fontSize: 11, fontWeight: 700,
              background: isConfirmed ? '#16a34a' : '#b45309',
              color: '#fff',
            }}>
              {isConfirmed ? '✓ CONFIRMED' : 'PENDING'}
            </span>
          </div>
        </div>

        {/* Date row */}
        <div style={{ marginTop: 20, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Payment Date</p>
            <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{fmtDs(receipt.paid_at)}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Invoice</p>
            <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{invoice.invoice_number}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Method</p>
            <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', fontWeight: 600, textTransform: 'capitalize' }}>
              {receipt.payment_method?.replace('_', ' ')}
            </p>
          </div>
          {isConfirmed && receipt.confirmed_at && (
            <div>
              <p style={{ margin: '0 0 2px', fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Confirmed</p>
              <p style={{ margin: 0, fontSize: 13, color: '#4ade80', fontWeight: 600 }}>{fmtDs(receipt.confirmed_at)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Amber accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg,#f59e0b,#fbbf24,transparent)' }} />

      {/* From / To row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ padding: '16px 24px', borderRight: '1px solid #f1f5f9' }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>FROM</p>
          {provider ? (
            <>
              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{provider.name}</p>
              {provider.phone && <p style={{ margin: '0 0 2px', fontSize: 12, color: '#64748b' }}>{provider.phone}</p>}
              {provider.email && <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{provider.email}</p>}
            </>
          ) : <p style={{ fontSize: 13, color: '#94a3b8' }}>Service Provider</p>}
        </div>
        <div style={{ padding: '16px 24px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>BILLED TO</p>
          {custName ? (
            <>
              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{custName}</p>
              {customer?.phone && <p style={{ margin: '0 0 2px', fontSize: 12, color: '#64748b' }}>{customer.phone}</p>}
              {customer?.email && <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{customer.email}</p>}
            </>
          ) : <p style={{ fontSize: 13, color: '#94a3b8' }}>Customer</p>}
          {vehicle && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#475569', fontWeight: 600 }}>
              🚗 {vehicle.plate_number} · {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      </div>

      {/* Line items */}
      {items.length > 0 && (
        <div style={{ padding: '0 24px 8px' }}>
          {/* Services */}
          {services.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1 }}>
                SERVICES
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Description</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Unit</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((item, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 12px', color: '#0f172a', fontWeight: 500 }}>{item.item_name}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>{item.quantity}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Parts */}
          {parts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: 1 }}>
                PARTS & MATERIALS
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Part</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Unit</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: '#64748b', fontSize: 11 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((item, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 12px', color: '#0f172a', fontWeight: 500 }}>{item.item_name}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>{item.quantity}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      <div style={{ margin: '8px 24px 0', borderTop: '1px solid #e2e8f0', paddingTop: 12, paddingBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#64748b' }}>
              <span>Subtotal</span><span>{fmt(invoice.subtotal)}</span>
            </div>
            {invoice.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#16a34a' }}>
                <span>Discount</span><span>−{fmt(invoice.discount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#64748b' }}>
              <span>VAT ({tax}%)</span><span>{fmt(invoice.tax_amount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: 6, background: '#0f172a', borderRadius: 10, fontSize: 15, fontWeight: 800 }}>
              <span style={{ color: '#f59e0b' }}>AMOUNT PAID</span>
              <span style={{ color: '#fff' }}>{fmt(receipt.amount_paid)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {receipt.notes && (
        <div style={{ margin: '12px 24px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>Reference / Notes</p>
          <p style={{ margin: 0, fontSize: 13, color: '#78350f' }}>{receipt.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div style={{ margin: '16px 24px 28px', textAlign: 'center', paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
        <p style={{ margin: '0 0 2px', fontSize: 11, color: '#94a3b8' }}>Thank you for choosing {provider?.name || 'our service'}.</p>
        <p style={{ margin: 0, fontSize: 10, color: '#cbd5e1' }}>Powered by Motiifix · motiifix.com</p>
      </div>
    </div>
  )
}