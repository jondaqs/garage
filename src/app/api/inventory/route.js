// src/app/api/inventory/route.js
// GET all inventory items for the current provider

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
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get service provider
    const { data: provider, error: providerError } = await supabase
      .from('service_providers')
      .select('id, name')
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
        return NextResponse.json({ error: invError.message }, { status: 500 })
      }

      return NextResponse.json({ inventory, readOnly: true })
    }

    // Get inventory for provider
    const { data: inventory, error: invError } = await supabase
      .from('spare_parts')
      .select('*')
      .eq('service_provider_id', provider.id)
      .order('name', { ascending: true })

    if (invError) {
      return NextResponse.json({ error: invError.message }, { status: 500 })
    }

    // Calculate statistics
    const totalItems = inventory.length
    const activeItems = inventory.filter(item => item.is_active).length
    const lowStockItems = inventory.filter(
      item => item.is_active && item.stock <= item.min_stock_level
    ).length
    const outOfStockItems = inventory.filter(
      item => item.is_active && item.stock === 0
    ).length
    const totalValue = inventory.reduce(
      (sum, item) => sum + (item.stock * (item.unit_price || 0)), 
      0
    )

    return NextResponse.json({
      inventory,
      stats: {
        totalItems,
        activeItems,
        lowStockItems,
        outOfStockItems,
        totalValue
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

// POST - Add new inventory item
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
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get service provider
    const { data: provider, error: providerError } = await supabase
      .from('service_providers')
      .select('id')
      .eq('owner_user_id', profile.id)
      .single()

    if (providerError) {
      return NextResponse.json({ error: 'Not a service provider' }, { status: 403 })
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
      unit_price
    } = body

    // Validate required fields
    if (!name) {
      return NextResponse.json({ error: 'Part name is required' }, { status: 400 })
    }

    // Create inventory item
    const { data: item, error: createError } = await supabase
      .from('spare_parts')
      .insert({
        service_provider_id: provider.id,
        name,
        sku: sku || null,
        part_number: part_number || null,
        brand: brand || null,
        category: category || null,
        stock: parseInt(stock) || 0,
        min_stock_level: parseInt(min_stock_level) || 0,
        unit_price: parseFloat(unit_price) || 0,
        updated_by: user.id
      })
      .select()
      .single()

    if (createError) {
      console.error('Create inventory error:', createError)
      return NextResponse.json({ error: createError.message }, { status: 500 })
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