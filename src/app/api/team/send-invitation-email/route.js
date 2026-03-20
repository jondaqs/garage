// src/app/api/team/send-invitation-email/route.js
// Uses Mailjet to send team invitation emails

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    // Verify webhook secret if called from Supabase webhook
    const webhookSecret = request.headers.get('x-webhook-secret')
    if (webhookSecret && webhookSecret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
    }

    const body = await request.json()
    const invitation_id = body.invitation_id || body.record?.id

    if (!invitation_id) {
      return NextResponse.json(
        { error: 'Invitation ID required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get invitation details
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select(`
        *,
        service_provider:service_providers(name, phone)
      `)
      .eq('id', invitation_id)
      .single()

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    // Generate email content
    const emailContent = generateInvitationEmail(
      invitation.service_provider.name,
      invitation.invited_email,
      invitation.role,
      invitation.specialization,
      invitation.experience_years
    )

    // Send email via Mailjet
    const mailjetApiKey = process.env.MAILJET_API_KEY
    const mailjetSecretKey = process.env.MAILJET_SECRET_KEY
    const mailjetFromEmail = process.env.MAILJET_FROM_EMAIL || 'noreply@garicare.com'
    const mailjetFromName = process.env.MAILJET_FROM_NAME || 'GariCare'

    if (!mailjetApiKey || !mailjetSecretKey) {
      console.error('Mailjet credentials not configured')
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      )
    }

    // Mailjet API endpoint
    const mailjetUrl = 'https://api.mailjet.com/v3.1/send'
    
    // Create Basic Auth header
    const auth = Buffer.from(`${mailjetApiKey}:${mailjetSecretKey}`).toString('base64')

    // Send email via Mailjet API
    const mailjetResponse = await fetch(mailjetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        Messages: [
          {
            From: {
              Email: mailjetFromEmail,
              Name: mailjetFromName
            },
            To: [
              {
                Email: invitation.invited_email,
                Name: invitation.invited_email.split('@')[0]
              }
            ],
            Subject: emailContent.subject,
            TextPart: emailContent.text,
            HTMLPart: emailContent.html
          }
        ]
      })
    })

    const mailjetData = await mailjetResponse.json()

    if (!mailjetResponse.ok) {
      console.error('Mailjet error:', mailjetData)
      return NextResponse.json(
        { error: 'Failed to send email', details: mailjetData },
        { status: 500 }
      )
    }

    console.log('✅ Email sent via Mailjet:', mailjetData)

    return NextResponse.json({
      success: true,
      message: 'Invitation email sent successfully',
      email: invitation.invited_email,
      mailjet_message_id: mailjetData.Messages?.[0]?.To?.[0]?.MessageID
    })

  } catch (error) {
    console.error('Send email error:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

function generateInvitationEmail(providerName, recipientEmail, role, specialization, experienceYears) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  const subject = `${providerName} has invited you to join their team`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6; 
      color: #333; 
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background-color: #ffffff;
    }
    .header { 
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
      color: white; 
      padding: 40px 30px; 
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 10px 0 0 0;
      opacity: 0.95;
      font-size: 16px;
    }
    .content { 
      padding: 40px 30px;
    }
    .content h2 {
      color: #1f2937;
      font-size: 24px;
      margin-top: 0;
    }
    .info-box {
      background-color: #eff6ff;
      border-left: 4px solid #2563eb;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .info-box p {
      margin: 0;
      color: #1e40af;
    }
    .steps-box { 
      background-color: #f9fafb; 
      padding: 25px; 
      border-radius: 8px; 
      margin: 25px 0;
    }
    .steps-box h3 {
      margin-top: 0;
      color: #1f2937;
      font-size: 18px;
    }
    .step { 
      position: relative; 
      padding-left: 45px; 
      margin: 20px 0;
      counter-increment: step;
    }
    .step:before { 
      content: counter(step); 
      position: absolute; 
      left: 0; 
      top: 0; 
      background: #2563eb; 
      color: white; 
      width: 32px; 
      height: 32px; 
      border-radius: 50%; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-weight: bold;
      font-size: 16px;
    }
    .step strong {
      display: block;
      color: #1f2937;
      margin-bottom: 5px;
      font-size: 16px;
    }
    .step span {
      color: #6b7280;
      font-size: 14px;
      line-height: 1.5;
    }
    .step .highlight {
      color: #2563eb;
      font-weight: 600;
    }
    .warning-box { 
      background-color: #fffbeb; 
      border-left: 4px solid #f59e0b;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .warning-box p {
      margin: 0 0 10px 0;
      font-weight: 600;
      color: #92400e;
      font-size: 16px;
    }
    .warning-box ul {
      margin: 10px 0 0 0;
      padding-left: 20px;
      color: #78350f;
    }
    .warning-box li {
      margin: 8px 0;
    }
    .button { 
      display: inline-block; 
      background-color: #2563eb; 
      color: white !important; 
      padding: 16px 40px; 
      text-decoration: none; 
      border-radius: 8px; 
      margin: 30px 0;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
    }
    .button:hover {
      background-color: #1d4ed8;
    }
    .help-box {
      background-color: #f0fdf4;
      border-left: 4px solid #10b981;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .help-box p {
      margin: 0;
      color: #065f46;
    }
    .help-box a {
      color: #059669;
      font-weight: 600;
    }
    .footer {
      text-align: center;
      padding: 30px;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
    .footer-small {
      color: #9ca3af;
      font-size: 12px;
      margin-top: 15px;
    }
    .badge {
      display: inline-block;
      background-color: #dbeafe;
      color: #1e40af;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      margin: 5px 5px 5px 0;
    }
    @media only screen and (max-width: 600px) {
      .content { padding: 30px 20px; }
      .header { padding: 30px 20px; }
      .header h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔧 Team Invitation</h1>
      <p>You've been invited to join a service provider team</p>
    </div>
    
    <div class="content">
      <h2>Hello!</h2>
      
      <p style="font-size: 16px;"><strong style="color: #2563eb; font-size: 18px;">${providerName}</strong> has invited you to join their team${role ? ` as a ${role}` : ''}.</p>
      
      ${specialization || experienceYears ? `
      <div class="info-box">
        ${specialization ? `<p style="margin-bottom: 8px;"><strong>🎯 Specialization:</strong> ${specialization}</p>` : ''}
        ${experienceYears ? `<p><strong>📅 Experience:</strong> ${experienceYears} years</p>` : ''}
      </div>
      ` : ''}
      
      <div class="steps-box">
        <h3>📝 How to Accept This Invitation</h3>
        <div style="counter-reset: step;">
          <div class="step">
            <strong>Register or Log In</strong>
            <span>Visit GariCare and use this email address:<br><span class="highlight">${recipientEmail}</span></span>
          </div>
          <div class="step">
            <strong>Confirm Your Email</strong>
            <span>Check your inbox for the confirmation email and verify your account</span>
          </div>
          <div class="step">
            <strong>Complete Your Profile</strong>
            <span>Make sure your profile is filled out and your account is active</span>
          </div>
          <div class="step">
            <strong>View Your Invitation</strong>
            <span>Go to your dashboard to see and accept the invitation</span>
          </div>
        </div>
      </div>
      
      <div class="warning-box">
        <p>⚠️ Important Requirements:</p>
        <ul>
          <li>You must register using this exact email address: <strong>${recipientEmail}</strong></li>
          <li>Your email must be confirmed (check your inbox for verification email)</li>
          <li>Your account must be active and not suspended</li>
          <li>This invitation will expire in <strong>7 days</strong></li>
        </ul>
      </div>
      
      <div style="text-align: center;">
        <a href="${appUrl}" class="button">Go to GariCare Dashboard</a>
      </div>
      
      <div class="help-box">
        <p style="font-weight: 600; margin-bottom: 8px;">💡 Don't have an account yet?</p>
        <p>No problem! Register at <a href="${appUrl}/auth/register">${appUrl}/auth/register</a> using the email address above, then check your dashboard for the invitation.</p>
      </div>
    </div>
    
    <div class="footer">
      <p>If you didn't expect this invitation, you can safely ignore this email<br>or decline it from your dashboard after logging in.</p>
      <p class="footer-small">This is an automated message from GariCare</p>
    </div>
  </div>
</body>
</html>
  `
  
  const text = `
TEAM INVITATION FROM ${providerName.toUpperCase()}

Hello!

${providerName} has invited you to join their team${role ? ` as a ${role}` : ''}.

${specialization ? `Specialization: ${specialization}\n` : ''}${experienceYears ? `Experience: ${experienceYears} years\n` : ''}

HOW TO ACCEPT THIS INVITATION:

1. Register or Log In
   Visit ${appUrl} and use this email address: ${recipientEmail}

2. Confirm Your Email
   Check your inbox for the confirmation email and verify your account

3. Complete Your Profile
   Make sure your profile is filled out and your account is active

4. View Your Invitation
   Go to your dashboard to see and accept the invitation

IMPORTANT REQUIREMENTS:
- You must register using this exact email address: ${recipientEmail}
- Your email must be confirmed (check your inbox for verification email)
- Your account must be active and not suspended
- This invitation will expire in 7 days

DON'T HAVE AN ACCOUNT?
No problem! Register at ${appUrl}/auth/register using the email address above, then check your dashboard for the invitation.

If you didn't expect this invitation, you can safely ignore this email or decline it from your dashboard after logging in.

---
This is an automated message from GariCare
  `
  
  return { subject, html, text }
}