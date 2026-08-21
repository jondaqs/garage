// src/app/api/admin/assessment-invitations/send/route.js
// POST /api/admin/assessment-invitations/send
//
// Accepts a list of emails + assessment details, upserts invitations,
// and sends each one via Mailjet through the standard email queue.
//
// Auth: caller must be an admin (is_any_admin).

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAssessmentInviteEmail }           from '@/lib/email/assessmentEmails'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(request) {
  try {
    // 1. Verify caller is authenticated + admin
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: isAdmin } = await supabase.rpc('is_any_admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // 2. Parse body
    const {
      emails,           // string[] — list of recipient emails
      assessmentId,
      assessmentName,
      description,
      timeLimitMins,
      opensAt,
      closesAt,
      emailSubject,
      emailBody,        // plain-text custom body (stored in invitation record)
    } = await request.json()

    if (!emails?.length || !assessmentId) {
      return NextResponse.json({ error: 'emails and assessmentId are required' }, { status: 400 })
    }

    // 3. Service client for bypassing RLS on email_queue inserts
    const sc = getServiceClient()

    let sent = 0, skipped = 0, failed = 0
    const errors = []

    for (const email of emails) {
      // Check if already invited (read from secure view)
      const { data: existing } = await supabase
        .from('assessment_invitations_secure')
        .select('id, status')
        .eq('assessment_id', assessmentId)
        .eq('email', email)
        .maybeSingle()

      if (existing && ['pending', 'sent', 'accepted'].includes(existing.status)) {
        skipped++
        continue
      }

      // Upsert the invitation record
      const { error: upsertError } = await supabase
        .from('assessment_invitations')
        .upsert({
          assessment_id: assessmentId,
          email,
          invited_by: user.id,
          email_subject: emailSubject,
          email_body: emailBody,
          status: 'sent',
          sent_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id,email' })

      if (upsertError) {
        failed++
        errors.push({ email, error: upsertError.message })
        continue
      }

      // Send the actual email (service client for email_queue writes)
      try {
        await sendAssessmentInviteEmail(sc, {
          to: email,
          assessmentId,
          assessmentName,
          description,
          timeLimitMins,
          opensAt,
          closesAt,
          customSubject: emailSubject,
        })
        sent++
      } catch (emailErr) {
        // Invitation is saved but email failed — don't block the loop
        console.error(`Email send failed for ${email}:`, emailErr.message)
        failed++
        errors.push({ email, error: emailErr.message })
      }
    }

    return NextResponse.json({ sent, skipped, failed, total: emails.length, errors: errors.length ? errors : undefined })
  } catch (err) {
    console.error('Assessment invite API error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}