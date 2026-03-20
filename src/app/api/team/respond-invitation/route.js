// src/app/api/team/respond-invitation/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    const body = await request.json()
    const { invitation_id, action, rejection_reason } = body

    if (!invitation_id || !action) {
      return NextResponse.json(
        { error: 'Invitation ID and action are required' },
        { status: 400 }
      )
    }

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be either "accept" or "reject"' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, first_name, last_name, is_active, is_suspended')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check if user is active and not suspended
    if (!profile.is_active || profile.is_suspended) {
      return NextResponse.json(
        { error: 'Your account is not active or is suspended' },
        { status: 403 }
      )
    }

    // Get invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('id', invitation_id)
      .single()

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    // Verify invitation is for this user
    if (invitation.invited_user_id !== profile.id && 
        invitation.invited_email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invitation is not for you' },
        { status: 403 }
      )
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: `Invitation is already ${invitation.status}` },
        { status: 400 }
      )
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation_id)

      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 400 }
      )
    }

    if (action === 'accept') {
      // Check if user is already a team member
      const { data: existingMember } = await supabase
        .from('mechanics')
        .select('id')
        .eq('user_id', profile.id)
        .eq('service_provider_id', invitation.service_provider_id)
        .maybeSingle()

      if (existingMember) {
        return NextResponse.json(
          { error: 'You are already a team member' },
          { status: 400 }
        )
      }

      // Create mechanic record
      const { data: mechanic, error: mechanicError } = await supabase
        .from('mechanics')
        .insert({
          user_id: profile.id,
          service_provider_id: invitation.service_provider_id,
          specialization: invitation.specialization,
          experience_years: invitation.experience_years,
          role: invitation.role,
          invited_via_invitation_id: invitation_id,
          is_active: true,
          is_verified: false
        })
        .select()
        .single()

      if (mechanicError) {
        console.error('Mechanic creation error:', mechanicError)
        return NextResponse.json(
          { error: 'Failed to create team member record' },
          { status: 500 }
        )
      }

      // Update invitation
      await supabase
        .from('team_invitations')
        .update({
          status: 'accepted',
          invited_user_id: profile.id,
          responded_at: new Date().toISOString(),
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation_id)

      return NextResponse.json({
        success: true,
        action: 'accepted',
        mechanic_id: mechanic.id
      })

    } else if (action === 'reject') {
      // Update invitation
      await supabase
        .from('team_invitations')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString(),
          rejected_at: new Date().toISOString(),
          rejection_reason
        })
        .eq('id', invitation_id)

      return NextResponse.json({
        success: true,
        action: 'rejected'
      })
    }

  } catch (error) {
    console.error('Respond invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}