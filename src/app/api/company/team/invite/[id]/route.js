/**
 * DELETE /api/company/team/invite/[id]
 * Cancel a pending company invitation.
 * Only the company owner or an admin member can cancel.
 * Uses service role to bypass the invitee-only UPDATE RLS policy.
 */

import { createClient }                                from '@/lib/supabase/server'
import { createClient as createServiceClient }         from '@supabase/supabase-js'
import { NextResponse }                                from 'next/server'
import { writeLimiter } from '@/lib/rateLimiters'
import { requireUUID } from '@/lib/validation'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function DELETE(request, { params }) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase         = await createClient()
    const { id: inviteId } = await params
    if (!requireUUID(inviteId)) return NextResponse.json({ error: 'Invalid invitation ID' }, { status: 400 })

    // ── Auth ──────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // ── Resolve company + verify caller is owner or admin ─────────────────
    let companyId = null

    const { data: owned } = await supabase
      .from('company_profiles_secure')
      .select('id')
      .eq('owner_user_id', profile.id)
      .maybeSingle()

    if (owned) {
      companyId = owned.id
    } else {
      const { data: mem } = await supabase
        .from('company_users')
        .select('company_id, is_admin')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle()

      if (mem?.is_admin) companyId = mem.company_id
    }

    if (!companyId) {
      return NextResponse.json(
        { error: 'Only company owners and admins can cancel invitations' },
        { status: 403 }
      )
    }

    // ── Verify the invitation belongs to this company and is still pending ─
    const serviceClient = getServiceClient()

    const { data: invitation, error: fetchErr } = await serviceClient
      .from('company_invitations_secure')
      .select('id, email, status, company_id')
      .eq('id', inviteId)
      .single()

    if (fetchErr || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    if (invitation.company_id !== companyId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: `Invitation is already ${invitation.status} and cannot be cancelled` },
        { status: 400 }
      )
    }

    // ── Cancel ────────────────────────────────────────────────────────────
    const { error: updateErr } = await serviceClient
      .from('company_invitations')
      .update({
        status:     'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', inviteId)

    if (updateErr) {
      console.error('Cancel invitation error:', updateErr)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      email:   invitation.email,
      message: `Invitation to ${invitation.email} has been cancelled`,
    })

  } catch (err) {
    console.error('DELETE /api/company/team/invite/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}