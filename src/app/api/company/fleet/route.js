import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { piiHmacRaw } from '@/lib/pii'

// Get company fleet
export async function GET(request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check ownership first, then membership
    let companyId = null

    const { data: ownedCompany } = await supabase
      .from('company_profiles_secure')
      .select('id')
      .eq('owner_user_id', userProfile.id)
      .maybeSingle()

    if (ownedCompany) {
      companyId = ownedCompany.id
    } else {
      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', userProfile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (companyUser) companyId = companyUser.company_id
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Not associated with a company' }, { status: 403 })
    }

    // BUG 1.2 FIX: select correct column names from vehicles table
    // vehicle_ownership has no created_at — order by vehicles.created_at via the join
    const { data: fleet, error: fleetError } = await supabase
      .from('vehicle_ownership')
      .select(`
        vehicle_id,
        owner_user_id,
        owner_company_id,
        vehicle:vehicles(
          id,
          plate_number,
          make,
          model,
          year_of_manufacture,
          vin,
          color,
          created_at
        )
      `)
      .eq('owner_company_id', companyId)
      .order('created_at', { ascending: false, foreignTable: 'vehicle' })

    if (fleetError) {
      console.error('❌ Fleet fetch error:', fleetError)
      return NextResponse.json({ error: fleetError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      fleet: fleet || [],
      count: fleet?.length || 0
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// Add vehicle to fleet
export async function POST(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    if (!body.licensePlate && !body.plateNumber) {
      return NextResponse.json({ error: 'Plate number, make, and model are required' }, { status: 400 })
    }
    if (!body.make || !body.model) {
      return NextResponse.json({ error: 'Plate number, make, and model are required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Check ownership first, then admin membership
    let companyId = null
    let isAdmin = false

    const { data: ownedCompany } = await supabase
      .from('company_profiles_secure')
      .select('id')
      .eq('owner_user_id', userProfile.id)
      .maybeSingle()

    if (ownedCompany) {
      companyId = ownedCompany.id
      isAdmin = true
    } else {
      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id, is_admin')
        .eq('user_id', userProfile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (companyUser) {
        companyId = companyUser.company_id
        isAdmin = companyUser.is_admin
      }
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Not associated with a company' }, { status: 403 })
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Only company admins can add vehicles' }, { status: 403 })
    }

    const plateNumber = body.plateNumber || body.licensePlate

    // Check if plate already exists (PII: search by blind index)
    const plateIdx = await piiHmacRaw(supabase, plateNumber)
    const { data: existingVehicle } = await supabase
      .from('vehicles_secure')
      .select('id')
      .eq('plate_number_idx', plateIdx)
      .maybeSingle()

    if (existingVehicle) {
      return NextResponse.json({ error: 'A vehicle with this plate number already exists' }, { status: 400 })
    }

    // BUG 1.2 FIX: correct column names
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .insert([{
        plate_number: plateNumber,            // was license_plate ❌
        make: body.make,
        model: body.model,
        year_of_manufacture: body.year        // was year ❌
          ? parseInt(body.year)
          : null,
        vin: body.vin || null,
        color: body.color || null
      }])
      .select()

    if (vehicleError) {
      console.error('❌ Vehicle creation error:', vehicleError)
      return NextResponse.json({ error: `Failed to create vehicle: ${vehicleError.message}` }, { status: 500 })
    }

    // RLS on vehicle_ownership requires owner_user_id to match auth user
    const { data: ownership, error: ownershipError } = await supabase
      .from('vehicle_ownership')
      .insert([{
        vehicle_id: vehicle[0].id,
        owner_company_id: companyId,
        owner_user_id: userProfile.id
      }])
      .select()

    if (ownershipError) {
      console.error('❌ Ownership creation error:', ownershipError)
      await supabase.from('vehicles').delete().eq('id', vehicle[0].id)
      return NextResponse.json({ error: `Failed to assign ownership: ${ownershipError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      vehicleId: vehicle[0].id,
      ownershipId: ownership[0].id,
      vehicle: vehicle[0],
      message: 'Vehicle added to company fleet successfully'
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}