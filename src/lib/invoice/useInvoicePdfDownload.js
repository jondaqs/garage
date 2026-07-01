'use client'

import { useState } from 'react'

/**
 * Client-side hook that downloads the work order's invoice as a PDF.
 *
 * Flow:
 *  1. Fetch the canonical invoice HTML from /api/work-orders/{id}/invoice/html
 *     — the same document the email attaches. Going through the shared
 *     `buildInvoiceHtml` route on the server guarantees the downloaded PDF
 *     matches what the customer received by email.
 *  2. Render it into a hidden iframe at A4 width. The iframe is isolated
 *     from the host page's stylesheet, which dodges every Tailwind v4
 *     oklch/lab/color-mix parsing issue html2canvas has — the email HTML
 *     uses only hex colours and inline styles.
 *  3. html2canvas → jsPDF, sliced into multiple A4 pages when needed.
 *
 * Lazy-loads html2canvas and jspdf so the libs don't bloat the host page's
 * initial bundle. Both are already in package.json.
 *
 * Returns:
 *   downloading – true while a download is in progress
 *   error       – last error message, '' if none
 *   download()  – kick off the download
 *
 * Both `workOrderId` and `invoiceNumber` are required at call time; passing
 * them as args (rather than reading them inside the hook) keeps the hook
 * decoupled from any particular invoice-page data shape.
 */
export function useInvoicePdfDownload() {
  const [downloading, setDownloading] = useState(false)
  const [error,       setError]       = useState('')

  const download = async ({ workOrderId, invoiceNumber }) => {
    if (!workOrderId) {
      setError('Missing work order id.')
      return
    }
    setDownloading(true)
    setError('')

    const A4_PX = 794   // 210mm @ ~96dpi
    let iframe = null

    try {
      // 1. Fetch the canonical invoice HTML (same doc the email attaches).
      const resp = await fetch(`/api/work-orders/${workOrderId}/invoice/html`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error || `Failed to load invoice (HTTP ${resp.status})`)
      }
      const html = await resp.text()

      // 2. Lazy-load PDF libs in parallel with the iframe render.
      const libsPromise = Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      // 3. Build an off-screen iframe sized to A4 width and write the HTML.
      iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.style.cssText =
        'position:fixed;left:-10000px;top:0;width:' + A4_PX + 'px;height:1px;' +
        'border:0;background:#ffffff;'
      document.body.appendChild(iframe)

      const idoc = iframe.contentDocument || iframe.contentWindow.document
      idoc.open()
      idoc.write(html)
      idoc.close()

      // 4. Wait for the iframe to finish layout. The email HTML has no
      // external scripts or remote images, so layout is essentially instant.
      // A two-frame delay after readyState 'complete' gives the browser a
      // chance to flush styles.
      await new Promise((resolve) => {
        const ready = () => {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        }
        if (idoc.readyState === 'complete') ready()
        else iframe.addEventListener('load', ready, { once: true })
      })

      // 5. Resize the iframe to its content height so html2canvas captures
      // the whole document in one pass.
      const fullHeight = Math.max(
        idoc.documentElement.scrollHeight,
        idoc.body.scrollHeight,
      )
      iframe.style.height = fullHeight + 'px'

      const [{ default: html2canvas }, { default: jsPDF }] = await libsPromise

      // 6. Capture from inside the iframe's own document so the host page's
      // Tailwind stylesheet can't leak in.
      const canvas = await html2canvas(idoc.documentElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f1f5f9',   // matches the email body background
        width: A4_PX,
        height: fullHeight,
        windowWidth: A4_PX,
        windowHeight: fullHeight,
      })

      // 7. Compose the PDF — single page if it fits, sliced if it doesn't.
      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW  = pdf.internal.pageSize.getWidth()   // 210mm
      const pageH  = pdf.internal.pageSize.getHeight()  // 297mm
      const margin = 8
      const pdfW   = pageW - margin * 2                 // 194mm
      const pdfH   = (canvas.height / canvas.width) * pdfW

      if (pdfH <= pageH - margin * 2) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG',
          margin, (pageH - pdfH) / 2, pdfW, pdfH)
      } else {
        const pxPerMm = canvas.width / pdfW
        const slicePx = Math.floor((pageH - margin * 2) * pxPerMm)
        let srcY = 0
        while (srcY < canvas.height) {
          if (srcY > 0) pdf.addPage()
          const h = Math.min(slicePx, canvas.height - srcY)
          const slice = document.createElement('canvas')
          slice.width  = canvas.width
          slice.height = h
          slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, h, 0, 0, canvas.width, h)
          const slicePdfH = h / pxPerMm
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, pdfW, slicePdfH)
          srcY += slicePx
        }
      }

      pdf.save(`Invoice-${invoiceNumber || workOrderId}.pdf`)
    } catch (e) {
      console.error('PDF download error:')
      setError(e.message || 'Could not generate PDF. Please try again.')
    } finally {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe)
      setDownloading(false)
    }
  }

  return { downloading, error, download }
}