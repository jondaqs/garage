/**
 * Download an HTML string as a PDF file.
 *
 * Uses html2canvas + jsPDF (dynamically imported) following the same
 * pattern as ReceiptTab / FleetVehicleDetailView.
 *
 * @param {string} html     — Full HTML document string
 * @param {string} filename — PDF filename (without .pdf extension)
 * @returns {Promise<void>}
 */
export async function downloadHtmlAsPdf(html, filename = 'document') {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const A4_PX = 794 // A4 width at 96dpi

  // Strip oklch/lab/color-mix colors that html2canvas can't parse
  const stripModernColors = (doc) => {
    const FALLBACKS = { color: '#000000', backgroundColor: 'transparent', borderColor: '#e5e7eb', outlineColor: 'transparent' }
    const UNSUPPORTED = /oklch|oklab|\blab\b|color-mix|lch/i
    doc.querySelectorAll('*').forEach(el => {
      const cs = window.getComputedStyle(el)
      Object.keys(FALLBACKS).forEach(prop => {
        try {
          const val = cs.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase())
          if (val && UNSUPPORTED.test(val)) el.style[prop] = FALLBACKS[prop]
        } catch (_) {}
      })
      if (el.getAttribute('style') && UNSUPPORTED.test(el.getAttribute('style'))) {
        const cleaned = el.getAttribute('style').replace(/[a-z-]+\s*:\s*(?:oklch|oklab|lab|lch|color-mix)[^;]+;?/gi, '')
        el.setAttribute('style', cleaned)
      }
    })
  }

  // Create off-screen container with A4 width
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${A4_PX}px;background:#ffffff;overflow:visible;`

  // Create iframe to isolate the HTML and its inline styles
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `width:${A4_PX}px;height:0;border:none;visibility:hidden;`
  wrapper.appendChild(iframe)
  document.body.appendChild(wrapper)

  try {
    // Write HTML into iframe
    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()

    // Wait for content to render
    await new Promise(r => setTimeout(r, 300))

    // Resize iframe to content height
    const body = iframe.contentDocument.body
    iframe.style.height = body.scrollHeight + 'px'

    // Capture the iframe body
    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: A4_PX,
      height: body.scrollHeight,
      windowWidth: A4_PX,
      onclone: (clonedDoc) => {
        stripModernColors(clonedDoc)
      },
    })

    // Build PDF
    const imgData = canvas.toDataURL('image/png')
    const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW  = pdf.internal.pageSize.getWidth()   // 210mm
    const pageH  = pdf.internal.pageSize.getHeight()  // 297mm
    const margin = 8
    const pdfW   = pageW - margin * 2
    const pdfH   = (canvas.height / canvas.width) * pdfW

    if (pdfH <= pageH - margin * 2) {
      // Single page — centre vertically
      pdf.addImage(imgData, 'PNG', margin, (pageH - pdfH) / 2, pdfW, pdfH)
    } else {
      // Multi-page: slice canvas row by row
      const pxPerMm = canvas.width / pdfW
      const slicePx = Math.floor((pageH - margin * 2) * pxPerMm)
      let srcY = 0
      while (srcY < canvas.height) {
        if (srcY > 0) pdf.addPage()
        const h = Math.min(slicePx, canvas.height - srcY)
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = h
        slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, h, 0, 0, canvas.width, h)
        const slicePdfH = h / pxPerMm
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, pdfW, slicePdfH)
        srcY += slicePx
      }
    }

    pdf.save(filename + '.pdf')
  } finally {
    document.body.removeChild(wrapper)
  }
}