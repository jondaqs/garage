import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendCompanyInviteEmail } from '@/lib/email/sendCompanyInviteEmail'
import { requireCanAddStaff } from '@/lib/guards/companyAccess'
import { writeLimiter } from '@/lib/rateLimiters'

export async function POST(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id, first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Resolve company + verify caller is owner or admin member
    // Old code: queried company_users only → missed owners whose
    // company_users row is inactive (pre-approval) or doesn't exist yet.
    let companyId = null

    // 1. Owner check — owners can always invite
    const { data: ownedCompany } = await supabase
      .from('company_profiles_secure')
      .select('id')
      .eq('owner_user_id', userProfile.id)
      .maybeSingle()

    if (ownedCompany) {
      companyId = ownedCompany.id
    } else {
      // 2. Admin member check
      const { data: companyUser } = await supabase
        .from('company_users')
        .select('company_id, is_admin')
        .eq('user_id', userProfile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (companyUser?.is_admin) {
        companyId = companyUser.company_id
      }
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Not authorized to invite members' }, { status: 403 })
    }

    // ◀ SUBSCRIPTION + STAFF LIMIT GUARD
    const staffDenied = await requireCanAddStaff(supabase, companyId)
    if (staffDenied) return staffDenied

    // Generate invitation token
    const inviteToken = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('company_invitations')
      .insert([{
        company_id:       companyId,
        invited_by:       userProfile.id,
        email:            body.email,
        first_name:       body.firstName,
        last_name:        body.lastName,
        phone:            body.phone,
        staff_role:       body.role,
        is_admin:         body.isAdmin || false,
        invitation_token: inviteToken,
        expires_at:       expiresAt.toISOString(),
        status:           'pending',
      }])
      .select()
      .single()

    if (inviteError) {
      return NextResponse.json({ 
        error: 'Failed to create invitation' 
      }, { status: 500 })
    }

    // Get company details for the email
    const { data: company } = await supabase
      .from('company_profiles_secure')
      .select('name')
      .eq('id', companyId)
      .single()

    // Send invitation email
    try {
      await sendCompanyInviteEmail({
        inviteeEmail:    body.email,
        inviteeName:     `${body.firstName || ''} ${body.lastName || ''}`.trim() || body.email,
        companyName:     company.name,
        inviterName:     `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || 'A team admin',
        staffRole:       body.role || body.staffRole || 'Member',
        invitationToken: inviteToken,
      })
    } catch (emailError) {
      console.error('Email error:', emailError)
    }

    return NextResponse.json({ success: true, invitation })

  } catch (error) {
    console.error('Invitation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}