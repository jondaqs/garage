/**
 * lib/email/providerEmails.js
 * ───────────────────────────
 * Provider registration-related outgoing emails.
 *
 *  sendProviderApprovalEmail    — when application is approved
 *  sendProviderRejectionEmail   — when application is rejected
 *  sendProviderInfoRequestEmail — when admin requests additional info
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueEmail } from './transport.js'
import { escapeHtml } from '@/lib/validation'
const h = (v) => escapeHtml(v ?? '')

const APP_URL    = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND_NAME = 'Carfix-Connect'

// ─── Provider rejection email ────────────────────────────────────────────────

export async function sendProviderRejectionEmail(supabase, {
  to,
  ownerName,
  providerName,
  rejectionReason,
}) {
  if (!to) return { sent: false, skipped: true, reason: 'no email' }

  const reapplyUrl = `${APP_URL()}/provider/settings`

  const subject = `Application Update — ${providerName || 'Your Provider Application'}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #16a34a; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 18px; color: #fff;">${h(BRAND_NAME)}</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 16px; font-size: 15px;">
          Hi ${h(ownerName || 'there')},
        </p>
        <p style="margin: 0 0 16px; font-size: 15px;">
          Thank you for your interest in joining ${h(BRAND_NAME)} as a service provider.
          After reviewing your application for <strong>${h(providerName || 'your business')}</strong>,
          we were unable to approve it at this time.
        </p>

        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #991b1b;">Reason</p>
          <p style="margin: 0; font-size: 14px; color: #7f1d1d;">${h(rejectionReason)}</p>
        </div>

        <p style="margin: 0 0 16px; font-size: 15px;">
          You are welcome to update your details and resubmit for review.
          If you believe this was an error or have questions, please reply to this email
          or contact our support team.
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${reapplyUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Update Details &amp; Resubmit
          </a>
        </div>

        <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280;">
          We appreciate your patience and look forward to working with you in the future.
        </p>
      </div>
    </div>
  `

  return sendAndQueueEmail(supabase, {
    to:  [{ Email: to, Name: ownerName || undefined }],
    subject,
    html,
    referenceTable: 'service_providers',
  })
}
// ─── Provider approval email ─────────────────────────────────────────────────

export async function sendProviderApprovalEmail(supabase, {
  to,
  ownerName,
  providerName,
  isReverification = false,
}) {
  if (!to) return { sent: false, skipped: true, reason: 'no email' }

  const dashboardUrl = `${APP_URL()}/provider/dashboard`

  const subject = isReverification
    ? `Profile Update Approved — ${providerName || 'Your Business'}`
    : `Congratulations! ${providerName || 'Your Business'} Is Approved`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #16a34a; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 18px; color: #fff;">${h(BRAND_NAME)}</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 16px; font-size: 15px;">
          Hi ${h(ownerName || 'there')},
        </p>

        ${isReverification ? `
          <p style="margin: 0 0 16px; font-size: 15px;">
            Great news! Your updated business details for <strong>${h(providerName || 'your business')}</strong>
            have been reviewed and approved. The changes are now live on the platform.
          </p>
        ` : `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 0 0 20px; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 22px;">🎉</p>
            <p style="margin: 0; font-size: 16px; font-weight: 600; color: #166534;">
              Your application has been approved!
            </p>
          </div>

          <p style="margin: 0 0 16px; font-size: 15px;">
            <strong>${h(providerName || 'Your business')}</strong> is now live on ${h(BRAND_NAME)}.
            You can start accepting bookings, managing work orders, and connecting with vehicle owners right away.
          </p>
        `}

        <div style="text-align: center; margin: 24px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Go to Your Dashboard
          </a>
        </div>

        <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280;">
          ${isReverification
            ? 'Thank you for keeping your profile up to date.'
            : 'We\'re excited to have you on board. If you have any questions, our support team is here to help.'}
        </p>
      </div>
    </div>
  `

  return sendAndQueueEmail(supabase, {
    to:  [{ Email: to, Name: ownerName || undefined }],
    subject,
    html,
    referenceTable: 'service_providers',
  })
}

// ─── Provider info request email ─────────────────────────────────────────────

export async function sendProviderInfoRequestEmail(supabase, {
  to,
  ownerName,
  providerName,
  infoRequested,
}) {
  if (!to) return { sent: false, skipped: true, reason: 'no email' }

  const settingsUrl = `${APP_URL()}/provider/settings`

  const subject = `Action Required — ${providerName || 'Your Provider Application'}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #16a34a; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 18px; color: #fff;">${h(BRAND_NAME)}</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 16px; font-size: 15px;">
          Hi ${h(ownerName || 'there')},
        </p>
        <p style="margin: 0 0 16px; font-size: 15px;">
          We're reviewing your application for <strong>${h(providerName || 'your business')}</strong>
          and need a bit more information before we can proceed.
        </p>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
          <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #1e40af;">What we need</p>
          <p style="margin: 0; font-size: 14px; color: #1e3a5f; white-space: pre-wrap;">${h(infoRequested)}</p>
        </div>

        <p style="margin: 0 0 16px; font-size: 15px;">
          Please update your provider profile with the requested information and save your changes.
          Your application will automatically be re-queued for review.
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${settingsUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Update Your Profile
          </a>
        </div>

        <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280;">
          If you have questions about this request, please reply to this email or contact our support team.
        </p>
      </div>
    </div>
  `

  return sendAndQueueEmail(supabase, {
    to:  [{ Email: to, Name: ownerName || undefined }],
    subject,
    html,
    referenceTable: 'service_providers',
  })
}