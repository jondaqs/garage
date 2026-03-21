// src/app/api/team/send-invitation-email/route.js
// Enhanced version with database queue and better logging

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request) {
  console.log('📧 Email route called')
  
  try {
    const body = await request.json()
    const invitation_id = body.invitation_id

    if (!invitation_id) {
      console.error('❌ No invitation_id provided')
      return NextResponse.json(
        { error: 'Invitation ID required' },
        { status: 400 }
      )
    }

    console.log('📋 Invitation ID:', invitation_id)

    const supabase = await createClient()

    // Get invitation details
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select(`
        *,
        service_provider:service_providers(name, phone, email)
      `)
      .eq('id', invitation_id)
      .single()

    if (inviteError || !invitation) {
      console.error('❌ Invitation not found:', inviteError)
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    console.log('✅ Invitation loaded for:', invitation.invited_email)

    // Check environment variables
    const mailjetApiKey = process.env.MAILJET_API_KEY
    const mailjetSecretKey = process.env.MAILJET_SECRET_KEY
    const mailjetFromEmail = process.env.MAILJET_FROM_EMAIL || 
                            process.env.MAILJET_SENDER_EMAIL || 
                            'noreply@garicare.com'
    const mailjetFromName = process.env.MAILJET_FROM_NAME || 
                           process.env.MAILJET_SENDER_NAME || 
                           'GariCare'

    console.log('🔑 Checking Mailjet credentials...')
    console.log('Has API Key:', !!mailjetApiKey, mailjetApiKey ? `(${mailjetApiKey.substring(0, 5)}...)` : '')
    console.log('Has Secret:', !!mailjetSecretKey)
    console.log('From Email:', mailjetFromEmail)
    console.log('From Name:', mailjetFromName)

    if (!mailjetApiKey || !mailjetSecretKey) {
      console.error('❌ Mailjet credentials not configured')
      
      // Still queue the email for later processing
      await queueEmail(supabase, {
        recipient_email: invitation.invited_email,
        subject: `${invitation.service_provider.name} invited you to join their team`,
        body_html: `Invitation from ${invitation.service_provider.name}`,
        body_text: `Invitation from ${invitation.service_provider.name}`,
        status: 'failed',
        error_message: 'Mailjet credentials not configured'
      })

      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
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

    console.log('📝 Email content generated')
    console.log('Subject:', emailContent.subject)

    // Queue email in database BEFORE sending
    const { data: queuedEmail, error: queueError } = await supabase
      .from('email_queue')
      .insert({
        recipient_email: invitation.invited_email,
        subject: emailContent.subject,
        body_html: emailContent.html,
        body_text: emailContent.text,
        status: 'pending'
      })
      .select()
      .single()

    if (queueError) {
      console.error('⚠️ Failed to queue email:', queueError)
      // Continue anyway - try to send even if queuing fails
    } else {
      console.log('✅ Email queued in database:', queuedEmail.id)
    }

    // Send email via Mailjet
    const mailjetUrl = 'https://api.mailjet.com/v3.1/send'
    const auth = Buffer.from(`${mailjetApiKey}:${mailjetSecretKey}`).toString('base64')

    console.log('🚀 Sending to Mailjet...')

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

    console.log('📬 Mailjet response status:', mailjetResponse.status)
    console.log('📬 Mailjet response:', JSON.stringify(mailjetData, null, 2))

    if (!mailjetResponse.ok) {
      console.error('❌ Mailjet error:', mailjetData)
      
      // Update queue status to failed
      if (queuedEmail) {
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: JSON.stringify(mailjetData)
          })
          .eq('id', queuedEmail.id)
      }

      return NextResponse.json(
        { 
          error: 'Failed to send email', 
          details: mailjetData,
          queued: !!queuedEmail
        },
        { status: 500 }
      )
    }

    console.log('✅ Email sent successfully via Mailjet!')

    // Update queue status to sent
    if (queuedEmail) {
      await supabase
        .from('email_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', queuedEmail.id)
      
      console.log('✅ Email queue updated to sent')
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation email sent successfully',
      email: invitation.invited_email,
      mailjet_message_id: mailjetData.Messages?.[0]?.To?.[0]?.MessageID,
      queued_email_id: queuedEmail?.id
    })

  } catch (error) {
    console.error('💥 Send email error:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}

// Helper function to queue email
async function queueEmail(supabase, emailData) {
  try {
    await supabase
      .from('email_queue')
      .insert(emailData)
    console.log('✅ Email queued:', emailData.recipient_email)
  } catch (err) {
    console.error('⚠️ Failed to queue email:', err)
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
    .content { padding: 40px 30px; }
    .button { 
      display: inline-block; 
      background-color: #2563eb; 
      color: white !important; 
      padding: 16px 40px; 
      text-decoration: none; 
      border-radius: 8px; 
      margin: 30px 0;
      font-weight: 600;
    }
    .footer {
      text-align: center;
      padding: 30px;
      color: #6b7280;
      font-size: 14px;
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
      
      <p><strong style="color: #2563eb;">${providerName}</strong> has invited you to join their team${role ? ` as a ${role}` : ''}.</p>
      
      ${specialization ? `<p><strong>Specialization:</strong> ${specialization}</p>` : ''}
      ${experienceYears ? `<p><strong>Experience:</strong> ${experienceYears} years</p>` : ''}
      
      <p>To accept this invitation:</p>
      <ol>
        <li>Log in to GariCare using this email: <strong>${recipientEmail}</strong></li>
        <li>Go to your dashboard</li>
        <li>View and accept the invitation</li>
      </ol>
      
      <div style="text-align: center;">
        <a href="${appUrl}/auth/login" class="button">Go to GariCare</a>
      </div>
      
      <p><strong>Note:</strong> This invitation will expire in 7 days.</p>
    </div>
    
    <div class="footer">
      <p>If you didn't expect this invitation, you can safely ignore this email.</p>
      <p style="font-size: 12px; color: #9ca3af;">This is an automated message from GariCare</p>
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

To accept this invitation:
1. Log in to GariCare using this email: ${recipientEmail}
2. Go to your dashboard
3. View and accept the invitation

Visit: ${appUrl}/auth/login

This invitation will expire in 7 days.

---
This is an automated message from GariCare
  `
  
  return { subject, html, text }
}