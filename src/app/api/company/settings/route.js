/**
 * POST /api/company/settings
 * Saves company profile, bumps status to pending_verification,
 * sends in-app notifications (via RPC) and emails to admin + owner.
 */

import { createClient }          from '@/lib/supabase/server'
import { NextResponse }          from 'next/server'
import {
  sendDetailsChangedAdminEmail,
  sendDetailsPendingEmail,
}  from '@/lib/email/settingsEmails' 

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body     = await request.json()

    const {
      companyId, name, bio, website, phone,
      industry, company_size, registration_number, tax_id,
      physical_address, city, country,
      years_in_operation, opening_time, closing_time, working_days,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. Save via RPC ───────────────────────────────────────────────────────
    const { data: result, error: rpcErr } = await supabase.rpc(
      'owner_update_company_details',
      {
        p_company_id:          companyId,
        p_name:                name.trim(),
        p_registration_number: registration_number || null,
        p_tax_id:              tax_id              || null,
        p_industry:            industry            || null,
        p_company_size:        company_size        || null,
        p_bio:                 bio                 || null,
        p_website:             website             || null,
        p_phone:               phone               || null,
        p_physical_address:    physical_address    || null,
        p_city:                city                || null,
        p_country:             country             || 'Kenya',
        p_years_in_operation:  years_in_operation
          ? parseInt(years_in_operation) : null,
        p_opening_time:        opening_time        || null,
        p_closing_time:        closing_time        || null,
        p_working_days:        working_days        || [],
        p_status:              'pending_verification',
      }
    )
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    if (!result?.success) return NextResponse.json({ error: result?.error }, { status: 400 })

    // ── 2. Get owner details ──────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select('first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()

    const ownerName  = profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : 'Owner'
    const ownerEmail = user.email

    // ── 3. Build changes summary ──────────────────────────────────────────────
    const changed = []
    if (name)                changed.push(`Company name: "${name}"`)
    if (phone)               changed.push(`Phone: ${phone}`)
    if (website)             changed.push(`Website: ${website}`)
    if (industry)            changed.push(`Industry: ${industry}`)
    if (company_size)        changed.push(`Company size: ${company_size}`)
    if (registration_number) changed.push(`Registration No: ${registration_number}`)
    if (tax_id)              changed.push(`Tax ID: ${tax_id}`)
    if (city)                changed.push(`City: ${city}`)

    // ── 4. Admin email (non-fatal) ────────────────────────────────────────────
    try {
      await sendDetailsChangedAdminEmail(supabase, {
        entityType:     'company',
        entityName:     name.trim(),
        entityId:       companyId,
        ownerName,
        ownerEmail,
        changesSummary: changed,
      })
    } catch (e) {
      console.error('Admin email failed (non-fatal):', e.message)
    }

    // ── 5. Owner confirmation email (non-fatal) ───────────────────────────────
    if (ownerEmail) {
      try {
        await sendDetailsPendingEmail(supabase, {
          to:         ownerEmail,
          ownerName,
          entityName: name.trim(),
          entityType: 'company',
        })
      } catch (e) {
        console.error('Owner email failed (non-fatal):', e.message)
      }
    }

    return NextResponse.json({
      success: true,
      status:  'pending_verification',
      message: 'Company details updated. Our team will review your changes within 1–2 business days.',
    })

  } catch (err) {
    console.error('POST /api/company/settings error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}