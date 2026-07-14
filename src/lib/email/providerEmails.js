/**
 * lib/email/providerEmails.js
 * ───────────────────────────
 * Provider registration-related outgoing emails.
 *
 *  sendProviderRejectionEmail — to the provider owner when their application is rejected
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