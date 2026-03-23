// src/app/api/inventory/[id]/route.js
// Update and delete individual inventory items

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(request, { params }) {
  try {
    const supabase = await createClient()
    const { id } = params

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      sku,
      part_number,
      brand,
      category,
      stock,
      min_stock_level,
      unit_price,
      is_active
    } = body

    // Update inventory item
    const { data: item, error: updateError } = await supabase
      .from('spare_parts')
      .update({
        name,
        sku,
        part_number,
        brand,
        category,
        stock: parseInt(stock),
        min_stock_level: parseInt(min_stock_level),
        unit_price: parseFloat(unit_price),
        is_active,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Update inventory error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, item })

  } catch (error) {
    console.error('Update inventory error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = await createClient()
    const { id } = params

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
      console.error('Delete inventory error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete inventory error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Adjust stock quantity
export async function PATCH(request, { params }) {
  try {
    const supabase = await createClient()
    const { id } = params

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

    // Update stock
    const { data: item, error: updateError } = await supabase
      .from('spare_parts')
      .update({
        stock: newStock,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`Stock adjusted: ${currentItem.stock} → ${newStock} (${adjustment > 0 ? '+' : ''}${adjustment})${reason ? ` - ${reason}` : ''}`)

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
    console.error('Stock adjustment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}