import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Get company fleet
export async function GET(request) {
  try {
    const supabase = await createClient()
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get user's company
    const { data: companyUser } = await supabase
      .from('company_users')
      .select('company_id')
      .eq('user_id', userProfile.id)
      .single()

    if (!companyUser) {
      return NextResponse.json({ 
        error: 'Not a company member' 
      }, { status: 403 })
    }

    // Get company fleet
    const { data: fleet, error: fleetError } = await supabase
      .from('vehicle_ownership')
      .select(`
        *,
        vehicle:vehicles(
          id,
          license_plate,
          make,
          model,
          year,
          vin,
          color,
          created_at
        )
      `)
      .eq('owner_company_id', companyUser.company_id)
      .order('created_at', { ascending: false })

    if (fleetError) {
      console.error('❌ Fleet fetch error:', fleetError)
      return NextResponse.json({ 
        error: fleetError.message 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      fleet: fleet || [],
      count: fleet?.length || 0
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// Add vehicle to fleet
export async function POST(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    // Validate required fields
    if (!body.licensePlate || !body.make || !body.model) {
      return NextResponse.json({ 
        error: 'License plate, make, and model are required' 
      }, { status: 400 })
    }

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get user's company (must be admin)
    const { data: companyUser } = await supabase
      .from('company_users')
      .select('company_id, is_admin')
      .eq('user_id', userProfile.id)
      .single()

    if (!companyUser) {
      return NextResponse.json({ 
        error: 'Not a company member' 
      }, { status: 403 })
    }

    if (!companyUser.is_admin) {
      return NextResponse.json({ 
        error: 'Only company admins can add vehicles' 
      }, { status: 403 })
    }

    // Check if vehicle already exists
    const { data: existingVehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('license_plate', body.licensePlate)
      .single()

    if (existingVehicle) {
      return NextResponse.json({ 
        error: 'A vehicle with this license plate already exists' 
      }, { status: 400 })
    }

    // Create vehicle
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .insert([{
        license_plate: body.licensePlate,
        make: body.make,
        model: body.model,
        year: body.year,
        vin: body.vin,
        color: body.color
      }])
      .select()

    if (vehicleError) {
      console.error('❌ Vehicle creation error:', vehicleError)
      return NextResponse.json({ 
        error: `Failed to create vehicle: ${vehicleError.message}` 
      }, { status: 500 })
    }

    console.log('✅ Vehicle created:', vehicle[0].id)

    // Create ownership record
    const { data: ownership, error: ownershipError } = await supabase
      .from('vehicle_ownership')
      .insert([{
        vehicle_id: vehicle[0].id,
        owner_company_id: companyUser.company_id,
        owner_user_id: null // Company owns it, not individual user
      }])
      .select()

    if (ownershipError) {
      console.error('❌ Ownership creation error:', ownershipError)
      // Try to delete the vehicle we just created
      await supabase.from('vehicles').delete().eq('id', vehicle[0].id)
      
      return NextResponse.json({ 
        error: `Failed to assign ownership: ${ownershipError.message}` 
      }, { status: 500 })
    }

    console.log('✅ Vehicle ownership assigned to company')

    return NextResponse.json({
      success: true,
      vehicleId: vehicle[0].id,
      ownershipId: ownership[0].id,
      vehicle: vehicle[0],
      message: 'Vehicle added to company fleet successfully'
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}