import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// SECURITY FIX: Replaced direct company_users INSERT (which relied on the
// dangerous insert_own_record policy) with accept_company_invitation RPC.
// The RPC validates invitation status, expiry, and email match in a
// SECURITY DEFINER function before creating the membership.

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

    // ── Accept ────────────────────────────────────────────────────────────
    if (body.response === 'accept') {
      // Single RPC call handles everything:
      // 1. Validates invitation (pending, not expired, addressed to caller)
      // 2. Inserts company_users row (trigger sets default permissions)
      // 3. Assigns company_member role
      // 4. Marks invitation as accepted
      const { data: result, error: rpcError } = await supabase.rpc('accept_company_invitation', {
        p_invitation_token: body.token
      })

      if (rpcError) {
        console.error('❌ accept_company_invitation RPC error:', rpcError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      if (!result?.success) {
        return NextResponse.json({
          error: result?.error || 'Failed to accept invitation'
        }, { status: 400 })
      }

      // Fetch company name for the response
      const { data: company } = await supabase
        .from('company_profiles_secure')
        .select('name')
        .eq('id', result.company_id)
        .maybeSingle()

      console.log('✅ User accepted company invitation via RPC')

      return NextResponse.json({
        success:     true,
        message:     `You've successfully joined ${company?.name || 'the company'}`,
        companyId:   result.company_id,
        companyName: company?.name,
        alreadyMember: result.already_member || false,
      })
    }

    // ── Reject ────────────────────────────────────────────────────────────
    // For rejection, we still need to look up the invitation to update it.
    // This is simpler — no membership creation needed.
    const { data: userProfile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Look up invitation by token
    const { data: invitation, error: invitationError } = await supabase
      .from('company_invitations_secure')
      .select('id, status, company:company_profiles_secure(id, name)')
      .eq('invitation_token', body.token)
      .maybeSingle()

    if (invitationError || !invitation) {
      return NextResponse.json({
        error: 'Invalid or expired invitation'
      }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({
        error: `Invitation already ${invitation.status}`
      }, { status: 400 })
    }

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
