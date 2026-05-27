// → src/app/api/member/inventory/[id]/route.js
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * PUT    /api/member/inventory/<id>   — update an inventory item
 * DELETE /api/member/inventory/<id>   — delete an inventory item
 *
 * Both require the caller to be an active service_provider_users member
 * (or provider owner) with can_manage_inventory permission.
 * The providerId is resolved from the spare_parts row itself.
 */

async function resolveAndAuthorise(supabase, itemId) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await supabase
    .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return { error: 'Profile not found', status: 404 }

  // Find the item and its provider
  const { data: item } = await supabase
    .from('spare_parts').select('id, service_provider_id').eq('id', itemId).single()
  if (!item) return { error: 'Item not found', status: 404 }

  const providerId = item.service_provider_id

  // Owner check
  const { data: owned } = await supabase
    .from('service_providers').select('id')
    .eq('id', providerId).eq('owner_user_id', profile.id).maybeSingle()
  if (owned) return { authId: user.id, providerId, itemId }

  // SPU check
  const { data: spu } = await supabase
    .from('service_provider_users')
    .select('can_manage_inventory')
    .eq('user_id', profile.id).eq('service_provider_id', providerId).eq('is_active', true)
    .maybeSingle()

  // Mechanic check (merged permissions)
  const { data: mech } = await supabase
    .from('mechanics')
    .select('can_manage_inventory')
    .eq('user_id', profile.id).eq('service_provider_id', providerId).eq('is_active', true)
    .maybeSingle()

  const canManage = !!(spu?.can_manage_inventory || mech?.can_manage_inventory)
  if (!canManage) return { error: 'No inventory management permission', status: 403 }

  return { authId: user.id, providerId, itemId }
}

// ── PUT: update item ────────────────────────────────────────────────────────
export async function PUT(request, context) {
  try {
    const params = await context.params
    const { id } = params
    const supabase = await createClient()

    const ctx = await resolveAndAuthorise(supabase, id)
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const body = await request.json()

    const updateData = {
      name: body.name,
      description: body.description || null,
      notes: body.notes || null,
      sku: body.sku || null,
      part_number: body.part_number || null,
      barcode: body.barcode || null,
      brand: body.brand || null,
      manufacturer: body.manufacturer || null,
      model: body.model || null,
      warranty_months: body.warranty_months ? parseInt(body.warranty_months) : null,
      category: body.category || null,
      location_in_shop: body.location_in_shop || null,
      shop_id: body.shop_id || null,
      stock: parseInt(body.stock) || 0,
      min_stock_level: parseInt(body.min_stock_level) || 0,
      reorder_level: body.reorder_level ? parseInt(body.reorder_level) : null,
      reorder_quantity: body.reorder_quantity ? parseInt(body.reorder_quantity) : null,
      unit_price: parseFloat(body.unit_price) || 0,
      cost_price: body.cost_price ? parseFloat(body.cost_price) : null,
      currency: body.currency || 'KES',
      currency_id: body.currency_id || null,
      supplier_name: body.supplier_name || null,
      supplier_contact: body.supplier_contact || null,
      supplier_part_number: body.supplier_part_number || null,
      supplier_price: body.supplier_price ? parseFloat(body.supplier_price) : null,
      supplier_lead_time_days: body.supplier_lead_time_days ? parseInt(body.supplier_lead_time_days) : null,
      weight: body.weight ? parseFloat(body.weight) : null,
      weight_unit: body.weight_unit || 'kg',
      dimensions: body.dimensions || null,
      compatible_vehicles: body.compatible_vehicles || null,
      vehicle_compatibility: body.vehicle_compatibility || null,
      condition: body.condition || 'new',
      is_consumable: body.is_consumable ?? false,
      oem_part: body.oem_part ?? false,
      is_active: body.is_active ?? true,
      certification_standards: body.certification_standards || null,
      image_urls: body.image_urls || null,
      primary_image_url: body.primary_image_url || null,
      updated_by: ctx.authId,
      updated_at: new Date().toISOString(),
    }

    const { data: updated, error: updateErr } = await supabase
      .from('spare_parts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateErr) {
      console.error('Member inventory PUT error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, item: updated })
  } catch (err) {
    console.error('Member inventory PUT error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE: remove item ─────────────────────────────────────────────────────
export async function DELETE(request, context) {
  try {
    const params = await context.params
    const { id } = params
    const supabase = await createClient()

    const ctx = await resolveAndAuthorise(supabase, id)
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const { error: delErr } = await supabase
      .from('spare_parts')
      .delete()
      .eq('id', id)

    if (delErr) {
      console.error('Member inventory DELETE error:', delErr)
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Member inventory DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}