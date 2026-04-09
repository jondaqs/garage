// src/app/api/provider/work-orders/route.js
// POST /api/provider/work-orders
// Creates a walk-in work order, then sends invite email if needed.
// Separating email from the DB function keeps the function pure SQL
// and allows retries on email failure without rolling back the WO.

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const body     = await request.json()

    const {
      // vehicle
      plate_number,
      make, model, year, color, vin,
      // owner (known)
      owner_user_id,
      owner_company_id,
      // unregistered owner
      walk_in_owner_name,
      walk_in_owner_phone,
      walk_in_owner_email,
      // work order
      problem_description,
      priority,
      shop_id,
      initial_mileage,
    } = body

    if (!plate_number?.trim()) {
      return NextResponse.json({ error: 'Plate number is required' }, { status: 400 })
    }

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Call the SECURITY DEFINER function
    const { data: result, error: rpcError } = await supabase.rpc(
      'create_walk_in_work_order',
      {
        p_provider_user_id:    user.id,
        p_plate_number:        plate_number.trim().toUpperCase(),
        p_make:                make   || null,
        p_model:               model  || null,
        p_year:                year   ? parseInt(year) : null,
        p_color:               color  || null,
        p_vin:                 vin    || null,
        p_owner_user_id:       owner_user_id    || null,
        p_owner_company_id:    owner_company_id || null,
        p_walk_in_owner_name:  walk_in_owner_name  || null,
        p_walk_in_owner_phone: walk_in_owner_phone || null,
        p_walk_in_owner_email: walk_in_owner_email || null,
        p_problem_description: problem_description || null,
        p_priority:            priority || 'normal',
        p_shop_id:             shop_id  || null,
        p_initial_mileage:     initial_mileage ? parseInt(initial_mileage) : null,
      }
    )

    if (rpcError) {
      console.error('create_walk_in_work_order RPC error:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // If an invitation was created, send the email
    if (result.invitation_id && walk_in_owner_email) {
      try {
        await sendWalkInInviteEmail({
          toEmail:          walk_in_owner_email,
          ownerName:        walk_in_owner_name,
          workOrderNumber:  result.work_order_number,
          plateNumber:      plate_number.trim().toUpperCase(),
          inviteToken:      result.invitation_token,
          providerUserId:   user.id,
          supabase,
        })
      } catch (emailErr) {
        // Email failure is non-fatal — WO is created; provider can retry
        console.error('Walk-in invite email failed (non-fatal):', emailErr.message)
        return NextResponse.json({
          ...result,
          email_sent:     false,
          email_warning:  'Work order created but invitation email failed to send. You can resend from the work order page.',
        })
      }
    }

    return NextResponse.json({ ...result, email_sent: !!result.invitation_id })

  } catch (err) {
    console.error('POST /api/provider/work-orders error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Email helper ─────────────────────────────────────────────────────────────
async function sendWalkInInviteEmail({
  toEmail, ownerName, workOrderNumber, plateNumber, inviteToken, providerUserId, supabase
}) {
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app'
  const mailjetApiKey  = process.env.MAILJET_API_KEY
  const mailjetSecret  = process.env.MAILJET_SECRET_KEY
  const fromEmail      = process.env.MAILJET_FROM_EMAIL || 'noreply@garicare.com'
  const fromName       = process.env.MAILJET_FROM_NAME  || 'GariCare'

  if (!mailjetApiKey || !mailjetSecret) {
    // Queue for later and throw so caller can warn
    await supabase.from('email_queue').insert({
      recipient_email: toEmail,
      subject:         `Your vehicle (${plateNumber}) is being serviced — register to track it`,
      body_html:       buildEmailHtml({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }),
      body_text:       buildEmailText({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }),
      status:          'failed',
      error_message:   'Mailjet credentials not configured',
    })
    throw new Error('Mailjet credentials not configured')
  }

  const html  = buildEmailHtml({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl })
  const text  = buildEmailText({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl })
  const subject = `Your vehicle (${plateNumber}) is at the garage — track it on GariCare`

  // Queue before sending
  let queuedId = null
  try {
    const { data: queued } = await supabase.from('email_queue').insert({
      recipient_email: toEmail,
      subject,
      body_html: html,
      body_text: text,
      status: 'pending',
    }).select('id').single()
    queuedId = queued?.id
  } catch {}

  const auth = Buffer.from(`${mailjetApiKey}:${mailjetSecret}`).toString('base64')

  const resp = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      Messages: [{
        From:     { Email: fromEmail, Name: fromName },
        To:       [{ Email: toEmail, Name: ownerName || toEmail.split('@')[0] }],
        Subject:  subject,
        TextPart: text,
        HTMLPart: html,
      }],
    }),
  })

  if (!resp.ok) {
    const errData = await resp.json()
    if (queuedId) {
      await supabase.from('email_queue').update({
        status: 'failed',
        error_message: JSON.stringify(errData),
      }).eq('id', queuedId)
    }
    throw new Error(`Mailjet error: ${JSON.stringify(errData)}`)
  }

  if (queuedId) {
    await supabase.from('email_queue').update({
      status: 'sent', sent_at: new Date().toISOString()
    }).eq('id', queuedId)
  }
}

function buildEmailHtml({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }) {
  const registerUrl = `${appUrl}/auth/signup?invite_token=${inviteToken}&ref=walkin`
  const greeting    = ownerName ? `Hello ${ownerName},` : 'Hello,'
  return `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:20px;color:#333}
  .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden}
  .header{background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);color:#fff;padding:40px 30px;text-align:center}
  .body{padding:40px 30px}
  .btn{display:inline-block;background:#16a34a;color:#fff!important;padding:16px 40px;text-decoration:none;border-radius:8px;margin:24px 0;font-weight:600;font-size:16px}
  .info{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0}
  .footer{text-align:center;padding:24px;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb}
  .wo-badge{display:inline-block;background:#dbeafe;color:#1e40af;padding:4px 12px;border-radius:20px;font-weight:600;font-size:14px;margin:4px 0}
</style>
</head><body>
<div class="wrap">
  <div class="header">
    <h1 style="margin:0;font-size:24px">🔧 Your Vehicle is at the Garage</h1>
    <p style="margin:10px 0 0;opacity:.9">Track your service on GariCare</p>
  </div>
  <div class="body">
    <p style="font-size:16px">${greeting}</p>
    <p>Your vehicle with plate number <strong>${plateNumber}</strong> has been brought in for service.
    A work order has been created:</p>
    <div class="info">
      <p style="margin:0 0 8px"><strong>Work Order:</strong> <span class="wo-badge">${workOrderNumber}</span></p>
      <p style="margin:0"><strong>Vehicle Plate:</strong> ${plateNumber}</p>
    </div>
    <p>To <strong>view service progress, approve work estimates, and receive updates</strong>, 
    create your free GariCare account using this link:</p>
    <div style="text-align:center">
      <a href="${registerUrl}" class="btn">Create My Account &amp; Track Service</a>
    </div>
    <p style="font-size:13px;color:#6b7280">
      ⏰ This invitation link expires in 7 days.<br>
      After registering, the vehicle and work order will automatically appear in your dashboard.
    </p>
    <p style="font-size:13px;color:#6b7280">
      Already have a GariCare account? 
      <a href="${appUrl}/auth/login" style="color:#16a34a">Log in here</a> — 
      the work order will be linked to your vehicle.
    </p>
  </div>
  <div class="footer">
    <p>If this wasn't your vehicle or you have questions, please ignore this email.</p>
    <p style="font-size:12px;color:#9ca3af">GariCare — Vehicle Service Platform</p>
  </div>
</div>
</body></html>`
}

function buildEmailText({ ownerName, workOrderNumber, plateNumber, inviteToken, appUrl }) {
  const registerUrl = `${appUrl}/auth/signup?invite_token=${inviteToken}&ref=walkin`
  return `
${ownerName ? `Hello ${ownerName},` : 'Hello,'}

Your vehicle (${plateNumber}) has been brought in for service.

Work Order: ${workOrderNumber}
Vehicle:    ${plateNumber}

To track your service progress, approve work estimates, and receive updates,
create your free GariCare account here:

${registerUrl}

This invitation expires in 7 days.

Already have an account? Log in at ${appUrl}/auth/login

---
GariCare — Vehicle Service Platform
`
}