// src/app/api/team/search-users/route.js
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email || email.length < 3) {
      return NextResponse.json(
        { error: 'Email query must be at least 3 characters' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user owns a service provider
    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    const { data: provider } = await supabase
      .from('service_providers_secure')
      .select('id')
      .eq('owner_user_id', profile.id)
      .single()

    if (!provider) {
      return NextResponse.json(
        { error: 'Not a service provider' },
        { status: 403 }
      )
    }

    // Search for users by email (must be exact match for security)
    const { data: authUsers, error: searchError } = await supabase.auth.admin.listUsers()
    
    if (searchError) {
      console.error('Search error:', searchError)
      return NextResponse.json(
        { error: 'Failed to search users' },
        { status: 500 }
      )
    }

    // Filter users by email match
    const matchedAuthUsers = authUsers.users.filter(u => 
      u.email && u.email.toLowerCase().includes(email.toLowerCase())
    )

    // Get user profiles for matched users
    const { data: userProfiles, error: profileError } = await supabase
      .from('user_profiles_secure')
      .select('id, auth_user_id, first_name, last_name, is_active, is_suspended')
      .in('auth_user_id', matchedAuthUsers.map(u => u.id))

    if (profileError) {
      console.error('Profile error:', profileError)
      return NextResponse.json(
        { error: 'Failed to fetch user profiles' },
        { status: 500 }
      )
    }

    // Combine auth users with profiles
    const results = matchedAuthUsers.map(authUser => {
      const profile = userProfiles.find(p => p.auth_user_id === authUser.id)
      return {
        email: authUser.email,
        user_id: profile?.id,
        first_name: profile?.first_name || '',
        last_name: profile?.last_name || '',
        is_active: profile?.is_active || false,
        is_suspended: profile?.is_suspended || false,
        can_invite: profile?.is_active && !profile?.is_suspended
      }
    }).filter(u => u.user_id) // Only return users with profiles

    // Check if any are already team members
    const { data: existingMembers } = await supabase
      .from('mechanics')
      .select('user_id')
      .eq('service_provider_id', provider.id)
      .in('user_id', results.map(r => r.user_id))

    const existingMemberIds = new Set(existingMembers?.map(m => m.user_id) || [])

    // Check for pending invitations
    const { data: pendingInvites } = await supabase
      .from('team_invitations_secure')
      .select('invited_user_id, invited_email')
      .eq('service_provider_id', provider.id)
      .eq('status', 'pending')

    const pendingUserIds = new Set(pendingInvites?.map(i => i.invited_user_id).filter(Boolean) || [])
    const pendingEmails = new Set(pendingInvites?.map(i => i.invited_email) || [])

    // Add status to results
    const finalResults = results.map(r => ({
      ...r,
      is_team_member: existingMemberIds.has(r.user_id),
      has_pending_invite: pendingUserIds.has(r.user_id) || pendingEmails.has(r.email)
    }))

    return NextResponse.json({ users: finalResults })

  } catch (error) {
    console.error('Search users error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}