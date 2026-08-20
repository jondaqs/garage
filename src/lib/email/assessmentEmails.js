/**
 * lib/email/assessmentEmails.js
 * ─────────────────────────────
 * Email notification for assessment invitations.
 *
 *  sendAssessmentInviteEmail — to the invited candidate
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'
import { escapeHtml } from '@/lib/validation'
const h = (v) => escapeHtml(v ?? '') 

const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com'
const BRAND_NAME = 'Carfix-Connect'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : null


// ─── Assessment invitation email ─────────────────────────────────────────────

export async function sendAssessmentInviteEmail(supabase, {
  to,
  assessmentId,
  assessmentName,
  description,
  timeLimitMins,
  opensAt,
  closesAt,
  customSubject,
  customBody,
}) {
  const appUrl = APP_URL()
  const assessmentLink = `${appUrl}/careers/assessment?id=${assessmentId}`
  const signupLink = `${appUrl}/auth/signup`
  const name = h(assessmentName)
  const desc = h(description)
  const opens = fmtDate(opensAt)
  const closes = fmtDate(closesAt)

  const subject = customSubject || `You're invited to take the ${assessmentName}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5;
    }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 40px 30px; text-align: center; }
    .content { padding: 40px 30px; }
    .button {
      display: inline-block; background-color: #2563eb; color: white !important;
      padding: 16px 40px; text-decoration: none; border-radius: 8px;
      margin: 10px 0; font-weight: 600; font-size: 16px;
    }
    .button-secondary {
      display: inline-block; background-color: #6b7280; color: white !important;
      padding: 12px 30px; text-decoration: none; border-radius: 8px;
      margin: 10px 0; font-weight: 500; font-size: 14px;
    }
    .info { background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .footer { text-align: center; padding: 30px; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
    .schedule { margin: 0; padding: 0; list-style: none; }
    .schedule li { padding: 4px 0; }
    .schedule strong { display: inline-block; width: 70px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">📝 Assessment Invitation</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">You've been invited to take an assessment</p>
    </div>

    <div class="content">
      <h2 style="color: #1f2937;">Hello!</h2>

      <p style="font-size: 16px;">
        You have been invited to complete the
        <strong style="color: #2563eb;">${name}</strong>
        assessment on ${BRAND_NAME}.
      </p>

      ${desc ? `<p style="color: #4b5563;">${desc}</p>` : ''}

      <div class="info">
        ${opens || closes ? `
        <ul class="schedule">
          ${opens ? `<li><strong>Opens:</strong> ${opens}</li>` : ''}
          ${closes ? `<li><strong>Closes:</strong> ${closes}</li>` : ''}
        </ul>` : ''}
        <p style="margin: ${opens || closes ? '10px' : '0'} 0 0 0;">
          <strong>Duration:</strong> ${timeLimitMins || '—'} minutes
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${assessmentLink}" class="button">Start Assessment</a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        If the button above doesn't work, copy and paste this link into your browser:<br>
        <a href="${assessmentLink}" style="color: #2563eb; word-break: break-all;">${assessmentLink}</a>
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

      <p style="color: #4b5563;">
        <strong>Don't have an account yet?</strong><br>
        Register first using this same email address so your invitation is linked automatically.
      </p>

      <div style="text-align: center;">
        <a href="${signupLink}" class="button-secondary">Create Account</a>
      </div>
    </div>

    <div class="footer">
      <p>If you didn't expect this invitation, you can safely ignore this email.</p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
        This is an automated message from ${BRAND_NAME}
      </p>
    </div>
  </div>
</body>
</html>`

  const text = `ASSESSMENT INVITATION
${'─'.repeat(40)}

Hello!

You have been invited to complete the "${assessmentName}" assessment on ${BRAND_NAME}.

${description ? description + '\n' : ''}${opens ? `Opens:    ${opens}\n` : ''}${closes ? `Closes:   ${closes}\n` : ''}Duration: ${timeLimitMins || '—'} minutes

To begin, visit:
${assessmentLink}

If you don't have a ${BRAND_NAME} account yet, register at:
${signupLink}
Use this same email address when signing up so your invitation is linked automatically.

Good luck!

${'─'.repeat(40)}
This is an automated message from ${BRAND_NAME}`

  return sendAndQueueEmail(supabase, {
    to,
    subject,
    html,
    text,
    referenceTable: 'assessment_invitations',
    referenceId:    assessmentId,
  })
}