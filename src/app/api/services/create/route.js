/**
 * POST /api/services/create
 * Creates a new service with duplicate + similarity check, admin notification.
 * Body: { name, description?, service_provider_id?, force? }
 */

import { createClient }                        from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse }                        from 'next/server'
import { sendAndQueueEmail }                   from '@/lib/email/transport'

const BRAND = 'GariCare'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function findSimilarServices(newName, existingNames) {
  if (!existingNames.length) return []
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      console.warn('ANTHROPIC_API_KEY not set — skipping similarity check')
      return []
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are a duplicate detector for an auto garage service catalog.

New service being added: "${newName}"

Existing services:
${existingNames.slice(0, 200).map((n, i) => `${i + 1}. ${n}`).join('\n')}

List names of any existing services that are the same as, very similar to, or refer to the same thing as "${newName}". Consider synonyms, abbreviations, and variations (e.g. "Oil change" and "Engine oil service" are similar).

Respond ONLY with a JSON array of matching names, e.g. ["Oil change"]. If none match, respond with [].`
        }]
      })
    })
    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'
    const match = text.match(/\[[\s\S]*?\]/)
    return match ? JSON.parse(match[0]) : []
  } catch (e) {
    console.warn('Similarity check failed (non-fatal):', e.message)
    return []
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient()
    const sc       = getServiceClient()
    const body     = await request.json()
    const { name, description, service_provider_id, force = false } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 })
    }

    const cleanName = name.trim()

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── 1. Exact duplicate check ──────────────────────────────────────────────
    const { data: exact } = await sc
      .from('services').select('id, name')
      .ilike('name', cleanName).eq('is_active', true).maybeSingle()

    if (exact) {
      return NextResponse.json({
        error:         `A service named "${exact.name}" already exists.`,
        duplicate:     true,
        existing_id:   exact.id,
        existing_name: exact.name,
      }, { status: 409 })
    }

    // ── 2. Similarity check via Claude ────────────────────────────────────────
    if (!force) {
      const { data: allSvcs } = await sc
        .from('services').select('name').eq('is_active', true)

      const similar = await findSimilarServices(cleanName, (allSvcs || []).map(s => s.name))

      if (similar.length > 0) {
        return NextResponse.json({
          warning: true,
          similar,
          message: `Similar services already exist: ${similar.join(', ')}. Are you sure you want to add "${cleanName}" as a separate service?`,
        })
      }
    }

    // ── 3. Insert service ─────────────────────────────────────────────────────
    const { data: newService, error: svcErr } = await sc
      .from('services')
      .insert({ name: cleanName, description: description?.trim() || null, service_type: 'service', is_active: true })
      .select('id, name').single()

    if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 })

    // ── 4. Link to provider ───────────────────────────────────────────────────
    let providerName = null
    if (service_provider_id) {
      await sc.from('service_provider_services')
        .insert({ service_provider_id, service_id: newService.id, is_active: true })
        .onConflict('service_provider_id,service_id').ignore()

      const { data: prov } = await sc.from('service_providers')
        .select('name').eq('id', service_provider_id).maybeSingle()
      providerName = prov?.name || null
    }

    // ── 5. Admin in-app notification ──────────────────────────────────────────
    sc.from('notifications').insert({
      recipient_type: 'admin', type: 'new_service_added',
      notification_type: 'new_service_added',
      reference_type: 'service', reference_table: 'services', reference_id: newService.id,
      title:   'New Service Added to Catalog',
      message: `"${cleanName}" was added to the service catalog${providerName ? ` by ${providerName}` : ''}.`,
      is_read: false,
    }).then(({ error: ne }) => { if (ne) console.warn('Admin notif failed:', ne.message) })

    // ── 6. Admin email ────────────────────────────────────────────────────────
    const adminEmail = process.env.ADMIN_EMAIL
    if (adminEmail) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;max-width:520px;width:100%;">
  <tr><td style="background:#1e293b;padding:22px 28px;">
    <p style="margin:0;font-size:17px;font-weight:700;color:#fff;">${BRAND} Admin</p>
    <p style="margin:3px 0 0;font-size:12px;color:#94a3b8;">New service added to catalog</p>
  </td></tr>
  <tr><td style="padding:24px;">
    <p style="color:#374151;font-size:14px;margin:0 0 16px;">A new service has been added and requires review for duplicates.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:0 0 16px;">
      <p style="margin:0 0 6px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Service Details</p>
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#111827;">${cleanName}</p>
      ${description ? `<p style="margin:0 0 4px;font-size:13px;color:#374151;">${description.trim()}</p>` : ''}
      ${providerName ? `<p style="margin:0;font-size:12px;color:#6b7280;">Added by: ${providerName}</p>` : ''}
    </div>
    <p style="color:#9ca3af;font-size:11px;margin:0;">Service ID: ${newService.id}</p>
    <p style="color:#6b7280;font-size:12px;margin:12px 0 0;">Please review and deactivate if this is a duplicate or incorrect entry.</p>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:12px 28px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} ${BRAND}</p>
  </td></tr>
</table></td></tr></table></body></html>`

      sendAndQueueEmail(sc, {
        to: [{ Email: adminEmail, Name: 'GariCare Admin' }],
        subject: `New Service Added: "${cleanName}"${providerName ? ` — ${providerName}` : ''}`,
        html,
        text: `New service: "${cleanName}"${description ? `\nDesc: ${description}` : ''}${providerName ? `\nBy: ${providerName}` : ''}\nID: ${newService.id}`,
      }).catch(e => console.warn('Admin email failed:', e.message))
    }

    return NextResponse.json({ success: true, service_id: newService.id, name: newService.name })

  } catch (err) {
    console.error('POST /api/services/create error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}