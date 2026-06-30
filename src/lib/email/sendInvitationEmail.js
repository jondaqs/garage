import { createClient } from '@supabase/supabase-js'

export async function sendInvitationEmail(invitation_id) {
  console.log('📧 Email service called')

  try {
    if (!invitation_id) {
      console.error('❌ No invitation_id provided')
      return { error: 'Invitation ID required', status: 400 }
    }

    console.log('📋 Invitation ID:', invitation_id)

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get invitation details
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations_secure')
      .select(`
        *,
        service_provider:service_providers_secure(name, phone, email)
      `)
      .eq('id', invitation_id)
      .single()

    if (inviteError || !invitation) {
      console.error('❌ Invitation not found:', inviteError)
      //return { error: 'Invitation not found', status: 404 }
      throw new Error('Invitation not found', { status: 404 })
    }

    console.log('✅ Invitation loaded for:', invitation.invited_email)

    // Mailjet config
    const mailjetApiKey = process.env.MAILJET_API_KEY
    const mailjetSecretKey = process.env.MAILJET_SECRET_KEY
    const mailjetFromEmail =
      process.env.MAILJET_FROM_EMAIL ||
      process.env.MAILJET_SENDER_EMAIL ||
      'noreply@survlinx.com'

    const mailjetFromName =
      process.env.MAILJET_FROM_NAME ||
      process.env.MAILJET_SENDER_NAME ||
      'Carfix-Connect'

    console.log('🔑 Checking Mailjet credentials...')
    console.log('Has API Key:', !!mailjetApiKey)
    console.log('Has Secret:', !!mailjetSecretKey)

    if (!mailjetApiKey || !mailjetSecretKey) {
      console.error('❌ Mailjet credentials not configured')

      // Queue the email as failed for later retry
      await queueEmail(supabase, {
        recipient_email: invitation.invited_email,
        subject: `${invitation.service_provider.name} invited you to join their team`,
        body_html: `Invitation from ${invitation.service_provider.name} Email content pending`,
        body_text: `Invitation from ${invitation.service_provider.name} Email content pending`,
        status: 'failed',
        error_message: 'Mailjet credentials not configured'
      })

      //return { error: 'Email service not configured', status: 500 }
      throw new Error('Email service not configured', { status: 500 })
    }

    // Generate email
    const emailContent = generateInvitationEmail(
      invitation.service_provider.name,
      invitation.invited_email,
      invitation.role,
      invitation.specialization,
      invitation.experience_years
    )

    console.log('📝 Email content generated')

    // Queue email in database BEFORE sending
    // This is non-blocking - if it fails, we still try to send
    let queuedEmailId = null
    try {
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
        console.warn('⚠️ Failed to queue email (non-blocking):', queueError.message)
      } else {
        queuedEmailId = queuedEmail.id
        console.log('✅ Email queued in database:', queuedEmailId)
      }
    } catch (queueErr) {
      console.warn('⚠️ Queue error (non-blocking):', queueErr.message)
    }

    // Send via Mailjet
    const auth = Buffer.from(
      `${mailjetApiKey}:${mailjetSecretKey}`
    ).toString('base64')

    const mailjetResponse = await fetch('https://api.mailjet.com/v3.1/send', {
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

    console.log('📬 Mailjet status:', mailjetResponse.status)

    if (!mailjetResponse.ok) {
      console.error('❌ Mailjet error:', mailjetData)
      
      // Update queue status to failed (non-blocking)
      if (queuedEmailId) {
        try {
          await supabase
            .from('email_queue')
            .update({
              status: 'failed',
              error_message: JSON.stringify(mailjetData)
            })
            .eq('id', queuedEmailId)
        } catch (updateErr) {
          console.warn('⚠️ Failed to update queue status:', updateErr.message)
        }
      }
 
      throw new Error('Failed to send email via Mailjet', { status: 500 })
    }

    console.log('✅ Email sent successfully')

    // Update queue status to sent (non-blocking)
    if (queuedEmailId) {
      try {
        await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', queuedEmailId)
        
        console.log('✅ Email queue updated to sent')
      } catch (updateErr) {
        console.warn('⚠️ Failed to update queue status:', updateErr.message)
      }
    }

    return {
      success: true,
      email: invitation.invited_email,
      mailjet_message_id:
        mailjetData.Messages?.[0]?.To?.[0]?.MessageID,
      queued_email_id: queuedEmailId
    }

  } catch (error) {
    console.error('💥 Email error:', error)
    /*return {
      error: 'Internal server error',
      details: error.message,
      status: 500
    }*/
    throw new Error('Internal server error: ' + error.message, { status: 500 })
  }
}

// Helper function to queue email (non-blocking)
async function queueEmail(supabase, emailData) {
  try {
    await supabase
      .from('email_queue')
      .insert(emailData)
    console.log('✅ Email queued:', emailData.recipient_email)
  } catch (err) {
    console.warn('⚠️ Failed to queue email (non-blocking):', err.message)
    // Don't throw - this is non-blocking
  }
}

function generateInvitationEmail(providerName, recipientEmail, role, specialization, experienceYears) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://garage-mu-two.vercel.app'

  const subject = `${providerName} has invited you to join their team`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6; 
      color: #333; 
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
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
    .info { 
      background: #eff6ff; 
      padding: 20px; 
      border-radius: 8px; 
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      padding: 30px;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🔧 Team Invitation</h1>
      <p style="margin: 10px 0 0 0;">You've been invited to join a team</p>
    </div>
    
    <div class="content">
      <h2 style="color: #1f2937;">Hello!</h2>
      
      <p style="font-size: 16px;"><strong style="color: #2563eb;">${providerName}</strong> has invited you to join their team${role ? ` as a <strong>${role}</strong>` : ''}.</p>
      
      ${(specialization || experienceYears) ? `
      <div class="info">
        ${specialization ? `<p style="margin: 5px 0;"><strong>Specialization:</strong> ${specialization}</p>` : ''}
        ${experienceYears ? `<p style="margin: 5px 0;"><strong>Experience:</strong> ${experienceYears} years</p>` : ''}
      </div>
      ` : ''}
      
      <p><strong>To accept this invitation:</strong></p>
      <ol>
        <li>Log in to Carfix-Connect using this email: <strong>${recipientEmail}</strong></li>
        <li>Go to your dashboard</li>
        <li>You'll see the invitation - click Accept</li>
      </ol>
      
      <div style="text-align: center;">
        <a href="${appUrl}/auth/login" class="button">Go to Carfix-Connect</a>
      </div>
      
      <p style="color: #dc2626; font-weight: 600;">⏰ This invitation expires in 7 days</p>
    </div>
    
    <div class="footer">
      <p>If you didn't expect this invitation, you can safely ignore this email.</p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">This is an automated message from Carfix-Connect</p>
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
1. Log in to Carfix-Connect using this email: ${recipientEmail}
2. Go to your dashboard
3. You'll see the invitation - click Accept

Visit: ${appUrl}/auth/login

⏰ This invitation expires in 7 days

If you didn't expect this invitation, you can safely ignore this email.

---
This is an automated message from Carfix-Connect
  `

  return { subject, html, text }
}