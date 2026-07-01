// src/app/api/team/members/route.js
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { writeLimiter } from '@/lib/rateLimiters'

// GET team members
export async function GET(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    // Get service provider
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

    // Get team members
    const { data: members, error } = await supabase
      .from('mechanics')
      .select(`
        *,
        user:user_profiles_secure(
          id,
          auth_user_id,
          first_name,
          last_name,
          phone,
          is_active,
          is_suspended
        )
      `)
      .eq('service_provider_id', provider.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Members fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch team members' },
        { status: 500 }
      )
    }

    return NextResponse.json({ members: members || [] })

  } catch (error) {
    console.error('Get members error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update member permissions/status
export async function PATCH(request) {
  const limited2 = writeLimiter.check(request)
  if (limited2) return limited2

  try {
    const supabase = createClient()
    const body = await request.json()
    const { mechanic_id, updates } = body

    if (!mechanic_id) {
      return NextResponse.json(
        { error: 'Mechanic ID is required' },
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
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    // Verify ownership
    const { data: mechanic } = await supabase
      .from('mechanics')
      .select(`
        *,
        service_provider:service_providers_secure(owner_user_id)
      `)
      .eq('id', mechanic_id)
      .single()

    if (!mechanic || mechanic.service_provider.owner_user_id !== profile.id) {
      return NextResponse.json(
        { error: 'Not authorized to update this member' },
        { status: 403 }
      )
    }

    // Update mechanic
    const { data: updated, error: updateError } = await supabase
      .from('mechanics')
      .update(updates)
      .eq('id', mechanic_id)
      .select()
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update team member' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, member: updated })

  } catch (error) {
    console.error('Update member error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Remove team member
export async function DELETE(request) {
  const limited3 = writeLimiter.check(request)
  if (limited3) return limited3

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const mechanic_id = searchParams.get('mechanic_id')

    if (!mechanic_id) {
      return NextResponse.json(
        { error: 'Mechanic ID is required' },
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
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    // Verify ownership
    const { data: mechanic } = await supabase
      .from('mechanics')
      .select(`
        *,
        service_provider:service_providers_secure(owner_user_id)
      `)
      .eq('id', mechanic_id)
      .single()

    if (!mechanic || mechanic.service_provider.owner_user_id !== profile.id) {
      return NextResponse.json(
        { error: 'Not authorized to remove this member' },
        { status: 403 }
      )
    }

    // Delete mechanic
    const { error: deleteError } = await supabase
      .from('mechanics')
      .delete()
      .eq('id', mechanic_id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to remove team member' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete member error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}