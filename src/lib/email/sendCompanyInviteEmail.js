// ─── Shared Mailjet helper ──────────────────────────────────────────────────
function mailjetClient() {
  const MAILJET_API_KEY = process.env.MAILJET_API_KEY
  const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    throw new Error('Mailjet credentials not configured')
  }
  return {
    auth: `Basic ${Buffer.from(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`).toString('base64')}`,
    from: {
      Email: process.env.FROM_EMAIL || 'noreply@survlinx.com',
      Name: process.env.FROM_NAME || 'Carfix-Connect',
    },
  }
}

async function sendMail({ to, subject, html }) {
  const { auth, from } = mailjetClient()
  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      Messages: [{ From: from, To: to, Subject: subject, HTMLPart: html }],
    }),
  })
  if (!response.ok) {
    const error = await response.json()
    console.error('❌ Mailjet error:', error)
    throw new Error('Failed to send email')
  }
  return response.json()
}

// ─── 1. Team member invitation ──────────────────────────────────────────────
export async function sendCompanyInviteEmail({
  inviteeEmail,
  inviteeName,
  companyName,
  inviterName,
  staffRole,
  invitationToken,
  permissions = {},
}) {
  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/company?token=${invitationToken}`

  const permissionsList = Object.entries(permissions)
    .filter(([, v]) => v)
    .map(([k]) => `<li>${k.replace(/([A-Z])/g, ' $1').trim()}</li>`)
    .join('')

  const html = `
    <html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#2563eb;">You've Been Invited to Join ${companyName}</h2>
      <p>Hello ${inviteeName || ''},</p>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on Carfix-Connect.</p>
      <div style="background:#f3f4f6;padding:15px;border-radius:5px;margin:20px 0;">
        <p style="margin:5px 0;"><strong>Company:</strong> ${companyName}</p>
        <p style="margin:5px 0;"><strong>Your Role:</strong> ${staffRole}</p>
        ${permissionsList ? `<p style="margin:5px 0;"><strong>Permissions:</strong></p><ul>${permissionsList}</ul>` : ''}
      </div>
      <div style="text-align:center;margin:30px 0;">
        <a href="${acceptUrl}" style="background:#2563eb;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block;">
          Accept Invitation
        </a>
      </div>
      <p style="color:#6b7280;font-size:14px;">This invitation expires in 7 days.</p>
      <p style="color:#6b7280;font-size:14px;">Or copy: <a href="${acceptUrl}">${acceptUrl}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
      <p style="color:#6b7280;font-size:12px;">Best regards,<br>The Carfix-Connect Team</p>
    </div></body></html>`

  const result = await sendMail({
    to: [{ Email: inviteeEmail, Name: inviteeName || inviteeEmail }],
    subject: `You've been invited to join ${companyName} on Carfix-Connect`,
    html,
  })
  console.log('✅ Company invitation email sent:', inviteeEmail)
  return result
}

// ─── 2. Owner registration confirmation ─────────────────────────────────────
export async function sendCompanyRegistrationEmail({
  ownerEmail,
  ownerName,
  companyName,
  registrationNumber,
  companyId,
}) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/company/dashboard`

  const html = `
    <html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#2563eb;">Company Registration Received</h2>
      <p>Dear ${ownerName},</p>
      <p>Thank you for registering <strong>${companyName}</strong> with Carfix-Connect!</p>
      <div style="background:#f3f4f6;padding:15px;border-radius:5px;margin:20px 0;">
        <p style="margin:5px 0;"><strong>Company:</strong> ${companyName}</p>
        ${registrationNumber ? `<p style="margin:5px 0;"><strong>Reg. No.:</strong> ${registrationNumber}</p>` : ''}
        <p style="margin:5px 0;"><strong>Status:</strong> Pending Verification</p>
        <p style="margin:5px 0;"><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      <h3 style="color:#2563eb;">What Happens Next?</h3>
      <ol>
        <li>Our team will review your documents (2–5 business days)</li>
        <li>You'll receive an email once verification is complete</li>
        <li>Upon approval, your team gains full access to all features</li>
      </ol>
      <div style="text-align:center;margin:30px 0;">
        <a href="${dashboardUrl}" style="background:#2563eb;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block;">
          Go to Dashboard
        </a>
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
      <p style="color:#6b7280;font-size:12px;">Best regards,<br>The Carfix-Connect Team</p>
    </div></body></html>`

  const result = await sendMail({
    to: [{ Email: ownerEmail, Name: ownerName }],
    subject: `Company Registration Received – ${companyName}`,
    html,
  })
  console.log('✅ Company registration email sent:', ownerEmail)
  return result
}

// ─── 3. Admin — new company registered alert ─────────────────────────────────
export async function sendAdminNewCompanyEmail({
  adminEmail,
  companyName,
  ownerName,
  ownerEmail,
  registrationNumber,
  companyId,
}) {
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/companies/${companyId}`

  const html = `
    <html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#2563eb;">New Company Registration — Action Required</h2>
      <p>A new company has registered on Carfix-Connect and is awaiting verification.</p>
      <div style="background:#fef9c3;border:1px solid #fde68a;padding:15px;border-radius:5px;margin:20px 0;">
        <p style="margin:5px 0;"><strong>Company Name:</strong> ${companyName}</p>
        ${registrationNumber ? `<p style="margin:5px 0;"><strong>Reg. No.:</strong> ${registrationNumber}</p>` : ''}
        <p style="margin:5px 0;"><strong>Owner:</strong> ${ownerName}</p>
        <p style="margin:5px 0;"><strong>Owner Email:</strong> ${ownerEmail}</p>
        <p style="margin:5px 0;"><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
      </div>
      <div style="text-align:center;margin:30px 0;">
        <a href="${reviewUrl}" style="background:#2563eb;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block;">
          Review Registration
        </a>
      </div>
      <p style="color:#6b7280;font-size:14px;">
        Please log in to the admin panel to review the submitted documents and approve or reject this registration.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
      <p style="color:#6b7280;font-size:12px;">Carfix-Connect Admin System</p>
    </div></body></html>`

  const result = await sendMail({
    to: [{ Email: adminEmail, Name: 'Carfix-Connect Admin' }],
    subject: `New Company Registration: ${companyName} – Pending Review`,
    html,
  })
  console.log('✅ Admin new company email sent:', adminEmail)
  return result
}

// ─── 4. Company approval notification ────────────────────────────────────────
export async function sendCompanyApprovalEmail({
  ownerEmail,
  ownerName,
  companyName,
  companyId,
}) {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/company/dashboard`

  const html = `
    <html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#10b981;">🎉 Your Company Has Been Approved!</h2>
      <p>Congratulations ${ownerName}!</p>
      <p><strong>${companyName}</strong> has been verified and approved on Carfix-Connect.</p>
      <h3 style="color:#2563eb;">You Now Have Full Access To:</h3>
      <ul>
        <li>✓ Complete fleet management</li>
        <li>✓ Service bookings for all vehicles</li>
        <li>✓ Team member management</li>
        <li>✓ Reporting and analytics</li>
        <li>✓ Budget tracking and controls</li>
      </ul>
      <div style="text-align:center;margin:30px 0;">
        <a href="${dashboardUrl}" style="background:#10b981;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block;">
          Go to Dashboard
        </a>
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
      <p style="color:#6b7280;font-size:12px;">Best regards,<br>The Carfix-Connect Team</p>
    </div></body></html>`

  const result = await sendMail({
    to: [{ Email: ownerEmail, Name: ownerName }],
    subject: `🎉 ${companyName} Has Been Approved – Carfix-Connect`,
    html,
  })
  console.log('✅ Company approval email sent:', ownerEmail)
  return result
}