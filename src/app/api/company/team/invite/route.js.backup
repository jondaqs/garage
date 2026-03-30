import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendCompanyInviteEmail } from '@/lib/email/sendCompanyInviteEmail'
import { randomBytes } from 'crypto'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    // Validate required fields
    if (!body.email || !body.staffRole) {
      return NextResponse.json({ 
        error: 'Email and staff role are required' 
      }, { status: 400 })
    }

    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
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

    // Get company where user is admin
    const { data: companyUser, error: companyUserError } = await supabase
      .from('company_users')
      .select('*, company:company_profiles(*)')
      .eq('user_id', userProfile.id)
      .eq('is_admin', true)
      .single()

    if (companyUserError || !companyUser) {
      console.error('❌ Not authorized:', companyUserError)
      return NextResponse.json({ 
        error: 'Only company admins can invite team members' 
      }, { status: 403 })
    }

    console.log('✅ Company admin verified:', companyUser.company.name)

    // Check if email is already a team member
    const { data: existingMember } = await supabase
      .from('company_users')
      .select('id, user:user_profiles(email, first_name, last_name)')
      .eq('company_id', companyUser.company_id)
      .limit(1)

    if (existingMember && existingMember.length > 0) {
      const memberEmails = existingMember.map(m => m.user?.email).filter(Boolean)
      if (memberEmails.includes(body.email)) {
        return NextResponse.json({ 
          error: 'User is already a team member' 
        }, { status: 400 })
      }
    }

    // Check if invitation already exists
    const { data: existingInvitation } = await supabase
      .from('company_invitations')
      .select('id, status')
      .eq('company_id', companyUser.company_id)
      .eq('invitee_email', body.email)
      .eq('status', 'pending')
      .single()

    if (existingInvitation) {
      return NextResponse.json({ 
        error: 'An invitation is already pending for this email' 
      }, { status: 400 })
    }

    // Check if user already exists in the system
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name')
      .eq('email', body.email)
      .single()

    console.log(existingUser ? '✅ Existing user found' : '⚠️ New user will be created')

    // Generate invitation token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('company_invitations')
      .insert([{
        company_id: companyUser.company_id,
        invited_by: userProfile.id,
        invitee_email: body.email,
        invitee_user_id: existingUser?.id || null,
        staff_role: body.staffRole,
        is_admin: body.isAdmin || false,
        permissions: body.permissions || {},
        token: token,
        status: 'pending',
        expires_at: expiresAt.toISOString()
      }])
      .select()

    if (inviteError) {
      console.error('❌ Invitation creation error:', inviteError)
      return NextResponse.json({ 
        error: `Failed to create invitation: ${inviteError.message}` 
      }, { status: 500 })
    }

    console.log('✅ Invitation created:', invitation[0].id)

    // Send invitation email
    try {
      await sendCompanyInviteEmail({
        inviteeEmail: body.email,
        inviteeName: body.firstName && body.lastName ? 
          `${body.firstName} ${body.lastName}` : 
          (existingUser ? `${existingUser.first_name} ${existingUser.last_name}` : null),
        companyName: companyUser.company.name,
        inviterName: `${userProfile.first_name} ${userProfile.last_name}`,
        staffRole: body.staffRole,
        invitationToken: token,
        permissions: body.permissions || {}
      })
      console.log('✅ Invitation email sent to:', body.email)
    } catch (emailError) {
      console.error('❌ Email sending error:', emailError)
      // Don't fail the invitation if email fails
    }

    // Create notification if user exists
    if (existingUser) {
      const { error: notifError } = await supabase
        .from('notifications')
        .insert([{
          user_id: existingUser.id,
          title: 'Company Team Invitation',
          message: `You've been invited to join ${companyUser.company.name} as ${body.staffRole}`,
          type: 'company_invitation',
          reference_id: invitation[0].id,
          is_read: false
        }])

      if (notifError) {
        console.error('❌ Notification error:', notifError)
      }
    }

    return NextResponse.json({
      success: true,
      invitationId: invitation[0].id,
      inviteeExists: !!existingUser,
      expiresAt: expiresAt.toISOString(),
      message: 'Invitation sent successfully'
    })

  } catch (error) {
    console.error('❌ Invite error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}