// src/app/api/inventory/[id]/route.js
// REAL FIX - await params in Next.js 15+

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(request, context) {
  try {
    // CRITICAL FIX: await params in Next.js 15+
    const params = await context.params
    const { id } = params

    console.log('📝 PUT request for item ID:', id) // Should show actual ID now

    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      primary_image_url,
      
      // Status
      is_active
    } = body

    // Prepare update data
    const updateData = {
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
      // Empty string would be rejected as an invalid uuid; coerce to null.
      shop_id: shop_id || null,
      stock: parseInt(stock) || 0,
      min_stock_level: parseInt(min_stock_level) || 0,
      reorder_level: reorder_level ? parseInt(reorder_level) : null,
      reorder_quantity: reorder_quantity ? parseInt(reorder_quantity) : null,
      unit_price: parseFloat(unit_price) || 0,
      cost_price: cost_price ? parseFloat(cost_price) : null,
      currency: currency || 'KES',
      // Empty string is not a valid uuid; coerce to null.
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
      is_active: is_active !== false,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }

    console.log('💾 Updating item:', id) // DEBUG

    // Update inventory item
    const { data: item, error: updateError } = await supabase
      .from('spare_parts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('❌ Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log('✅ Update successful!')

    return NextResponse.json({ success: true, item })

  } catch (error) {
    console.error('❌ Update inventory error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request, context) {
  try {
    // CRITICAL FIX: await params in Next.js 15+
    const params = await context.params
    const { id } = params

    console.log('🗑️ DELETE request for item ID:', id)

    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete inventory item
    const { error: deleteError } = await supabase
      .from('spare_parts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('❌ Delete error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    console.log('✅ Delete successful!')

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('❌ Delete inventory error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Adjust stock quantity
export async function PATCH(request, context) {
  try {
    // CRITICAL FIX: await params in Next.js 15+
    const params = await context.params
    const { id } = params

    console.log('📊 PATCH (adjust stock) for item ID:', id)

    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { adjustment, reason } = body

    // Validate
    if (adjustment === undefined || adjustment === 0) {
      return NextResponse.json({ error: 'Adjustment value required' }, { status: 400 })
    }

    // Get current stock
    const { data: currentItem, error: fetchError } = await supabase
      .from('spare_parts')
      .select('stock')
      .eq('id', id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const newStock = currentItem.stock + parseInt(adjustment)

    if (newStock < 0) {
      return NextResponse.json({ error: 'Stock cannot be negative' }, { status: 400 })
    }

    // Prepare update
    const updateData = {
      stock: newStock,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }

    // If adding stock, update last_restocked_at
    if (adjustment > 0) {
      updateData.last_restocked_at = new Date().toISOString()
    }

    // Update stock
    const { data: item, error: updateError } = await supabase
      .from('spare_parts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('❌ Stock update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`✅ Stock adjusted: ${currentItem.stock} → ${newStock} (${adjustment > 0 ? '+' : ''}${adjustment})`)

    return NextResponse.json({ 
      success: true, 
      item,
      adjustment: {
        previous: currentItem.stock,
        current: newStock,
        change: adjustment
      }
    })

  } catch (error) {
    console.error('❌ Stock adjustment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}