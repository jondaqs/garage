import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    // Validate required fields
    if (!body.token || !body.response) {
      return NextResponse.json({ 
        error: 'Token and response are required' 
      }, { status: 400 })
    }

    if (!['accept', 'reject'].includes(body.response)) {
      return NextResponse.json({ 
        error: 'Response must be "accept" or "reject"' 
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
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get invitation by token
    const { data: invitation, error: invitationError } = await supabase
      .from('company_invitations')
      .select('*, company:company_profiles(*)')
      .eq('token', body.token)
      .single()

    if (invitationError || !invitation) {
      console.error('❌ Invitation not found:', invitationError)
      return NextResponse.json({ 
        error: 'Invalid or expired invitation' 
      }, { status: 404 })
    }

    // Verify invitation belongs to this user
    if (invitation.invitee_email !== user.email && invitation.invitee_email !== userProfile.email) {
      return NextResponse.json({ 
        error: 'This invitation is not for you' 
      }, { status: 403 })
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return NextResponse.json({ 
        error: `Invitation already ${invitation.status}` 
      }, { status: 400 })
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('company_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)

      return NextResponse.json({ 
        error: 'Invitation has expired' 
      }, { status: 400 })
    }

    if (body.response === 'accept') {
      // Add user to company_users
      const { error: memberError } = await supabase
        .from('company_users')
        .insert([{
          user_id: userProfile.id,
          company_id: invitation.company_id,
          staff_role: invitation.staff_role,
          is_admin: invitation.is_admin,
          is_active: true,
          updated_by: userProfile.id
        }])

      if (memberError) {
        console.error('❌ Member creation error:', memberError)
        return NextResponse.json({ 
          error: `Failed to join company: ${memberError.message}` 
        }, { status: 500 })
      }

      // Update invitation status
      await supabase
        .from('company_invitations')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          invitee_user_id: userProfile.id
        })
        .eq('id', invitation.id)

      console.log('✅ User accepted invitation and joined company')

      return NextResponse.json({
        success: true,
        message: `You've successfully joined ${invitation.company.name}`,
        companyId: invitation.company_id,
        companyName: invitation.company.name
      })

    } else {
      // Reject invitation
      await supabase
        .from('company_invitations')
        .update({ 
          status: 'rejected',
          rejected_at: new Date().toISOString()
        })
        .eq('id', invitation.id)

      console.log('✅ User rejected invitation')

      return NextResponse.json({
        success: true,
        message: 'Invitation declined'
      })
    }

  } catch (error) {
    console.error('❌ Response error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}