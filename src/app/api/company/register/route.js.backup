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
        industry_type: body.companyInfo.industryType,
        company_size: body.companyInfo.companySize,
        bio: body.companyDetails.bio,
        website: body.companyDetails.website,
        phone: body.companyDetails.phone,
        address: body.companyDetails.address,
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
      // Don't fail the whole registration if this fails
    }

    // Assign company_owner role
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('code', 'company_owner')
      .single()

    if (!roleError && roleData) {
      const { error: userRoleError } = await supabase
        .from('user_roles')
        .insert([{
          user_id: userProfile.id,
          role_id: roleData.id
        }])

      if (userRoleError) {
        console.error('❌ User role error:', userRoleError)
      } else {
        console.log('✅ Company owner role assigned')
      }
    }

    // Upload documents if provided
    if (body.documents && body.documents.length > 0) {
      const docs = body.documents.map(doc => ({
        company_id: company[0].id,
        document_type: doc.type,
        document_url: doc.url,
        file_name: doc.fileName,
        file_size: doc.fileSize,
        uploaded_by: userProfile.id
      }))

      const { error: docsError } = await supabase
        .from('company_documents')
        .insert(docs)

      if (docsError) {
        console.error('❌ Documents error:', docsError)
      } else {
        console.log('✅ Documents uploaded:', docs.length)
      }
    }

    // Send confirmation email
    try {
      await sendCompanyRegistrationEmail({
        ownerEmail: user.email,
        ownerName: `${userProfile.first_name} ${userProfile.last_name}`,
        companyName: company[0].name,
        registrationNumber: company[0].registration_number,
        companyId: company[0].id
      })
      console.log('✅ Registration email sent')
    } catch (emailError) {
      console.error('❌ Email error:', emailError)
      // Don't fail registration if email fails
    }

    // Create notification for admins
    const { error: notifError } = await supabase
      .from('notifications')
      .insert([{
        user_id: null, // System notification for admins
        title: 'New Company Registration',
        message: `${company[0].name} has submitted registration for approval`,
        type: 'new_company_registration',
        reference_id: company[0].id,
        is_read: false
      }])

    if (notifError) {
      console.error('❌ Notification error:', notifError)
    }

    return NextResponse.json({
      success: true,
      companyId: company[0].id,
      status: 'pending_verification',
      message: 'Company registered successfully. Awaiting admin approval.'
    })

  } catch (error) {
    console.error('❌ Registration error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}