// src/app/api/inventory/route.js
// ENHANCED - Handles ALL inventory fields

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get service provider
    const { data: provider, error: providerError } = await supabase
      .from('service_providers_secure')
      .select('id, name, currency_id')
      .eq('owner_user_id', profile.id)
      .single()

    if (providerError) {
      // Check if user is a mechanic
      const { data: mechanic } = await supabase
        .from('mechanics')
        .select('service_provider_id')
        .eq('user_id', profile.id)
        .single()

      if (!mechanic) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }

      // Get inventory for mechanic's provider
      const { data: inventory, error: invError } = await supabase
        .from('spare_parts')
        .select('*')
        .eq('service_provider_id', mechanic.service_provider_id)
        .order('name', { ascending: true })

      if (invError) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      return NextResponse.json({ inventory, shops: [], readOnly: true })
    }

    // Get inventory for provider (all fields)
    const { data: inventory, error: invError } = await supabase
      .from('spare_parts')
      .select('*')
      .eq('service_provider_id', provider.id)
      .order('name', { ascending: true })

    if (invError) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Also fetch this provider's shops so the inventory form can populate
    // its Shop dropdown without a separate round trip. We include each shop's
    // currency_id so the pricing tab can cascade-resolve the active currency.
    const { data: shops } = await supabase
      .from('shops_secure')
      .select('id, name, town, currency_id')
      .eq('service_provider_id', provider.id)
      .order('name', { ascending: true })

    // Full currencies list — used as the fallback dropdown options when
    // neither the selected shop nor the provider has set a currency.
    const { data: currencies } = await supabase
      .from('currencies')
      .select('id, code, display_name, symbol, sort_order')
      .eq('is_active', true)
      .order('sort_order', { nullsFirst: false })
      .order('code')

    // Calculate statistics
    const totalItems = inventory.length
    const activeItems = inventory.filter(item => item.is_active).length
    const lowStockItems = inventory.filter(
      item => item.is_active && item.stock <= item.min_stock_level
    ).length
    const outOfStockItems = inventory.filter(
      item => item.is_active && item.stock === 0
    ).length
    const reorderNeeded = inventory.filter(
      item => item.is_active && item.reorder_level && item.stock <= item.reorder_level
    ).length
    const totalValue = inventory.reduce(
      (sum, item) => sum + (item.stock * (item.unit_price || 0)), 
      0
    )
    const totalCost = inventory.reduce(
      (sum, item) => sum + (item.stock * (item.cost_price || 0)), 
      0
    )

    return NextResponse.json({
      inventory,
      shops: shops || [],
      currencies: currencies || [],
      provider: { id: provider.id, currency_id: provider.currency_id || null },
      stats: {
        totalItems,
        activeItems,
        lowStockItems,
        outOfStockItems,
        reorderNeeded,
        totalValue,
        totalCost,
        potentialProfit: totalValue - totalCost
      },
      readOnly: false
    })

  } catch (error) {
    console.error('Inventory fetch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Add new inventory item with ALL fields
export async function POST(request) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get service provider
    const { data: provider, error: providerError } = await supabase
      .from('service_providers_secure')
      .select('id')
      .eq('owner_user_id', profile.id)
      .single()

    if (providerError) {
      return NextResponse.json({ error: 'Not a service provider' }, { status: 403 })
    }

    const body = await request.json()
    
    // Extract ALL fields from request
    const {
      // Basic
      name,
      description,
      notes,
      sku,
      part_number,
      barcode,
      
      // Brand & Manufacturer
      brand,
      manufacturer,
      model,
      warranty_months,
      
      // Category & Location
      category,
      location_in_shop,
      shop_id,
      
      // Stock
      stock,
      min_stock_level,
      reorder_level,
      reorder_quantity,
      
      // Pricing
      unit_price,
      cost_price,
      currency,
      currency_id,
      
      // Supplier
      supplier_name,
      supplier_contact,
      supplier_part_number,
      supplier_price,
      supplier_lead_time_days,
      
      // Physical
      weight,
      weight_unit,
      dimensions,
      
      // Automotive
      compatible_vehicles,
      vehicle_compatibility,
      
      // Quality
      condition,
      is_consumable,
      oem_part,
      certification_standards,
      
      // Media
      image_urls,
      primary_image_url
    } = body

    // Validate required fields
    if (!name) {
      return NextResponse.json({ error: 'Part name is required' }, { status: 400 })
    }

    // Prepare insert data
    const insertData = {
      service_provider_id: provider.id,
      name,
      description: description || null,
      notes: notes || null,
      sku: sku || null,
      part_number: part_number || null,
      barcode: barcode || null,
      brand: brand || null,
      manufacturer: manufacturer || null,
      model: model || null,
      warranty_months: warranty_months ? parseInt(warranty_months) : null,
      category: category || null,
      location_in_shop: location_in_shop || null,
      // shop_id is a uuid FK; convert empty string to null so Postgres accepts it.
      shop_id: shop_id || null,
      stock: parseInt(stock) || 0,
      min_stock_level: parseInt(min_stock_level) || 0,
      reorder_level: reorder_level ? parseInt(reorder_level) : null,
      reorder_quantity: reorder_quantity ? parseInt(reorder_quantity) : null,
      unit_price: parseFloat(unit_price) || 0,
      cost_price: cost_price ? parseFloat(cost_price) : null,
      currency: currency || 'KES',
      // Empty string would be rejected as an invalid uuid; coerce to null.
      currency_id: currency_id || null,
      supplier_name: supplier_name || null,
      supplier_contact: supplier_contact || null,
      supplier_part_number: supplier_part_number || null,
      supplier_price: supplier_price ? parseFloat(supplier_price) : null,
      supplier_lead_time_days: supplier_lead_time_days ? parseInt(supplier_lead_time_days) : null,
      weight: weight ? parseFloat(weight) : null,
      weight_unit: weight_unit || 'kg',
      dimensions: dimensions || null,
      compatible_vehicles: compatible_vehicles || null,
      vehicle_compatibility: vehicle_compatibility || null,
      condition: condition || 'new',
      is_consumable: is_consumable || false,
      oem_part: oem_part || false,
      certification_standards: certification_standards || null,
      image_urls: image_urls || null,
      primary_image_url: primary_image_url || null,
      updated_by: user.id
    }

    // Create inventory item
    const { data: item, error: createError } = await supabase
      .from('spare_parts')
      .insert(insertData)
      .select()
      .single()

    if (createError) {
      console.error('Create inventory error:', createError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ success: true, item }, { status: 201 })

  } catch (error) {
    console.error('Add inventory error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}