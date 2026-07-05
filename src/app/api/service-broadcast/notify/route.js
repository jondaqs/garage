/**
 * POST /api/service-broadcast/notify
 *
 * Handles all broadcast notification types in one route.
 * Body.type determines the flow:
 *   'new_broadcast'     — notify providers about a new service request
 *   'new_response'      — notify poster about a provider response
 *   'award'             — notify winning provider + rejected providers
 *
 * Body: { type, broadcast_id, broadcast_number, broadcast_title,
 *         poster_name, provider_name, response_id, ... }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'
import { sendAndQueueSms, normalisePhone }     from '@/lib/sms/transport'
import { commsLimiter } from '@/lib/rateLimiters'

const BRAND   = 'Carfix-Connect'
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com'

function sc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getProfile(supabase, userId) {
  const { data } = await supabase.from('user_profiles_secure')
    .select('first_name, last_name, email, phone').eq('id', userId).maybeSingle()
  if (!data) return null
  return {
    name: data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'there',
    email: data.email, phone: data.phone,
  }
}

function buildEmailHtml({ recipientName, subject, bodyText, ctaLabel, ctaUrl, accentColor }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:${accentColor || '#0f172a'};padding:24px 32px;text-align:center;">
    <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#fff;">${BRAND}</p>
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);">Service Marketplace</p>
  </td></tr>
  <tr><td style="height:3px;background:${accentColor || '#0f172a'};"></td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">${bodyText}</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${ctaUrl}" style="display:inline-block;background:${accentColor || '#0f172a'};color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">${ctaLabel}</a>
    </div>
  </td></tr>
</table>
</td></tr></table></body></html>`
}

export async function POST(req) {
  const limited = commsLimiter.check(req)
  if (limited) return limited

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const s = sc()
    const results = { emails_sent: 0, sms_sent: 0 }

    if (body.type === 'new_broadcast') {
      // Notify active provider owners about a new broadcast
      const { data: providers } = await s.from('service_providers')
        .select('owner_user_id').eq('is_active', true)
      const ownerIds = [...new Set((providers || []).map(p => p.owner_user_id).filter(Boolean))]

      for (const ownerId of ownerIds.slice(0, 50)) { // cap at 50 to avoid timeout
        const p = await getProfile(s, ownerId)
        if (!p) continue
        if (p.email) {
          try {
            await sendAndQueueEmail(s, {
              to: [{ Email: p.email, Name: p.name }],
              subject: `[${BRAND}] New Service Request: ${body.broadcast_title}`,
              html: buildEmailHtml({
                recipientName: p.name,
                bodyText: `A new service request has been posted: <strong>"${body.broadcast_title}"</strong>. Browse the details and submit your proposal if interested.`,
                ctaLabel: 'View Request', ctaUrl: `${APP_URL()}/provider/service-marketplace?view=browse&broadcast=${body.broadcast_id}`,
                accentColor: '#059669',
              }),
              text: `${BRAND}: New service request "${body.broadcast_title}". View and respond: ${APP_URL()}/provider/service-marketplace`,
              referenceTable: 'service_broadcasts', referenceId: body.broadcast_id,
            })
            results.emails_sent++
          } catch (e) { console.error('[broadcast-notify] email failed:', e.message) }
        }
      }

    } else if (body.type === 'new_response') {
      // Notify poster about a new response
      const { data: broadcast } = await s.from('service_broadcasts')
        .select('posted_by, poster_type').eq('id', body.broadcast_id).maybeSingle()
      if (broadcast) {
        const p = await getProfile(s, broadcast.posted_by)
        if (p?.email) {
          const subPage = broadcast.poster_type === 'company' ? 'company' : broadcast.poster_type === 'service_provider' ? 'provider' : 'dashboard'
          try {
            await sendAndQueueEmail(s, {
              to: [{ Email: p.email, Name: p.name }],
              subject: `[${BRAND}] New Response to Your Request — ${body.broadcast_number}`,
              html: buildEmailHtml({
                recipientName: p.name,
                bodyText: `<strong>${body.provider_name}</strong> has responded to your service request "<strong>${body.broadcast_title}</strong>". Review their proposal and respond.`,
                ctaLabel: 'Review Response', ctaUrl: `${APP_URL()}/${subPage}/service-requests?broadcast=${body.broadcast_id}`,
                accentColor: '#2563eb',
              }),
              text: `${BRAND}: ${body.provider_name} responded to "${body.broadcast_title}". Review: ${APP_URL()}/${subPage}/service-requests`,
              referenceTable: 'service_broadcast_responses', referenceId: body.response_id,
            })
            results.emails_sent++
          } catch (e) { console.error('[broadcast-notify] response email failed:', e.message) }
        }
      }

    } else if (body.type === 'award') {
      // Notify winning provider (email + SMS)
      if (body.winner_provider_id) {
        const { data: provider } = await s.from('service_providers')
          .select('owner_user_id').eq('id', body.winner_provider_id).maybeSingle()
        if (provider?.owner_user_id) {
          const p = await getProfile(s, provider.owner_user_id)
          const detailsUrl = `${APP_URL()}/provider/service-marketplace?view=responses&response=${body.response_id}`
          if (p?.email) {
            try {
              await sendAndQueueEmail(s, {
                to: [{ Email: p.email, Name: p.name }],
                subject: `[${BRAND}] You've been selected! — ${body.broadcast_number}`,
                html: buildEmailHtml({
                  recipientName: p.name,
                  bodyText: `Congratulations! Your proposal for "<strong>${body.broadcast_title}</strong>" has been accepted. View the request to see the requester's contact details and start a conversation.`,
                  ctaLabel: 'View Details & Chat', ctaUrl: detailsUrl,
                  accentColor: '#059669',
                }),
                text: `${BRAND}: Your proposal for "${body.broadcast_title}" was accepted! View requester details and chat: ${detailsUrl}`,
                referenceTable: 'service_broadcasts', referenceId: body.broadcast_id,
              })
              results.emails_sent++
            } catch (e) { console.error('[broadcast-notify] award email failed:', e.message) }
          }
          if (p?.phone) {
            try {
              const normalised = normalisePhone(p.phone)
              if (normalised) {
                await sendAndQueueSms(s, {
                  to: normalised,
                  message: `${BRAND}: Your proposal for "${body.broadcast_title}" (${body.broadcast_number}) was accepted! View details: ${detailsUrl}`,
                  referenceTable: 'service_broadcasts', referenceId: body.broadcast_id,
                })
                results.sms_sent++
              }
            } catch (e) { console.error('[broadcast-notify] award SMS failed:', e.message) }
          }
        }
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err) {
    console.error('[broadcast-notify] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}