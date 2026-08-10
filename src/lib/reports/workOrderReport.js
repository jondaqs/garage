/**
 * Work Order Report — client-side PDF generator (jsPDF, vector text).
 *
 * Mirrors the vehicle history report: shareable, selectable text, small file.
 * Designed as a summary document for owners, fleet managers, and providers.
 *
 * Usage:
 *   import { generateWorkOrderReport } from '@/lib/reports/workOrderReport'
 *   await generateWorkOrderReport(wo)
 *
 * `wo` must include: work_order_number, status, vehicle, service_provider,
 *   services, parts, and optionally owner, shop, problem_description,
 *   opened_at, completed_at, initial_mileage, final_mileage, vat_rate,
 *   subtotal, tax, total_amount, issues, sessions, currency_obj.
 */

export async function generateWorkOrderReport(wo) {
  const { default: jsPDF } = await import('jspdf')

  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 14
  const contentW = pageW - margin * 2

  let y = margin

  // ── Helpers ──────────────────────────────────────────────────────────
  const ensureSpace = (needed) => {
    if (y + needed > pageH - margin) { pdf.addPage(); y = margin }
  }
  const setFont = (size, weight = 'normal') => {
    pdf.setFont('helvetica', weight); pdf.setFontSize(size)
  }
  const rgb  = (r, g, b) => pdf.setTextColor(r, g, b)
  const fill = (r, g, b) => pdf.setFillColor(r, g, b)
  const grayLine = () => {
    pdf.setDrawColor(220, 220, 220); pdf.setLineWidth(0.2)
    pdf.line(margin, y, pageW - margin, y)
  }
  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
  const fmtMoney = (n) => {
    const cur = wo.currency_obj
    const code = cur?.code || cur?.currency_code || 'KES'
    return code + ' ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })
  }

  const plate = wo.vehicle?.plate_number || '—'
  const woNum = wo.work_order_number || wo.number || 'N/A'
  const statusName = wo.status?.display_name || wo.status?.code || '—'
  const providerName = wo.service_provider?.name || '—'

  // ── Header ───────────────────────────────────────────────────────────
  setFont(20, 'bold'); rgb(20, 20, 20)
  pdf.text('Work Order Report', margin, y + 6)
  setFont(9, 'normal'); rgb(120, 120, 120)
  pdf.text('Generated ' + fmtDate(new Date()), pageW - margin, y + 6, { align: 'right' })
  y += 14

  // WO number + status
  setFont(16, 'bold'); rgb(30, 64, 175)
  pdf.text(woNum, margin, y)
  setFont(10, 'bold')
  const isCompleted = ['completed', 'closed'].includes(wo.status?.code)
  const isCancelled = wo.status?.code === 'cancelled'
  if (isCancelled)     { rgb(220, 38, 38) }
  else if (isCompleted){ rgb(22, 163, 74) }
  else                 { rgb(180, 120, 0) }
  pdf.text(statusName.toUpperCase(), pageW - margin, y, { align: 'right' })
  y += 8
  grayLine(); y += 6

  // ── Section 1: Overview ──────────────────────────────────────────────
  ensureSpace(50)
  setFont(11, 'bold'); rgb(40, 40, 40)
  pdf.text('Overview', margin, y); y += 6

  const ownerName = wo.owner
    ? (wo.owner.owner_type === 'company'
      ? wo.owner.company_name
      : [wo.owner.first_name, wo.owner.last_name].filter(Boolean).join(' '))
    : (wo.walk_in_owner_name || null)

  const details = [
    ['Work Order',       woNum],
    ['Status',           statusName],
    ['Vehicle',          plate],
    ['Make / Model',     [wo.vehicle?.make, wo.vehicle?.model, wo.vehicle?.year_of_manufacture].filter(Boolean).join(' ') || '—'],
    ['Color',            wo.vehicle?.color || '—'],
    ['Service Provider', providerName],
    ['Shop',             wo.shop?.name || wo.shop?.town || '—'],
  ]
  if (ownerName) details.push(['Owner', ownerName])
  if (wo.mechanic?.user) {
    const mech = wo.mechanic.user
    details.push(['Assigned Mechanic', [mech.first_name, mech.last_name].filter(Boolean).join(' ') || '—'])
  }
  details.push(['Opened', fmtDate(wo.opened_at || wo.created_at)])
  if (wo.completed_at) details.push(['Completed', fmtDate(wo.completed_at)])
  if (wo.initial_mileage) {
    let mileageStr = Number(wo.initial_mileage).toLocaleString() + ' km'
    if (wo.final_mileage) mileageStr += '  →  ' + Number(wo.final_mileage).toLocaleString() + ' km'
    details.push(['Mileage', mileageStr])
  }

  const colW = contentW / 2
  details.forEach((row, idx) => {
    const col  = idx % 2
    const rowY = y + Math.floor(idx / 2) * 10
    const x    = margin + col * colW
    ensureSpace(12)
    setFont(8, 'normal'); rgb(140, 140, 140)
    pdf.text(row[0].toUpperCase(), x, rowY)
    setFont(10, 'normal'); rgb(30, 30, 30)
    pdf.text(String(row[1]), x, rowY + 4.5)
  })
  y += Math.ceil(details.length / 2) * 10 + 4
  grayLine(); y += 6

  // ── Section 2: Problem description ───────────────────────────────────
  if (wo.problem_description) {
    ensureSpace(18)
    setFont(11, 'bold'); rgb(40, 40, 40)
    pdf.text('Problem Description', margin, y); y += 6
    setFont(10, 'normal'); rgb(60, 60, 60)
    const descLines = pdf.splitTextToSize(wo.problem_description, contentW)
    ensureSpace(descLines.length * 4.5 + 4)
    pdf.text(descLines, margin, y)
    y += descLines.length * 4.5 + 2
    grayLine(); y += 6
  }

  // ── Section 3: Issues / Diagnostics ──────────────────────────────────
  const issues = Array.isArray(wo.issues) ? wo.issues.filter(i => i) : []
  if (issues.length > 0) {
    ensureSpace(16)
    setFont(11, 'bold'); rgb(40, 40, 40)
    pdf.text('Issues / Diagnostics', margin, y)
    setFont(9, 'normal'); rgb(140, 140, 140)
    pdf.text(issues.length + ' issue' + (issues.length === 1 ? '' : 's'), pageW - margin, y, { align: 'right' })
    y += 6

    issues.forEach((issue) => {
      ensureSpace(14)
      setFont(9, 'bold'); rgb(60, 60, 60)
      const title = issue.title || issue.description || 'Issue'
      pdf.text('•  ' + title, margin, y)
      y += 4
      if (issue.severity) {
        setFont(8, 'normal'); rgb(140, 140, 140)
        pdf.text('Severity: ' + issue.severity, margin + 5, y); y += 3.5
      }
      if (issue.description && issue.title) {
        setFont(8, 'normal'); rgb(100, 100, 100)
        const lines = pdf.splitTextToSize(issue.description, contentW - 5)
        ensureSpace(lines.length * 3.5)
        pdf.text(lines, margin + 5, y)
        y += lines.length * 3.5
      }
      y += 2
    })
    grayLine(); y += 6
  }

  // ── Section 4: Services ──────────────────────────────────────────────
  const services = wo.services || []
  if (services.length > 0) {
    ensureSpace(16)
    setFont(11, 'bold'); rgb(40, 40, 40)
    pdf.text('Services', margin, y)
    setFont(9, 'normal'); rgb(140, 140, 140)
    pdf.text(services.length + ' item' + (services.length === 1 ? '' : 's'), pageW - margin, y, { align: 'right' })
    y += 7

    // Table header
    setFont(8, 'bold'); rgb(100, 100, 100)
    pdf.text('SERVICE', margin, y)
    pdf.text('EST. COST', pageW - margin - 30, y)
    pdf.text('ACTUAL', pageW - margin, y, { align: 'right' })
    y += 4

    services.forEach((svc) => {
      ensureSpace(8)
      setFont(9, 'normal'); rgb(30, 30, 30)
      const name = svc.service?.name || svc.service_name || svc.name || 'Service'
      const truncName = name.length > 50 ? name.slice(0, 47) + '...' : name
      pdf.text(truncName, margin, y)
      setFont(9, 'normal'); rgb(100, 100, 100)
      pdf.text(fmtMoney(svc.estimated_cost), pageW - margin - 30, y)
      setFont(9, 'normal'); rgb(30, 30, 30)
      pdf.text(fmtMoney(svc.actual_cost || svc.estimated_cost), pageW - margin, y, { align: 'right' })
      y += 5
    })
    y += 2; grayLine(); y += 6
  }

  // ── Section 5: Parts ─────────────────────────────────────────────────
  const parts = wo.parts || []
  if (parts.length > 0) {
    ensureSpace(16)
    setFont(11, 'bold'); rgb(40, 40, 40)
    pdf.text('Parts', margin, y)
    setFont(9, 'normal'); rgb(140, 140, 140)
    pdf.text(parts.length + ' item' + (parts.length === 1 ? '' : 's'), pageW - margin, y, { align: 'right' })
    y += 7

    setFont(8, 'bold'); rgb(100, 100, 100)
    pdf.text('PART', margin, y)
    pdf.text('QTY', pageW - margin - 50, y)
    pdf.text('UNIT PRICE', pageW - margin - 25, y)
    pdf.text('TOTAL', pageW - margin, y, { align: 'right' })
    y += 4

    parts.forEach((p) => {
      ensureSpace(8)
      setFont(9, 'normal'); rgb(30, 30, 30)
      const name = p.part_name || p.name || 'Part'
      const truncName = name.length > 40 ? name.slice(0, 37) + '...' : name
      pdf.text(truncName, margin, y)
      setFont(9, 'normal'); rgb(100, 100, 100)
      pdf.text(String(p.quantity || 1), pageW - margin - 50, y)
      pdf.text(fmtMoney(p.unit_price), pageW - margin - 25, y)
      setFont(9, 'normal'); rgb(30, 30, 30)
      pdf.text(fmtMoney((p.quantity || 1) * Number(p.unit_price || 0)), pageW - margin, y, { align: 'right' })
      y += 5
    })
    y += 2; grayLine(); y += 6
  }

  // ── Section 6: Cost summary ──────────────────────────────────────────
  const servicesTotal = services.reduce((s, sv) => s + Number(sv.actual_cost || sv.estimated_cost || 0), 0)
  const partsTotal    = parts.reduce((s, p) => s + (p.quantity || 1) * Number(p.unit_price || 0), 0)
  const vatRate       = wo.vat_rate ?? 0
  const subtotal      = wo.subtotal || (servicesTotal + partsTotal)
  const discount      = wo.discount || 0
  const tax           = wo.tax || Math.round(subtotal * vatRate / 100 * 100) / 100
  const total         = wo.total_amount || (subtotal - discount + tax)

  if (subtotal > 0) {
    ensureSpace(40)
    setFont(11, 'bold'); rgb(40, 40, 40)
    pdf.text('Cost Summary', margin, y); y += 7

    const summaryX  = pageW - margin - 60
    const summaryXR = pageW - margin

    const rows = [
      ['Services', fmtMoney(servicesTotal)],
      ['Parts',    fmtMoney(partsTotal)],
      ['Subtotal', fmtMoney(subtotal)],
    ]
    if (discount > 0) rows.push(['Discount', '- ' + fmtMoney(discount)])
    if (vatRate > 0)   rows.push(['VAT (' + vatRate + '%)', fmtMoney(tax)])

    rows.forEach(([label, value]) => {
      ensureSpace(6)
      setFont(9, 'normal'); rgb(100, 100, 100)
      pdf.text(label, summaryX, y)
      setFont(9, 'normal'); rgb(30, 30, 30)
      pdf.text(value, summaryXR, y, { align: 'right' })
      y += 5
    })

    // Total line
    y += 1
    pdf.setDrawColor(40, 40, 40); pdf.setLineWidth(0.4)
    pdf.line(summaryX, y, summaryXR, y)
    y += 5
    setFont(12, 'bold'); rgb(20, 20, 20)
    pdf.text('TOTAL', summaryX, y)
    pdf.text(fmtMoney(total), summaryXR, y, { align: 'right' })
    y += 6
    grayLine(); y += 6
  }

  // ── Section 7: Service sessions timeline ─────────────────────────────
  const sessions = wo.sessions || []
  if (sessions.length > 0) {
    ensureSpace(16)
    setFont(11, 'bold'); rgb(40, 40, 40)
    pdf.text('Service Sessions', margin, y); y += 6

    sessions.forEach((s) => {
      ensureSpace(12)
      setFont(9, 'bold'); rgb(60, 60, 60)
      pdf.text(fmtDate(s.started_at || s.created_at), margin, y)
      setFont(9, 'normal'); rgb(100, 100, 100)
      const dur = s.duration_minutes ? s.duration_minutes + ' min' : ''
      if (dur) pdf.text(dur, margin + 40, y)
      const mechName = s.mechanic_name || ''
      if (mechName) { setFont(9, 'normal'); rgb(80, 80, 80); pdf.text(mechName, margin + 65, y) }
      y += 5
    })
    y += 2; grayLine(); y += 6
  }

  // ── Page numbers ─────────────────────────────────────────────────────
  const totalPages = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p)
    setFont(8, 'normal'); rgb(160, 160, 160)
    pdf.text('Page ' + p + ' of ' + totalPages, pageW - margin, pageH - 6, { align: 'right' })
    pdf.text(woNum + ' · ' + plate + ' · Carfix-Connect', margin, pageH - 6)
  }

  // ── Save ─────────────────────────────────────────────────────────────
  const fileDate = new Date().toISOString().slice(0, 10)
  pdf.save('Work-Order-' + woNum + '-' + fileDate + '.pdf')
}
