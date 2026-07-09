import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireCompanyWrite } from '@/lib/guards/companyAccess'
import { writeLimiter } from '@/lib/rateLimiters'

// Service role client — bypasses RLS for reading other users' profiles
// Used only server-side, never exposed to the browser
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Resolve company
    let companyId = null

    const { data: ownedCompany } = await supabase
      .from('company_profiles_secure')
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
      return NextResponse.json({ error: 'Not associated with a company' }, { status: 403 })
    }

    // Fetch company_users rows (no profile join — avoids RLS cross-user read issue)
    const { data: members, error: membersError } = await supabase
      .from('company_users')
      .select('id, user_id, staff_role, is_admin, is_active, created_at, updated_at, can_approve_work, can_manage_team, can_manage_fleet, can_approve_estimates, can_approve_checkout, can_approve_payment, can_chat')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })

    if (membersError) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Fetch profiles for all members using service role (bypasses RLS — server-side only)
    const userIds = (members || []).map(m => m.user_id).filter(Boolean)
    let profileMap = {}

    if (userIds.length > 0) {
      const serviceClient = getServiceClient()
      const { data: profiles } = await serviceClient
        .from('user_profiles_secure')
        .select('id, first_name, last_name, email, phone')
        .in('id', userIds)

      if (profiles) {
        profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
      }
    }

    // Attach profile to each member row
    const membersWithProfiles = (members || []).map(m => ({
      ...m,
      user: profileMap[m.user_id] || null,
    }))

    // Pending invitations
    const { data: invitations } = await supabase
      .from('company_invitations_secure')
      .select('id, email, first_name, last_name, staff_role, is_admin, status, created_at')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    return NextResponse.json({
      success: true,
      members: membersWithProfiles,
      pendingInvitations: invitations || [],
    })

  } catch (error) {
    console.error('❌ Team GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request) {
  const limited2 = writeLimiter.check(request)
  if (limited2) return limited2

  try {
    const supabase = await createClient()
    const body = await request.json()

    if (!body.memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    // Verify caller is owner or admin member
    let companyId = null

    const { data: ownedCompany } = await supabase
      .from('company_profiles_secure')
      .select('id')
      .eq('owner_user_id', userProfile.id)
      .maybeSingle()

    if (ownedCompany) {
      companyId = ownedCompany.id
    } else {
      const { data: adminCheck } = await supabase
        .from('company_users')
        .select('company_id, is_admin')
        .eq('user_id', userProfile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (adminCheck?.is_admin) companyId = adminCheck.company_id
    }

    if (!companyId) {
      return NextResponse.json({
        error: 'Only company owners or admins can update team members'
      }, { status: 403 })
    }

    // ◀ SUBSCRIPTION GUARD
    const denied = await requireCompanyWrite(supabase, companyId)
    if (denied) return denied

    const updateData = {}
    if (body.staffRole)                        updateData.staff_role = body.staffRole
    if (typeof body.isAdmin   === 'boolean')   updateData.is_admin   = body.isAdmin
    if (typeof body.isActive  === 'boolean')   updateData.is_active  = body.isActive
    updateData.updated_by = userProfile.id
    updateData.updated_at = new Date().toISOString()

    const { data: updated, error: updateError } = await supabase
      .from('company_users')
      .update(updateData)
      .eq('id', body.memberId)
      .eq('company_id', companyId)
      .select()

    if (updateError) {
      console.error('❌ Team PUT update error:', updateError.message, updateError.details, updateError.hint, updateError.code)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ success: true, member: updated?.[0] || null })

  } catch (error) {
    console.error('❌ Team PUT error:', error?.message || error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}