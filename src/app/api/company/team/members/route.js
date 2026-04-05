import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

    // Resolve company — check ownership first, then membership
    let companyId = null

    const { data: ownedCompany } = await supabase
      .from('company_profiles')
      .select('id')
      .eq('owner_user_id', userProfile.id)
      .maybeSingle()

    if (ownedCompany) {
      companyId = ownedCompany.id
    } else {
      const { data: companyMember } = await supabase
        .from('company_users')
        .select('company_id')
        .eq('user_id', userProfile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (companyMember) companyId = companyMember.company_id
    }

    if (!companyId) {
      return NextResponse.json({
        error: 'Not associated with a company'
      }, { status: 403 })
    }

    // Get all company members
    // FK hint required: company_users has two FKs to user_profiles (user_id and updated_by)
    const { data: members, error: membersError } = await supabase
      .from('company_users')
      .select(`
        *,
        user:user_profiles!company_users_user_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone,
          created_at
        )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (membersError) {
      console.error('❌ Members fetch error:', membersError)
      return NextResponse.json({ 
        error: membersError.message 
      }, { status: 500 })
    }

    // Get pending invitations
    const { data: invitations } = await supabase
      .from('company_invitations')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    return NextResponse.json({
      success: true,
      members: members || [],
      pendingInvitations: invitations || []
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

// Update team member
export async function PUT(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    if (!body.memberId) {
      return NextResponse.json({ 
        error: 'Member ID is required' 
      }, { status: 400 })
    }

    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    // Verify user is admin
    const { data: adminCheck } = await supabase
      .from('company_users')
      .select('company_id, is_admin')
      .eq('user_id', userProfile.id)
      .single()

    if (!adminCheck || !adminCheck.is_admin) {
      return NextResponse.json({ 
        error: 'Only admins can update team members' 
      }, { status: 403 })
    }

    // Update member
    const updateData = {}
    if (body.staffRole) updateData.staff_role = body.staffRole
    if (typeof body.isAdmin === 'boolean') updateData.is_admin = body.isAdmin
    if (typeof body.isActive === 'boolean') updateData.is_active = body.isActive
    updateData.updated_by = userProfile.id
    updateData.updated_at = new Date().toISOString()

    const { data: updated, error: updateError } = await supabase
      .from('company_users')
      .update(updateData)
      .eq('id', body.memberId)
      .eq('company_id', adminCheck.company_id)
      .select()

    if (updateError) {
      console.error('❌ Update error:', updateError)
      return NextResponse.json({ 
        error: updateError.message 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      member: updated[0],
      message: 'Team member updated successfully'
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}