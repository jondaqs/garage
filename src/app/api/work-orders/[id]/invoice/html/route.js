/**
 * GET /api/work-orders/[id]/invoice/html
 *
 * Returns the invoice as a standalone HTML document — byte-identical to the
 * file attached to the customer email by /api/work-orders/[id]/send-invoice.
 *
 * Used by the in-app PDF download: the client fetches this HTML, renders it
 * into a hidden iframe, then captures it with html2canvas + jsPDF. Going
 * through the same `buildInvoiceHtml` module the email uses guarantees the
 * downloaded PDF is a faithful render of the email attachment.
 *
 * Auth: caller must be the vehicle owner, an active member of the owning
 * company, the provider owner, active provider staff, a mechanic on the
 * provider, or a platform admin. Mirrors the auth chain on the sibling
 * GET /api/work-orders/[id]/invoice route, which is in turn aligned with
 * the invoices_select RLS policy.
 *
 * The response sets Content-Type: text/html so it can be rendered directly
 * in an iframe (`<iframe srcdoc=...>`) without parsing.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { buildInvoiceHtml }                    from '@/lib/invoice/buildInvoiceHtml'
import { readLimiter } from '@/lib/rateLimiters'
import { requireUUID } from '@/lib/validation'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(_request, { params }) {
  const limited = readLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params
    if (!requireUUID(workOrderId)) return NextResponse.json({ error: 'Invalid work order ID' }, { status: 400 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve caller profile.
    const { data: profile } = await sc
      .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

    // Load work order — need vehicle, provider, and the WO number.
    const { data: wo } = await sc
      .from('work_orders_secure')
      .select('id, work_order_number, vehicle_id, service_provider_id')
      .eq('id', workOrderId).maybeSingle()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // ── Authorisation: identical chain to GET /invoice route ──────────────
    let canRead = false

    // 1. Individual vehicle owner
    const { data: vo } = await sc
      .from('vehicle_ownership').select('owner_user_id, owner_company_id')
      .eq('vehicle_id', wo.vehicle_id).maybeSingle()
    if (vo?.owner_user_id === profile.id) canRead = true

    // 2. Company member of the owning company
    if (!canRead && vo?.owner_company_id) {
      const { data: cu } = await sc
        .from('company_users').select('id')
        .eq('company_id', vo.owner_company_id)
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle()
      if (cu) canRead = true
    }

    // 3. Provider owner
    if (!canRead) {
      const { data: sp } = await sc
        .from('service_providers_secure').select('owner_user_id')
        .eq('id', wo.service_provider_id).maybeSingle()
      if (sp?.owner_user_id === profile.id) canRead = true
    }

    // 4. Provider staff (any active SPU is fine for read)
    if (!canRead) {
      const { data: spu } = await sc
        .from('service_provider_users').select('id')
        .eq('service_provider_id', wo.service_provider_id)
        .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
      if (spu) canRead = true
    }

    // 5. Mechanic on the provider
    if (!canRead) {
      const { data: mech } = await sc
        .from('mechanics').select('id')
        .eq('service_provider_id', wo.service_provider_id)
        .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
      if (mech) canRead = true
    }

    if (!canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // ── Load the invoice itself ───────────────────────────────────────────
    const { data: inv } = await sc
      .from('invoices')
      .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, total_amount, notes, due_date, issued_at, issued_to_user_id')
      .eq('work_order_id', workOrderId).maybeSingle()
    if (!inv) return NextResponse.json({ error: 'No invoice exists for this work order' }, { status: 404 })

    // Line items, split by type for the template.
    const { data: items } = await sc
      .from('invoice_items')
      .select('item_type, item_name, description, quantity, unit_price, total_price')
      .eq('invoice_id', inv.id)
      .order('item_type')
    const lineItems    = items || []
    const serviceItems = lineItems.filter(i => i.item_type === 'service')
    const partItems    = lineItems.filter(i => i.item_type === 'part')

    // Provider name (for the "From" block).
    const { data: provRow } = await sc
      .from('service_providers_secure').select('name')
      .eq('id', wo.service_provider_id).maybeSingle()

    // Vehicle plate (for the "Bill To" block).
    const { data: veh } = await sc
      .from('vehicles_secure').select('plate_number').eq('id', wo.vehicle_id).maybeSingle()

    // Owner name — same resolution chain as send-invoice so the document
    // matches what was emailed.
    let ownerName = null
    let ownerId   = inv.issued_to_user_id
    if (!ownerId) {
      if (vo?.owner_user_id) {
        ownerId = vo.owner_user_id
      } else if (vo?.owner_company_id) {
        const { data: co } = await sc
          .from('company_profiles_secure').select('owner_user_id').eq('id', vo.owner_company_id).maybeSingle()
        ownerId = co?.owner_user_id || null
      }
    }
    if (ownerId) {
      const { data: op } = await sc
        .from('user_profiles_secure').select('first_name, last_name')
        .eq('id', ownerId).maybeSingle()
      if (op) ownerName = `${op.first_name || ''} ${op.last_name || ''}`.trim() || null
    }
    // Walk-in / booking fallbacks (same order as send-invoice route).
    if (!ownerName) {
      const { data: booking } = await sc
        .from('bookings_secure')
        .select('customer:user_profiles_secure!customer_user_id(first_name, last_name)')
        .eq('work_order_id', workOrderId).maybeSingle()
      if (booking?.customer) {
        ownerName = `${booking.customer.first_name || ''} ${booking.customer.last_name || ''}`.trim() || null
      }
    }
    if (!ownerName) {
      const { data: woWalkin } = await sc
        .from('work_orders_secure').select('walk_in_owner_name').eq('id', workOrderId).maybeSingle()
      ownerName = woWalkin?.walk_in_owner_name || null
    }

    // Build the document.
    const woUrl = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
    const html = buildInvoiceHtml({
      invoiceNumber:   inv.invoice_number,
      workOrderNumber: wo.work_order_number,
      providerName:    provRow?.name || 'Service Provider',
      vehiclePlate:    veh?.plate_number || '',
      ownerName:       ownerName || 'Customer',
      issuedAt:        inv.issued_at,
      dueDate:         inv.due_date,
      serviceItems,
      partItems,
      subtotal:        inv.subtotal,
      taxRate:         inv.tax_rate,
      taxAmount:       inv.tax_amount,
      totalAmount:     inv.total_amount,
      notes:           inv.notes,
      woUrl,
    })

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    })

  } catch (err) {
    console.error('GET /api/work-orders/[id]/invoice/html error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}