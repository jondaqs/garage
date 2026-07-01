// src/app/api/team/search-users/route.js
// SECURITY FIX: Replaced auth.admin.listUsers() (requires service_role key,
// exposes all auth emails) with a search via user_profiles_secure view.
// The view decrypts email via pii_decrypt() for rows the caller can access.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { readLimiter } from '@/lib/rateLimiters'

export async function GET(request) {
  const limited = readLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
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

    // Search for users by email via the secure view.
    // user_profiles_secure decrypts email_enc via pii_decrypt().
    // The ilike filter works on the decrypted output.
    const { data: userProfiles, error: profileError } = await supabase
      .from('user_profiles_secure')
      .select('id, auth_user_id, first_name, last_name, email, is_active, is_suspended')
      .ilike('email', `%${email}%`)
      .limit(20)

    if (profileError) {
      console.error('Profile search error:', profileError)
      return NextResponse.json(
        { error: 'Failed to search users' },
        { status: 500 }
      )
    }

    // Build results
    const results = (userProfiles || [])
      .filter(p => p.id && p.email) // Only users with profiles and emails
      .map(p => ({
        email: p.email,
        user_id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        is_active: p.is_active || false,
        is_suspended: p.is_suspended || false,
        can_invite: p.is_active && !p.is_suspended
      }))

    // Check if any are already team members
    const userIds = results.map(r => r.user_id)

    const { data: existingMembers } = await supabase
      .from('mechanics')
      .select('user_id')
      .eq('service_provider_id', provider.id)
      .in('user_id', userIds)

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
