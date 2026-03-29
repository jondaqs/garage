// Send company team member invitation email using Mailjet
export async function sendCompanyInviteEmail({
  inviteeEmail,
  inviteeName,
  companyName,
  inviterName,
  staffRole,
  invitationToken,
  permissions = {}
}) {
  const MAILJET_API_KEY = process.env.MAILJET_API_KEY
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@garicare.com'
  const FROM_NAME = process.env.FROM_NAME || 'GariCare'

  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    console.error('❌ Mailjet credentials not configured')
    throw new Error('Email service not configured')
  }

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/company/accept-invitation?token=${invitationToken}`

  const emailBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">You've Been Invited to Join ${companyName}</h2>
          
          <p>Hello ${inviteeName || ''},</p>
          
          <p><strong>${inviterName}</strong> from <strong>${companyName}</strong> has invited you to join their team on GariCare.</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Company:</strong> ${companyName}</p>
            <p style="margin: 5px 0;"><strong>Your Role:</strong> ${staffRole}</p>
            ${Object.keys(permissions).length > 0 ? `
              <p style="margin: 5px 0;"><strong>Permissions:</strong></p>
              <ul style="margin: 5px 0;">
                ${Object.entries(permissions).map(([key, value]) => 
                  value ? `<li>${key.replace(/([A-Z])/g, ' $1').trim()}</li>` : ''
                ).join('')}
              </ul>
            ` : ''}
          </div>
          
          <p>To accept this invitation and join the team:</p>
          <ol>
            <li>Click the button below</li>
            <li>Create your account (or sign in if you already have one)</li>
            <li>Start managing your company's fleet and bookings</li>
          </ol>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${acceptUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            This invitation will expire in 7 days. If you have any questions, 
            please contact ${inviterName}.
          </p>
          
          <p style="color: #6b7280; font-size: 14px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${acceptUrl}" style="color: #2563eb;">${acceptUrl}</a>
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #6b7280; font-size: 12px;">
            Best regards,<br>
            The GariCare Team
          </p>
        </div>
      </body>
    </html>
  `

  try {
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64')}`
      },
      body: JSON.stringify({
        Messages: [
          {
            From: {
              Email: FROM_EMAIL,
              Name: FROM_NAME
            },
            To: [
              {
                Email: inviteeEmail,
                Name: inviteeName || inviteeEmail
              }
            ],
            Subject: `You've been invited to join ${companyName} on GariCare`,
            HTMLPart: emailBody
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('❌ Mailjet error:', error)
      throw new Error('Failed to send invitation email')
    }

    const result = await response.json()
    console.log('✅ Company invitation email sent:', inviteeEmail)
    return result

  } catch (error) {
    console.error('❌ Error sending company invitation email:', error)
    throw error
  }
}

// Send company registration confirmation email
export async function sendCompanyRegistrationEmail({
  ownerEmail,
  ownerName,
  companyName,
  registrationNumber,
  companyId
}) {
  const MAILJET_API_KEY = process.env.MAILJET_API_KEY
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@garicare.com'
  const FROM_NAME = process.env.FROM_NAME || 'GariCare'

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/company/dashboard`

  const emailBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Company Registration Received</h2>
          
          <p>Dear ${ownerName},</p>
          
          <p>Thank you for registering <strong>${companyName}</strong> with GariCare!</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Company Name:</strong> ${companyName}</p>
            <p style="margin: 5px 0;"><strong>Registration Number:</strong> ${registrationNumber}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> Pending Verification</p>
            <p style="margin: 5px 0;"><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          
          <h3 style="color: #2563eb;">What Happens Next?</h3>
          <ol>
            <li>Our team will review your documents (2-5 business days)</li>
            <li>You'll receive an email once verification is complete</li>
            <li>Upon approval, your team will gain full access to all features</li>
          </ol>
          
          <p>While your application is being reviewed, you can:</p>
          <ul>
            <li>Access your company dashboard</li>
            <li>Add team members</li>
            <li>Add vehicles to your fleet</li>
            <li>Configure company settings</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Go to Dashboard
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            If you have any questions about the verification process, please contact our support team.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #6b7280; font-size: 12px;">
            Best regards,<br>
            The GariCare Team
          </p>
        </div>
      </body>
    </html>
  `

  try {
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64')}`
      },
      body: JSON.stringify({
        Messages: [
          {
            From: {
              Email: FROM_EMAIL,
              Name: FROM_NAME
            },
            To: [
              {
                Email: ownerEmail,
                Name: ownerName
              }
            ],
            Subject: `Company Registration Received - ${companyName}`,
            HTMLPart: emailBody
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('❌ Mailjet error:', error)
      throw new Error('Failed to send confirmation email')
    }

    const result = await response.json()
    console.log('✅ Company registration email sent:', ownerEmail)
    return result

  } catch (error) {
    console.error('❌ Error sending registration email:', error)
    throw error
  }
}

// Send company approval notification
export async function sendCompanyApprovalEmail({
  ownerEmail,
  ownerName,
  companyName,
  companyId
}) {
  const MAILJET_API_KEY = process.env.MAILJET_API_KEY
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@garicare.com'
  const FROM_NAME = process.env.FROM_NAME || 'GariCare'

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/company/dashboard`

  const emailBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #10b981;">🎉 Your Company Has Been Approved!</h2>
          
          <p>Congratulations ${ownerName}!</p>
          
          <p>We're excited to inform you that <strong>${companyName}</strong> has been verified and approved on GariCare.</p>
          
          <h3 style="color: #2563eb;">You Now Have Full Access To:</h3>
          <ul>
            <li>✓ Complete fleet management</li>
            <li>✓ Service bookings for all your vehicles</li>
            <li>✓ Team member management</li>
            <li>✓ Detailed reporting and analytics</li>
            <li>✓ Budget tracking and controls</li>
            <li>✓ Priority support</li>
          </ul>
          
          <h3 style="color: #2563eb;">Get Started:</h3>
          <ol>
            <li>Add more vehicles to your fleet</li>
            <li>Invite team members to join</li>
            <li>Book your first service</li>
            <li>Set up budget controls</li>
          </ol>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" 
               style="background-color: #10b981; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Go to Dashboard
            </a>
          </div>
          
          <p style="background-color: #dbeafe; padding: 15px; border-radius: 5px; border-left: 4px solid #2563eb;">
            <strong>Welcome to GariCare!</strong><br>
            We're here to help you manage your fleet efficiently. If you need any assistance, 
            our support team is just a message away.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #6b7280; font-size: 12px;">
            Best regards,<br>
            The GariCare Team
          </p>
        </div>
      </body>
    </html>
  `

  try {
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64')}`
      },
      body: JSON.stringify({
        Messages: [
          {
            From: {
              Email: FROM_EMAIL,
              Name: FROM_NAME
            },
            To: [
              {
                Email: ownerEmail,
                Name: ownerName
              }
            ],
            Subject: `🎉 ${companyName} Has Been Approved - GariCare`,
            HTMLPart: emailBody
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('❌ Mailjet error:', error)
      throw new Error('Failed to send approval email')
    }

    const result = await response.json()
    console.log('✅ Company approval email sent:', ownerEmail)
    return result

  } catch (error) {
    console.error('❌ Error sending approval email:', error)
    throw error
  }
}