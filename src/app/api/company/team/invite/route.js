import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendCompanyInviteEmail } from '@/lib/email/sendCompanyInviteEmail'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
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

    if (!userProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Verify user is company admin
    const { data: companyUser } = await supabase
      .from('company_users')
      .select('company_id, is_admin')
      .eq('user_id', userProfile.id)
      .eq('is_admin', true)
      .single()

    if (!companyUser) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Generate invitation token
    const inviteToken = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('company_invitations')
      .insert([{
        company_id: companyUser.company_id,
        invited_by: userProfile.id,
        email: body.email,  // ✅ FIXED: 'email' not 'invitee_email'
        first_name: body.firstName,
        last_name: body.lastName,
        phone: body.phone,
        staff_role: body.role,
        is_admin: body.isAdmin || false,
        invitation_token: inviteToken,  // ✅ FIXED: 'invitation_token' not 'token'
        expires_at: expiresAt.toISOString(),
        status: 'pending'
      }])
      .select()
      .single()

    if (inviteError) {
      return NextResponse.json({ 
        error: `Failed to create invitation: ${inviteError.message}` 
      }, { status: 500 })
    }

    // Get company details
    const { data: company } = await supabase
      .from('company_profiles')
      .select('name')
      .eq('id', companyUser.company_id)
      .single()

    // Send invitation email
    try {
      await sendCompanyInviteEmail({
        inviteeEmail: body.email,
        inviteeName: `${body.firstName} ${body.lastName}`,
        companyName: company.name,
        inviterName: `${userProfile.first_name} ${userProfile.last_name}`,
        role: body.role,
        inviteToken: inviteToken
      })
    } catch (emailError) {
      console.error('Email error:', emailError)
    }

    return NextResponse.json({ success: true, invitation })

  } catch (error) {
    console.error('Invitation error:', error)
    return NextResponse.json({ 
      error: `Failed to send invitation: ${error.message}` 
    }, { status: 500 })
  }
}