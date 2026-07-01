import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireCompanyWrite } from '@/lib/guards/companyAccess'
import { writeLimiter } from '@/lib/rateLimiters'
import { requireUUID } from '@/lib/validation'

// Get single vehicle
export async function GET(request, { params }) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const { id } = await params
    if (!requireUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vehicle with ownership
    const { data: vehicle, error } = await supabase
      .from('vehicle_ownership')
      .select(`
        *,
        vehicle:vehicles_secure(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 404 })
    }

    return NextResponse.json({ success: true, vehicle })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Update vehicle
export async function PUT(request, { params }) {
  const limited2 = writeLimiter.check(request)
  if (limited2) return limited2

  try {
    const supabase = await createClient()
    const { id } = await params
    if (!requireUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    const body = await request.json()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile and verify admin
    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    const { data: companyUser } = await supabase
      .from('company_users')
      .select('company_id, is_admin')
      .eq('user_id', userProfile.id)
      .single()

    if (!companyUser?.is_admin) {
      return NextResponse.json({ 
        error: 'Only admins can update vehicles' 
      }, { status: 403 })
    }

    // ◀ SUBSCRIPTION GUARD
    const denied = await requireCompanyWrite(supabase, companyUser.company_id)
    if (denied) return denied

    // Get vehicle ID from ownership
    const { data: ownership } = await supabase
      .from('vehicle_ownership')
      .select('vehicle_id')
      .eq('id', id)
      .single()

    if (!ownership) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    }

    // Update vehicle
    const { data: updated, error: updateError } = await supabase
      .from('vehicles')
      .update({
        make: body.make,
        model: body.model,
        year: body.year,
        color: body.color,
        vin: body.vin
      })
      .eq('id', ownership.vehicle_id)
      .select()

    if (updateError) {
      console.error('❌ Update error:', updateError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      vehicle: updated[0],
      message: 'Vehicle updated successfully'
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Delete vehicle from fleet
export async function DELETE(request, { params }) {
  const limited3 = writeLimiter.check(request)
  if (limited3) return limited3

  try {
    const supabase = await createClient()
    const { id } = await params
    if (!requireUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile and verify admin
    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    const { data: companyUser } = await supabase
      .from('company_users')
      .select('company_id, is_admin')
      .eq('user_id', userProfile.id)
      .single()

    if (!companyUser?.is_admin) {
      return NextResponse.json({ 
        error: 'Only admins can remove vehicles' 
      }, { status: 403 })
    }

    // ◀ SUBSCRIPTION GUARD
    const denied = await requireCompanyWrite(supabase, companyUser.company_id)
    if (denied) return denied

    // Delete ownership (this removes from fleet but keeps vehicle record)
    const { error: deleteError } = await supabase
      .from('vehicle_ownership')
      .delete()
      .eq('id', id)
      .eq('owner_company_id', companyUser.company_id)

    if (deleteError) {
      console.error('❌ Delete error:', deleteError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Vehicle removed from fleet successfully'
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}