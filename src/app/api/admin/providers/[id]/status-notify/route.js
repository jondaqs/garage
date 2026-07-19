/**
 * POST /api/admin/providers/[id]/status-notify
 * ──────────────────────────────────────────────
 * Sends email + SMS to the provider owner for:
 *   - approval   (action: 'approve')
 *   - info-request (action: 'request_info')
 *
 * Body: { action: 'approve' | 'request_info', infoRequested?: string, isReverification?: boolean }
 * Auth: caller must be an admin.
 * Best-effort: failures don't block the admin flow.
 */

import { createClient }                       from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendProviderApprovalEmail, sendProviderInfoRequestEmail } from '@/lib/email/providerEmails'
import { sendProviderApprovalSms, sendProviderInfoRequestSms }     from '@/lib/sms/providerSms'

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
    const { action, infoRequested, isReverification } = body

    if (!['approve', 'request_info'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

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

    // ── Approval notifications ───────────────────────────────────────
    if (action === 'approve') {
      if (owner.email) {
        try {
          await sendProviderApprovalEmail(sc, {
            to:           owner.email,
            ownerName,
            providerName: provider.name,
            isReverification: !!isReverification,
          })
          results.email = 'sent'
        } catch (e) {
          console.error(`[status-notify ${providerId}] approval email failed:`, e.message)
          results.email = `failed: ${e.message}`
        }
      } else {
        results.email = 'skipped (no email)'
      }

      if (owner.phone) {
        try {
          await sendProviderApprovalSms(sc, {
            phone:        owner.phone,
            ownerName,
            providerName: provider.name,
            isReverification: !!isReverification,
          })
          results.sms = 'sent'
        } catch (e) {
          console.error(`[status-notify ${providerId}] approval sms failed:`, e.message)
          results.sms = `failed: ${e.message}`
        }
      } else {
        results.sms = 'skipped (no phone)'
      }
    }

    // ── Info-request notifications ────────────────────────────────────
    if (action === 'request_info') {
      if (owner.email) {
        try {
          await sendProviderInfoRequestEmail(sc, {
            to:            owner.email,
            ownerName,
            providerName:  provider.name,
            infoRequested: infoRequested || 'Please check your notifications for details.',
          })
          results.email = 'sent'
        } catch (e) {
          console.error(`[status-notify ${providerId}] info-request email failed:`, e.message)
          results.email = `failed: ${e.message}`
        }
      } else {
        results.email = 'skipped (no email)'
      }

      if (owner.phone) {
        try {
          await sendProviderInfoRequestSms(sc, {
            phone:        owner.phone,
            ownerName,
            providerName: provider.name,
          })
          results.sms = 'sent'
        } catch (e) {
          console.error(`[status-notify ${providerId}] info-request sms failed:`, e.message)
          results.sms = `failed: ${e.message}`
        }
      } else {
        results.sms = 'skipped (no phone)'
      }
    }

    return NextResponse.json({ success: true, results })

  } catch (err) {
    console.error('[status-notify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}