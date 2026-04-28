/**
 * GET /api/work-orders/[id]/invoice
 * Returns invoice details for a work order.
 * Uses service role to bypass RLS, then verifies the caller is:
 *   - the vehicle owner (individual)
 *   - a member of a company that owns the vehicle
 *   - provider staff
 *   - platform admin
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request, { params }) {
  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve profile
    const { data: profile } = await sc
      .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

    // Load work order (to get vehicle_id and service_provider_id)
    const { data: wo } = await sc
      .from('work_orders')
      .select('id, vehicle_id, service_provider_id')
      .eq('id', workOrderId).maybeSingle()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // Auth check — is caller allowed to see this invoice?
    let canRead = false

    // 1. Individual vehicle owner
    const { data: vo } = await sc
      .from('vehicle_ownership').select('owner_user_id, owner_company_id')
      .eq('vehicle_id', wo.vehicle_id).maybeSingle()

    if (vo?.owner_user_id === profile.id) canRead = true

    // 2. Company member — any active company_user of the owning company
    if (!canRead && vo?.owner_company_id) {
      const { data: cu } = await sc
        .from('company_users').select('id')
        .eq('company_id', vo.owner_company_id)
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle()
      if (cu) canRead = true
    }

    // 3. Provider staff / owner
    if (!canRead) {
      const { data: sp } = await sc
        .from('service_providers').select('owner_user_id').eq('id', wo.service_provider_id).maybeSingle()
      if (sp?.owner_user_id === profile.id) canRead = true
    }
    if (!canRead) {
      const { data: spu } = await sc
        .from('service_provider_users').select('id')
        .eq('service_provider_id', wo.service_provider_id)
        .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
      if (spu) canRead = true
    }

    // 4. Mechanic on the provider
    if (!canRead) {
      const { data: mech } = await sc
        .from('mechanics').select('id')
        .eq('service_provider_id', wo.service_provider_id)
        .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
      if (mech) canRead = true
    }

    if (!canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Load invoice
    const { data: inv } = await sc
      .from('invoices')
      .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, discount, total_amount, notes, due_date, issued_at, paid_at, sent_at')
      .eq('work_order_id', workOrderId).maybeSingle()

    if (!inv) return NextResponse.json({ success: true, invoice: null })

    // Load line items
    const { data: items } = await sc
      .from('invoice_items')
      .select('id, item_type, item_name, description, quantity, unit_price, total_price')
      .eq('invoice_id', inv.id)
      .order('item_type')

    // Load receipt
    const { data: receipt } = await sc
      .from('receipts')
      .select('id, receipt_number, payment_method, amount_paid, paid_at, notes')
      .eq('invoice_id', inv.id)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Load vehicle & provider names
    const { data: vehicle }  = await sc.from('vehicles').select('plate_number, make, model').eq('id', wo.vehicle_id).maybeSingle()
    const { data: provider } = await sc.from('service_providers').select('name, phone, email').eq('id', wo.service_provider_id).maybeSingle()
    const { data: woDetails } = await sc.from('work_orders').select('work_order_number').eq('id', workOrderId).maybeSingle()

    return NextResponse.json({
      success:    true,
      invoice:    inv,
      line_items: items || [],
      receipt:    receipt || null,
      vehicle,
      provider,
      work_order: woDetails ? { id: workOrderId, number: woDetails.work_order_number } : null,
    })

  } catch (err) {
    console.error('GET /api/work-orders/[id]/invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}