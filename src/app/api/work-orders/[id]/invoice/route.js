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
import { readLimiter } from '@/lib/rateLimiters'
import { requireUUID } from '@/lib/validation'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request, { params }) {
  const limited = readLimiter.check(request)
  if (limited) return limited

  try {
    const supabase            = await createClient()
    const sc                  = getServiceClient()
    const { id: workOrderId } = await params
    if (!requireUUID(workOrderId)) return NextResponse.json({ error: 'Invalid work order ID' }, { status: 400 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve profile
    const { data: profile } = await sc
      .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

    // Load work order (to get vehicle_id and service_provider_id; also surface
    // currency so the downstream invoice/receipt pages can render properly).
    const { data: wo } = await sc
      .from('work_orders_secure')
      .select('id, vehicle_id, service_provider_id, currency_id, currency:currencies(id, code, symbol, display_name)')
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
        .from('service_providers_secure').select('owner_user_id').eq('id', wo.service_provider_id).maybeSingle()
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
      .select('id, invoice_number, status, subtotal, tax_rate, tax_amount, discount, total_amount, notes, due_date, issued_at, paid_at, issued_to_user_id, vehicle_id, service_provider_id')
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
      .select('id, receipt_number, payment_method, amount_paid, paid_at, notes, confirmed, confirmed_at')
      .eq('invoice_id', inv.id)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Load vehicle & provider names
    const { data: vehicle }  = await sc.from('vehicles_secure').select('plate_number, make, model').eq('id', wo.vehicle_id).maybeSingle()
    const { data: provider } = await sc.from('service_providers_secure').select('id, name, phone, email').eq('id', wo.service_provider_id).maybeSingle()
    const { data: woDetails } = await sc.from('work_orders_secure').select('work_order_number').eq('id', workOrderId).maybeSingle()

    // Resolve customer — uses service role so it works regardless of caller
    // (providers can't read vehicle_ownership via RLS, so we resolve here).
    // Resolution chain mirrors send-invoice and invoice/html routes:
    //   1. issued_to_user_id → user profile
    //   2. vehicle_ownership → individual owner profile
    //   3. vehicle_ownership → company profile (fleet vehicle)
    //   4. booking → booking customer profile
    //   5. work order → walk-in owner name
    let customer = null
    if (inv.issued_to_user_id) {
      const { data: cust } = await sc
        .from('user_profiles_secure')
        .select('first_name, last_name, email, phone')
        .eq('id', inv.issued_to_user_id)
        .maybeSingle()
      if (cust?.first_name || cust?.last_name || cust?.email || cust?.phone) {
        customer = cust
      }
    }
    // Fallback: resolve from vehicle_ownership (individual owner or company fleet)
    if (!customer && wo.vehicle_id) {
      const { data: voRow } = await sc
        .from('vehicle_ownership')
        .select('owner_user_id, owner_company_id')
        .eq('vehicle_id', wo.vehicle_id)
        .maybeSingle()
      if (voRow?.owner_user_id) {
        const { data: ownerProfile } = await sc
          .from('user_profiles_secure')
          .select('first_name, last_name, email, phone')
          .eq('id', voRow.owner_user_id)
          .maybeSingle()
        if (ownerProfile?.first_name || ownerProfile?.last_name) {
          customer = ownerProfile
        }
      } else if (voRow?.owner_company_id) {
        const { data: companyProfile } = await sc
          .from('company_profiles_secure')
          .select('name, phone, email')
          .eq('id', voRow.owner_company_id)
          .maybeSingle()
        if (companyProfile?.name) {
          customer = {
            first_name: companyProfile.name,
            last_name:  '',
            phone:      companyProfile.phone || null,
            email:      companyProfile.email || null,
          }
        }
      }
    }
    // Fallback: booking customer
    if (!customer) {
      const { data: booking } = await sc
        .from('bookings_secure')
        .select('customer:user_profiles_secure!customer_user_id(first_name, last_name, email, phone)')
        .eq('work_order_id', workOrderId)
        .maybeSingle()
      if (booking?.customer) {
        const bc = booking.customer
        if (bc.first_name || bc.last_name || bc.email || bc.phone) {
          customer = bc
        }
      }
    }
    // Fallback: walk-in owner name
    if (!customer) {
      const { data: woWalkin } = await sc
        .from('work_orders_secure')
        .select('walk_in_owner_name')
        .eq('id', workOrderId)
        .maybeSingle()
      if (woWalkin?.walk_in_owner_name) {
        customer = {
          first_name: woWalkin.walk_in_owner_name,
          last_name:  '',
          phone:      null,
          email:      null,
        }
      }
    }

    return NextResponse.json({
      success:    true,
      invoice:    inv,
      line_items: items || [],
      receipt:    receipt || null,
      vehicle,
      provider,
      customer,
      // Currency resolved from work_orders.currency_id. Falls through to null
      // if the work order has no billing currency set.
      currency:   wo.currency || null,
      work_order: woDetails ? { id: workOrderId, number: woDetails.work_order_number } : null,
    })

  } catch (err) {
    console.error('GET /api/work-orders/[id]/invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}