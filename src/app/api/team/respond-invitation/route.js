// src/app/api/team/respond-invitation/route.js
import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { writeLimiter } from '@/lib/rateLimiters'
import { isOneOf, requireUUID, sanitizeText } from '@/lib/validation'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const body     = await request.json()
    const { invitation_id, action, rejection_reason: rawRejection } = body
    if (!requireUUID(invitation_id)) return NextResponse.json({ error: 'Invalid invitation ID' }, { status: 400 })
    if (!isOneOf(action, ['accept', 'reject'])) return NextResponse.json({ error: 'Action must be accept or reject' }, { status: 400 })
    const rejection_reason = sanitizeText(rawRejection, 500)

    if (!invitation_id || !action) {
      return NextResponse.json({ error: 'invitation_id and action are required' }, { status: 400 })
    }
    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "accept" or "reject"' }, { status: 400 })
    }

    // Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('id, first_name, last_name, is_active, is_suspended')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if (!profile.is_active || profile.is_suspended) {
      return NextResponse.json({ error: 'Your account is not active or is suspended' }, { status: 403 })
    }

    // Load invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations_secure')
      .select('*')
      .eq('id', invitation_id)
      .single()

    if (inviteError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    // Verify it's for this user
    if (invitation.invited_user_id !== profile.id &&
        invitation.invited_email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'This invitation is not for you' }, { status: 403 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: `Invitation is already ${invitation.status}` }, { status: 400 })
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabase.from('team_invitations').update({ status: 'expired' }).eq('id', invitation_id)
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    if (action === 'accept') {
      // Use service client to call SECURITY DEFINER function
      // (RLS on service_provider_users blocks direct insert from user client)
      const sc = getServiceClient()

      const { data: result, error: rpcErr } = await sc.rpc('accept_provider_invitation', {
        p_invitation_id: invitation_id,
        p_user_id:       profile.id,
      })

      if (rpcErr) {
        console.error('accept_provider_invitation RPC error:', rpcErr)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      return NextResponse.json({
        success:     true,
        action:      'accepted',
        role:        result.role,
        is_mechanic: result.is_mechanic,
        spu_id:      result.spu_id,
        mechanic_id: result.mechanic_id,
      })

    } else {
      // Reject
      await supabase.from('team_invitations').update({
        status:           'rejected',
        responded_at:     new Date().toISOString(),
        rejected_at:      new Date().toISOString(),
        rejection_reason,
      }).eq('id', invitation_id)

      return NextResponse.json({ success: true, action: 'rejected' })
    }

  } catch (error) {
    console.error('Respond invitation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}