import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

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
      .select('id, email')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Look up invitation by invitation_token (NOT 'token' — that column doesn't exist)
    const { data: invitation, error: invitationError } = await supabase
      .from('company_invitations')
      .select('*, company:company_profiles(id, name)')
      .eq('invitation_token', body.token)
      .maybeSingle()

    if (invitationError || !invitation) {
      console.error('❌ Invitation not found:', invitationError)
      return NextResponse.json({
        error: 'Invalid or expired invitation'
      }, { status: 404 })
    }

    // Verify this invitation is addressed to the caller
    // Column is 'email', not 'invitee_email'
    const inviteeEmail = invitation.email
    const callerEmail  = user.email || userProfile.email

    if (inviteeEmail !== callerEmail) {
      return NextResponse.json({
        error: 'This invitation is not for you'
      }, { status: 403 })
    }

    // Must still be pending
    if (invitation.status !== 'pending') {
      return NextResponse.json({
        error: `Invitation already ${invitation.status}`
      }, { status: 400 })
    }

    // Must not be expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('company_invitations')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', invitation.id)

      return NextResponse.json({
        error: 'Invitation has expired'
      }, { status: 400 })
    }

    // ── Accept ────────────────────────────────────────────────────────────
    if (body.response === 'accept') {

      // Guard: don't insert a duplicate company_users row
      const { data: existing } = await supabase
        .from('company_users')
        .select('id')
        .eq('user_id', userProfile.id)
        .eq('company_id', invitation.company_id)
        .maybeSingle()

      if (!existing) {
        const { error: memberError } = await supabase
          .from('company_users')
          .insert([{
            user_id:    userProfile.id,
            company_id: invitation.company_id,
            staff_role: invitation.staff_role,
            is_admin:   invitation.is_admin,
            is_active:  true,
            updated_by: userProfile.id,
          }])

        if (memberError) {
          console.error('❌ Member creation error:', memberError)
          return NextResponse.json({
            error: `Failed to join company: ${memberError.message}`
          }, { status: 500 })
        }
      }

      // Assign company_member role in user_roles
      const { data: roleRow } = await supabase
        .from('user_roles_lookup')
        .select('id')
        .eq('code', 'company_member')
        .maybeSingle()

      if (roleRow) {
        await supabase
          .from('user_roles')
          .insert([{ user_id: userProfile.id, role_id: roleRow.id }])
          .onConflict('user_id, role_id')   // ignore if already assigned
          .ignore()
      }

      // Mark invitation accepted + link invitee_user_id
      await supabase
        .from('company_invitations')
        .update({
          status:          'accepted',
          accepted_at:     new Date().toISOString(),
          invitee_user_id: userProfile.id,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', invitation.id)

      console.log('✅ User accepted company invitation and joined company_users')

      return NextResponse.json({
        success:     true,
        message:     `You've successfully joined ${invitation.company?.name}`,
        companyId:   invitation.company_id,
        companyName: invitation.company?.name,
      })
    }

    // ── Reject ────────────────────────────────────────────────────────────
    await supabase
      .from('company_invitations')
      .update({
        status:      'rejected',
        rejected_at: new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .eq('id', invitation.id)

    console.log('✅ User rejected company invitation')

    return NextResponse.json({
      success: true,
      message: 'Invitation declined',
    })

  } catch (error) {
    console.error('❌ Respond invitation error:', error)
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}