import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendCompanyRegistrationEmail } from '@/lib/email/sendCompanyInviteEmail'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('❌ Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError) {
      console.error('❌ Profile error:', profileError)
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    console.log('✅ User profile found:', userProfile.id)

    // Check if user already owns a company
    const { data: existingCompany } = await supabase
      .from('company_profiles')
      .select('id, name')
      .eq('owner_user_id', userProfile.id)
      .single()

    if (existingCompany) {
      return NextResponse.json({ 
        error: 'User already owns a company',
        existingCompany: existingCompany.name
      }, { status: 400 })
    }

    // Create company profile
    const { data: company, error: companyError } = await supabase
      .from('company_profiles')
      .insert([{
        name: body.companyInfo.name,
        registration_number: body.companyInfo.registrationNumber,
        tax_id: body.companyInfo.taxId,
        industry: body.companyInfo.industry || body.companyInfo.industryType,  // ✅ FIXED: 'industry' not 'industry_type'
        company_size: body.companyInfo.companySize,
        bio: body.companyDetails.bio,
        website: body.companyDetails.website,
        phone: body.companyDetails.phone,
        physical_address: body.companyDetails.address || body.companyDetails.physicalAddress,  // ✅ FIXED: 'physical_address' not 'address'
        city: body.companyDetails.city,
        country: body.companyDetails.country || 'Kenya',
        years_in_operation: body.companyDetails.yearsInOperation,
        opening_time: body.companyDetails.openingTime,
        closing_time: body.companyDetails.closingTime,
        owner_user_id: userProfile.id,
        status: 'pending_verification',
        submitted_at: new Date().toISOString(),
        is_active: false
      }])
      .select()

    if (companyError) {
      console.error('❌ Company creation error:', companyError)
      return NextResponse.json({ 
        error: `Failed to create company: ${companyError.message}` 
      }, { status: 500 })
    }

    console.log('✅ Company created:', company[0].id)

    // Add owner as company user with admin rights
    const { error: companyUserError } = await supabase
      .from('company_users')
      .insert([{
        user_id: userProfile.id,
        company_id: company[0].id,
        staff_role: 'owner',
        is_admin: true,
        is_active: true,
        updated_by: userProfile.id
      }])

    if (companyUserError) {
      console.error('❌ Company user error:', companyUserError)
      // Don't fail - company is already created
    } else {
      console.log('✅ Owner added as company admin')
    }

    // Assign owner role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert([{
        user_id: userProfile.id,
        role_code: 'company_owner'
      }])

    if (roleError) {
      console.error('⚠️ Role assignment error:', roleError)
      // Don't fail - not critical
    }

    // Process document uploads
    if (body.documents && body.documents.length > 0) {
      // Update uploaded_files to link them to this company
      const documentIds = body.documents.map(doc => doc.id).filter(Boolean)
      
      if (documentIds.length > 0) {
        const { error: docsUpdateError } = await supabase
          .from('uploaded_files')
          .update({ 
            reference_type: 'company_document',
            reference_id: company[0].id
          })
          .in('id', documentIds)

        if (docsUpdateError) {
          console.error('⚠️ Documents update error:', docsUpdateError)
        } else {
          console.log('✅ Documents linked to company')
        }
      }
    }

    // Add team members if any
    if (body.teamMembers && body.teamMembers.length > 0) {
      for (const member of body.teamMembers) {
        try {
          // Create invitation
          const inviteToken = Math.random().toString(36).substring(2) + Date.now().toString(36)
          const expiresAt = new Date()
          expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

          const { error: inviteError } = await supabase
            .from('company_invitations')
            .insert([{
              company_id: company[0].id,
              invited_by: userProfile.id,
              email: member.email,  // ✅ FIXED: 'email' not 'invitee_email'
              first_name: member.firstName,
              last_name: member.lastName,
              phone: member.phone,
              staff_role: member.role,
              is_admin: member.isAdmin || false,
              invitation_token: inviteToken,  // ✅ FIXED: 'invitation_token' not 'token'
              expires_at: expiresAt.toISOString(),
              status: 'pending'
            }])

          if (inviteError) {
            console.error(`⚠️ Invitation error for ${member.email}:`, inviteError)
          }
        } catch (err) {
          console.error('Team member invitation error:', err)
        }
      }
    }

    // Add fleet vehicles if any
    if (body.fleet && body.fleet.length > 0) {
      for (const vehicle of body.fleet) {
        try {
          // Create vehicle
          const { data: newVehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .insert([{
              license_plate: vehicle.licensePlate,
              make: vehicle.make,
              model: vehicle.model,
              year: vehicle.year ? parseInt(vehicle.year) : null,
              color: vehicle.color,
              vin: vehicle.vin
            }])
            .select()
            .single()

          if (vehicleError) {
            console.error(`⚠️ Vehicle creation error for ${vehicle.licensePlate}:`, vehicleError)
            continue
          }

          // Link vehicle to company
          const { error: ownershipError } = await supabase
            .from('vehicle_ownership')
            .insert([{
              vehicle_id: newVehicle.id,
              owner_company_id: company[0].id,
              ownership_start: new Date().toISOString()
            }])

          if (ownershipError) {
            console.error(`⚠️ Ownership error for ${vehicle.licensePlate}:`, ownershipError)
          }
        } catch (err) {
          console.error('Fleet vehicle error:', err)
        }
      }
    }

    // Send confirmation email to owner
    try {
      await sendCompanyRegistrationEmail({
        ownerEmail: user.email,
        ownerName: `${userProfile.first_name} ${userProfile.last_name}`,
        companyName: company[0].name,
        companyId: company[0].id
      })
      console.log('✅ Registration email sent')
    } catch (emailError) {
      console.error('⚠️ Email error:', emailError)
      // Don't fail registration if email fails
    }

    // Create admin notification
    try {
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role_code', 'admin')

      if (admins && admins.length > 0) {
        const notifications = admins.map(admin => ({
          user_id: admin.user_id,
          title: 'New Company Registration',
          message: `${company[0].name} has registered and is pending verification`,
          type: 'company_registration',
          reference_id: company[0].id
        }))

        await supabase
          .from('notifications')
          .insert(notifications)
      }
    } catch (notifError) {
      console.error('⚠️ Notification error:', notifError)
    }

    return NextResponse.json({
      success: true,
      company: {
        id: company[0].id,
        name: company[0].name,
        status: company[0].status
      }
    })

  } catch (error) {
    console.error('❌ Registration error:', error)
    return NextResponse.json({ 
      error: `Registration failed: ${error.message}` 
    }, { status: 500 })
  }
}