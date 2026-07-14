/**
 * POST /api/admin/providers/[id]/reject-notify
 * ──────────────────────────────────────────────
 * Sends rejection email + SMS to the provider owner.
 * Called by the admin UI after a provider is rejected.
 * Best-effort: failures don't block the rejection flow.
 *
 * Body: { rejectionReason: string }
 * Auth: caller must be an admin.
 */

import { createClient }                       from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendProviderRejectionEmail }          from '@/lib/email/providerEmails'
import { sendProviderRejectionSms }            from '@/lib/sms/providerSms'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request, context) {
  try {
    const { id: providerId } = await context.params
    const body = await request.json()
    const rejectionReason = body.rejectionReason || 'No reason provided'

    // ── Auth: verify caller is admin ─────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sc = getServiceClient()

    const { data: adminProfile } = await sc
      .from('user_profiles')
      .select('id, is_admin')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // ── Load provider + owner ────────────────────────────────────────
    const { data: provider } = await sc
      .from('service_providers_secure')
      .select('id, name, owner_user_id')
      .eq('id', providerId)
      .maybeSingle()

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const { data: owner } = await sc
      .from('user_profiles_secure')
      .select('id, first_name, last_name, email, phone')
      .eq('id', provider.owner_user_id)
      .maybeSingle()

    if (!owner) {
      return NextResponse.json({ success: true, skipped: true, reason: 'owner_not_found' })
    }

    const ownerName = [owner.first_name, owner.last_name].filter(Boolean).join(' ') || 'Provider Owner'
    const results = { email: null, sms: null }

    // ── Email ────────────────────────────────────────────────────────
    if (owner.email) {
      try {
        await sendProviderRejectionEmail(sc, {
          to:              owner.email,
          ownerName,
          providerName:    provider.name,
          rejectionReason,
        })
        results.email = 'sent'
      } catch (e) {
        console.error(`[reject-notify ${providerId}] email failed:`, e.message)
        results.email = `failed: ${e.message}`
      }
    } else {
      results.email = 'skipped (no email)'
    }

    // ── SMS ──────────────────────────────────────────────────────────
    if (owner.phone) {
      try {
        await sendProviderRejectionSms(sc, {
          phone:        owner.phone,
          ownerName,
          providerName: provider.name,
        })
        results.sms = 'sent'
      } catch (e) {
        console.error(`[reject-notify ${providerId}] sms failed:`, e.message)
        results.sms = `failed: ${e.message}`
      }
    } else {
      results.sms = 'skipped (no phone)'
    }

    return NextResponse.json({ success: true, results })

  } catch (err) {
    console.error('[reject-notify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}