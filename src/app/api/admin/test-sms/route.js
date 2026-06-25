/**
 * POST /api/admin/test-sms
 * ────────────────────────
 * Diagnostic endpoint: checks AT config, normalises a phone number,
 * sends a test SMS, queues the result, and returns a step-by-step report.
 *
 * Body: { "phone": "07XXXXXXXX" }
 *
 * Admin-only — uses the same user_roles check as other admin routes.
 * Location: src/app/api/admin/test-sms/route.js
 */

import { createClient }                         from '@/lib/supabase/server'
import { createClient as createServiceClient }   from '@supabase/supabase-js'
import { NextResponse }                          from 'next/server'
import { normalisePhone, sendSms, queueSmsRecord, markSmsQueued } from '@/lib/sms/transport'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

export async function POST(request) {
  const steps = []
  const log = (step, ok, detail) => {
    steps.push({ step, ok, detail })
    console.log(`[test-sms] ${ok ? '✓' : '✗'} ${step}: ${detail}`)
  }

  try {
    // ── 1. Auth check (same pattern as ban-user, mpesa-config, etc.) ───────
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: callerProfile } = await supabase
      .from('user_profiles_secure')
      .select('id, user_roles(role:user_roles_lookup(code))')
      .eq('auth_user_id', session.user.id)
      .single()

    const codes = callerProfile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []
    if (!codes.includes('admin') && !codes.includes('platform_admin')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
    log('1. Auth', true, `Admin verified (roles: ${codes.join(', ')})`)

    // ── 2. Read request body ───────────────────────────────────────────────
    const body = await request.json().catch(() => ({}))
    const rawPhone = body.phone

    if (!rawPhone) {
      log('2. Input', false, 'No "phone" field in request body')
      return NextResponse.json({ steps }, { status: 400 })
    }
    log('2. Input', true, `Raw phone: "${rawPhone}"`)

    // ── 3. Normalise phone ─────────────────────────────────────────────────
    const phone = normalisePhone(rawPhone)
    if (!phone) {
      log('3. Normalise', false, `Could not normalise "${rawPhone}" to E.164`)
      return NextResponse.json({ steps }, { status: 400 })
    }
    log('3. Normalise', true, `Normalised to ${phone}`)

    // ── 4. Check env vars ──────────────────────────────────────────────────
    const envReport = {
      AT_API_KEY:   !!process.env.AT_API_KEY,
      AT_USERNAME:  !!process.env.AT_USERNAME,
      AT_SENDER_ID: process.env.AT_SENDER_ID || '(not set — will use default)',
      AT_SANDBOX:   process.env.AT_SANDBOX || '(not set — defaults to production)',
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }

    if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
      log('4. Env vars', false, JSON.stringify(envReport))
      return NextResponse.json({
        steps,
        fix: 'Set AT_API_KEY and AT_USERNAME in Vercel → Settings → Environment Variables, then redeploy.',
      }, { status: 500 })
    }
    log('4. Env vars', true, JSON.stringify(envReport))

    // ── 5. Determine mode ──────────────────────────────────────────────────
    const isSandbox = process.env.AT_SANDBOX === 'true'
    const baseUrl = isSandbox
      ? 'https://api.sandbox.africastalking.com/version1'
      : 'https://api.africastalking.com/version1'
    log('5. Mode', true, isSandbox
      ? `SANDBOX mode → ${baseUrl} (messages will NOT be delivered to real phones)`
      : `PRODUCTION mode → ${baseUrl} (messages WILL be delivered)`)

    // ── 6. Queue record (sms_queue) ────────────────────────────────────────
    const sc = getServiceClient()
    const testMessage = `Motiifix TEST: If you received this, your SMS is working! Sent at ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`
    let queueId = null

    if (sc) {
      queueId = await queueSmsRecord(sc, {
        recipientPhone: phone,
        message: testMessage,
        status: 'pending',
      })
      log('6. Queue', !!queueId, queueId
        ? `Queued in sms_queue (id: ${queueId})`
        : 'Insert into sms_queue failed — check RLS policies or table schema')
    } else {
      log('6. Queue', false, 'No SUPABASE_SERVICE_ROLE_KEY — cannot queue. SMS will still attempt.')
    }

    // ── 7. Send SMS via Africa's Talking ───────────────────────────────────
    try {
      const results = await sendSms({ to: phone, message: testMessage })
      const first = results[0] || {}

      if (first.status === 'Success') {
        log('7. Send', true, `Delivered! messageId=${first.messageId}, cost=${first.cost}, number=${first.number}`)
      } else {
        log('7. Send', false, `AT returned status="${first.status}" for ${first.number}. messageId=${first.messageId}`)
      }

      // ── 8. Update queue record ─────────────────────────────────────────
      if (sc && queueId) {
        await markSmsQueued(sc, queueId, {
          status:       first.status === 'Success' ? 'sent' : 'failed',
          sentAt:       first.status === 'Success' ? new Date().toISOString() : null,
          messageId:    first.messageId,
          cost:         first.cost,
          errorMessage: first.status !== 'Success' ? first.status : null,
        })
        log('8. Queue update', true, `sms_queue record updated to "${first.status === 'Success' ? 'sent' : 'failed'}"`)
      }

      return NextResponse.json({
        success: first.status === 'Success',
        steps,
        atResponse: results,
      })
    } catch (sendErr) {
      log('7. Send', false, `Send threw: ${sendErr.message}`)

      if (sc && queueId) {
        await markSmsQueued(sc, queueId, {
          status: 'failed',
          errorMessage: sendErr.message,
        })
      }

      return NextResponse.json({
        success: false,
        steps,
        error: sendErr.message,
        fix: sendErr.message.includes('credentials')
          ? 'Double-check AT_API_KEY and AT_USERNAME in Vercel.'
          : sendErr.message.includes('HTTP 4')
            ? 'Africa\'s Talking rejected the request — check API key, username, and sender ID.'
            : 'Network error — check if api.africastalking.com is reachable from your host.',
      }, { status: 500 })
    }
  } catch (err) {
    log('0. Unexpected', false, err.message)
    return NextResponse.json({ steps, error: err.message }, { status: 500 })
  }
}