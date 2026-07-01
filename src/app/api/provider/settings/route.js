/**
 * POST /api/provider/settings
 * Saves provider business profile, bumps status to pending_verification,
 * sends in-app notifications (via RPC) and emails to admin + owner.
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import {
  sendDetailsChangedAdminEmail,
  sendDetailsPendingEmail,
}                                              from '@/lib/email/settingsEmails'
import { writeLimiter } from '@/lib/rateLimiters'

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
    const {
      providerId, name, email, phone, description, website,
      provider_type_id, currency_id,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. Save via RPC (bumps status + inserts notifications) ──────────────
    const { data: result, error: rpcErr } = await supabase.rpc(
      'owner_update_provider_details',
      {
        p_provider_id:      providerId,
        p_name:             name.trim(),
        p_email:            email            || null,
        p_phone:            phone            || null,
        p_description:      description      || null,
        p_website:          website          || null,
        p_provider_type_id: provider_type_id || null,
        p_currency_id:      currency_id      || null,
      }
    )
    if (rpcErr) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })

    // ── 2. Get owner details for emails ─────────────────────────────────────
    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('first_name, last_name, auth_user_id')
      .eq('auth_user_id', user.id)
      .single()

    const ownerName  = profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : 'Owner'
    const ownerEmail = user.email

    // ── 3. Detect changed fields for admin email summary ─────────────────────
    const changed = []
    if (name)             changed.push(`Business name: "${name}"`)
    if (email)            changed.push(`Email: ${email}`)
    if (phone)            changed.push(`Phone: ${phone}`)
    if (description)      changed.push('Description updated')
    if (website)          changed.push(`Website: ${website}`)
    if (provider_type_id) changed.push('Provider type updated')
    if (currency_id)      changed.push('Currency updated')

    // ── 4. Send admin email (non-fatal) ──────────────────────────────────────
    try {
      await sendDetailsChangedAdminEmail(supabase, {
        entityType:     'provider',
        entityName:     name.trim(),
        entityId:       providerId,
        ownerName,
        ownerEmail,
        changesSummary: changed,
      })
    } catch (e) {
      console.error('Admin email failed (non-fatal):', e.message)
    }

    // ── 5. Send owner confirmation email (non-fatal) ─────────────────────────
    if (ownerEmail) {
      try {
        await sendDetailsPendingEmail(supabase, {
          to:         ownerEmail,
          ownerName,
          entityName: name.trim(),
          entityType: 'provider',
        })
      } catch (e) {
        console.error('Owner email failed (non-fatal):', e.message)
      }
    }

    return NextResponse.json({
      success: true,
      status:  'pending_verification',
      message: 'Profile updated. Our team will review your changes within 1–2 business days.',
    })

  } catch (err) {
    console.error('POST /api/provider/settings error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}