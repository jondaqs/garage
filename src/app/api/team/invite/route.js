// src/app/api/team/invite/route.js
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { email, role, specialization, experience_years } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
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
      .select('id, first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()

    // Verify user owns a service provider
    const { data: provider } = await supabase
      .from('service_providers')
      .select('id, name')
      .eq('owner_user_id', profile.id)
      .single()

    if (!provider) {
      return NextResponse.json(
        { error: 'Not a service provider' },
        { status: 403 }
      )
    }

    // Check if user exists and get their profile
    const { data: authUsers } = await supabase.auth.admin.listUsers()
    const invitedAuthUser = authUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    let invited_user_id = null
    
    if (invitedAuthUser) {
      // Get user profile
      const { data: invitedProfile } = await supabase
        .from('user_profiles')
        .select('id, is_active, is_suspended')
        .eq('auth_user_id', invitedAuthUser.id)
        .single()

      if (invitedProfile) {
        // Check if user is active and not suspended
        if (!invitedProfile.is_active || invitedProfile.is_suspended) {
          return NextResponse.json(
            { error: 'User account is not active or is suspended' },
            { status: 400 }
          )
        }

        invited_user_id = invitedProfile.id

        // Check if already a team member
        const { data: existingMember } = await supabase
          .from('mechanics')
          .select('id')
          .eq('user_id', invited_user_id)
          .eq('service_provider_id', provider.id)
          .maybeSingle()

        if (existingMember) {
          return NextResponse.json(
            { error: 'User is already a team member' },
            { status: 400 }
          )
        }

        // Check for pending invitation
        const { data: pendingInvite } = await supabase
          .from('team_invitations')
          .select('id')
          .eq('service_provider_id', provider.id)
          .eq('invited_user_id', invited_user_id)
          .eq('status', 'pending')
          .maybeSingle()

        if (pendingInvite) {
          return NextResponse.json(
            { error: 'User already has a pending invitation' },
            { status: 400 }
          )
        }
      }
    }

    // Generate invitation token
    const invitation_token = crypto.randomBytes(32).toString('base64url')

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        service_provider_id: provider.id,
        invited_email: email.toLowerCase(),
        invited_user_id,
        invited_by_user_id: profile.id,
        role: role || 'mechanic',
        specialization,
        experience_years,
        invitation_token,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single()

    if (inviteError) {
      console.error('Invitation error:', inviteError)
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      )
    }

    // If user exists, create notification
    if (invited_user_id) {
      await supabase
        .from('notifications')
        .insert({
          user_id: invited_user_id,
          type: 'team_invitation',
          title: 'Team Invitation',
          message: `${provider.name} has invited you to join their team as a ${role || 'mechanic'}`,
          reference_id: invitation.id,
          reference_type: 'team_invitation'
        })
    }

    // TODO: Send email notification
    // This would typically integrate with an email service
    // For now, we'll just return success

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.invited_email,
        status: invitation.status,
        expires_at: invitation.expires_at
      }
    })

  } catch (error) {
    console.error('Invite error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}