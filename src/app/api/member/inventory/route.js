// → src/app/api/member/inventory/route.js
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { writeLimiter } from '@/lib/rateLimiters'

/**
 * GET  /api/member/inventory?providerId=<uuid>
 * POST /api/member/inventory   { providerId, ...itemData }
 *
 * Inventory access for service_provider_users members with can_manage_inventory.
 * Uses RPC for permission checks and data retrieval.
 */

// ── Shared: resolve caller + verify membership + permission ────────────────
async function resolveContext(supabase, providerId) {
  if (!providerId) return { error: 'providerId is required', status: 400 }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await supabase
    .from('user_profiles_secure')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found', status: 404 }

  // Check if user is the provider owner
  const { data: ownedProvider } = await supabase
    .from('service_providers_secure')
    .select('id')
    .eq('id', providerId)
    .eq('owner_user_id', profile.id)
    .maybeSingle()

  if (ownedProvider) {
    return { profileId: profile.id, authId: user.id, providerId, canManage: true, isOwner: true }
  }

  // Check service_provider_users membership
  const { data: spu } = await supabase
    .from('service_provider_users')
    .select('id, role, can_manage_inventory')
    .eq('user_id', profile.id)
    .eq('service_provider_id', providerId)
    .eq('is_active', true)
    .maybeSingle()

  if (!spu) return { error: 'Not a member of this service provider', status: 403 }

  // Also check mechanics table for merged permissions
  const { data: mech } = await supabase
    .from('mechanics')
    .select('can_manage_inventory')
    .eq('user_id', profile.id)
    .eq('service_provider_id', providerId)
    .eq('is_active', true)
    .maybeSingle()

  const canManage = !!(spu.can_manage_inventory || mech?.can_manage_inventory)

  if (!canManage) {
    return { error: 'You do not have inventory management permission', status: 403 }
  }

  return { profileId: profile.id, authId: user.id, providerId, canManage: true, isOwner: false, role: spu.role }
}

// ── GET: list inventory for a provider ──────────────────────────────────────
export async function GET(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const providerId = searchParams.get('providerId')

    const ctx = await resolveContext(supabase, providerId)
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    // Fetch inventory
    const { data: inventory, error: invErr } = await supabase
      .from('spare_parts')
      .select('*')
      .eq('service_provider_id', ctx.providerId)
      .order('name', { ascending: true })

    if (invErr) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Fetch shops for this provider
    const { data: shops } = await supabase
      .from('shops_secure')
      .select('id, name, town, currency_id')
      .eq('service_provider_id', ctx.providerId)
      .order('name', { ascending: true })

    // Currencies
    const { data: currencies } = await supabase
      .from('currencies')
      .select('id, code, display_name, symbol, sort_order')
      .eq('is_active', true)
      .order('sort_order', { nullsFirst: false })
      .order('code')

    // Provider info
    const { data: providerInfo } = await supabase
      .from('service_providers_secure')
      .select('id, name, currency_id')
      .eq('id', ctx.providerId)
      .single()

    // Stats
    const items = inventory || []
    const stats = {
      totalItems: items.length,
      activeItems: items.filter(i => i.is_active).length,
      lowStockItems: items.filter(i => i.is_active && i.stock <= i.min_stock_level).length,
      outOfStockItems: items.filter(i => i.is_active && i.stock === 0).length,
      totalValue: items.reduce((s, i) => s + (i.stock * (i.unit_price || 0)), 0),
    }

    return NextResponse.json({
      success: true,
      inventory: items,
      shops: shops || [],
      currencies: currencies || [],
      provider: providerInfo ? { id: providerInfo.id, name: providerInfo.name, currency_id: providerInfo.currency_id } : null,
      stats,
      canManage: ctx.canManage,
    })
  } catch (err) {
    console.error('Member inventory GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST: add new inventory item ────────────────────────────────────────────
export async function POST(request) {
  const limited2 = writeLimiter.check(request)
  if (limited2) return limited2

  try {
    const supabase = await createClient()
    const body = await request.json()
    const { providerId, ...itemData } = body

    const ctx = await resolveContext(supabase, providerId)
    if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    if (!itemData.name) {
      return NextResponse.json({ error: 'Part name is required' }, { status: 400 })
    }

    const insertData = {
      service_provider_id: ctx.providerId,
      name: itemData.name,
      description: itemData.description || null,
      notes: itemData.notes || null,
      sku: itemData.sku || null,
      part_number: itemData.part_number || null,
      barcode: itemData.barcode || null,
      brand: itemData.brand || null,
      manufacturer: itemData.manufacturer || null,
      model: itemData.model || null,
      warranty_months: itemData.warranty_months ? parseInt(itemData.warranty_months) : null,
      category: itemData.category || null,
      location_in_shop: itemData.location_in_shop || null,
      shop_id: itemData.shop_id || null,
      stock: parseInt(itemData.stock) || 0,
      min_stock_level: parseInt(itemData.min_stock_level) || 0,
      reorder_level: itemData.reorder_level ? parseInt(itemData.reorder_level) : null,
      reorder_quantity: itemData.reorder_quantity ? parseInt(itemData.reorder_quantity) : null,
      unit_price: parseFloat(itemData.unit_price) || 0,
      cost_price: itemData.cost_price ? parseFloat(itemData.cost_price) : null,
      currency: itemData.currency || 'KES',
      currency_id: itemData.currency_id || null,
      supplier_name: itemData.supplier_name || null,
      supplier_contact: itemData.supplier_contact || null,
      supplier_part_number: itemData.supplier_part_number || null,
      supplier_price: itemData.supplier_price ? parseFloat(itemData.supplier_price) : null,
      supplier_lead_time_days: itemData.supplier_lead_time_days ? parseInt(itemData.supplier_lead_time_days) : null,
      weight: itemData.weight ? parseFloat(itemData.weight) : null,
      weight_unit: itemData.weight_unit || 'kg',
      dimensions: itemData.dimensions || null,
      compatible_vehicles: itemData.compatible_vehicles || null,
      vehicle_compatibility: itemData.vehicle_compatibility || null,
      condition: itemData.condition || 'new',
      is_consumable: itemData.is_consumable || false,
      oem_part: itemData.oem_part || false,
      certification_standards: itemData.certification_standards || null,
      image_urls: itemData.image_urls || null,
      primary_image_url: itemData.primary_image_url || null,
      updated_by: ctx.authId,
    }

    const { data: item, error: createErr } = await supabase
      .from('spare_parts')
      .insert(insertData)
      .select()
      .single()

    if (createErr) {
      console.error('Member inventory create error:', createErr)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ success: true, item }, { status: 201 })
  } catch (err) {
    console.error('Member inventory POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}