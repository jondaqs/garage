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
      .from('team_invitations')
      .select(`
        *,
        service_provider:service_providers(name, phone, email)
      `)
      .eq('id', invitation_id)
      .single()

    if (inviteError || !invitation) {
      console.error('❌ Invitation not found:', inviteError)
      return { error: 'Invitation not found', status: 404 }
    }

    console.log('✅ Invitation loaded for:', invitation.invited_email)

    // Mailjet config
    const mailjetApiKey = process.env.MAILJET_API_KEY
    const mailjetSecretKey = process.env.MAILJET_SECRET_KEY
    const mailjetFromEmail =
      process.env.MAILJET_FROM_EMAIL ||
      process.env.MAILJET_SENDER_EMAIL ||
      'noreply@garicare.com'

    const mailjetFromName =
      process.env.MAILJET_FROM_NAME ||
      process.env.MAILJET_SENDER_NAME ||
      'GariCare'

    console.log('🔑 Checking Mailjet credentials...')
    console.log('Has API Key:', !!mailjetApiKey)
    console.log('Has Secret:', !!mailjetSecretKey)

    if (!mailjetApiKey || !mailjetSecretKey) {
      console.error('❌ Mailjet credentials not configured')

      await queueEmail(supabase, {
        recipient_email: invitation.invited_email,
        subject: `${invitation.service_provider.name} invited you to join their team`,
        body_html: `Invitation from ${invitation.service_provider.name}`,
        body_text: `Invitation from ${invitation.service_provider.name}`,
        status: 'failed',
        error_message: 'Mailjet credentials not configured'
      })

      return { error: 'Email service not configured', status: 500 }
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

    // Queue BEFORE sending
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
    } else {
      console.log('✅ Email queued:', queuedEmail.id)
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

      if (queuedEmail) {
        await supabase
          .from('email_queue')
          .update({
            status: 'failed',
            error_message: JSON.stringify(mailjetData)
          })
          .eq('id', queuedEmail.id)
      }

      return {
        error: 'Failed to send email',
        details: mailjetData,
        status: 500
      }
    }

    console.log('✅ Email sent successfully')

    if (queuedEmail) {
      await supabase
        .from('email_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', queuedEmail.id)
    }

    return {
      success: true,
      email: invitation.invited_email,
      mailjet_message_id:
        mailjetData.Messages?.[0]?.To?.[0]?.MessageID,
      queued_email_id: queuedEmail?.id
    }

  } catch (error) {
    console.error('💥 Email error:', error)
    return {
      error: 'Internal server error',
      details: error.message,
      status: 500
    }
  }
}

// Helpers (UNCHANGED)
async function queueEmail(supabase, emailData) {
  try {
    await supabase.from('email_queue').insert(emailData)
    console.log('✅ Email queued:', emailData.recipient_email)
  } catch (err) {
    console.error('⚠️ Queue failed:', err)
  }
}

function generateInvitationEmail(providerName, recipientEmail, role, specialization, experienceYears) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://garicare-projects.vercel.app'

  const subject = `${providerName} has invited you to join their team`

  const html = `...YOUR FULL HTML (UNCHANGED)...`
  const text = `...YOUR FULL TEXT (UNCHANGED)...`

  return { subject, html, text }
}