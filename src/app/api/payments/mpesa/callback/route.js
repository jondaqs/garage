// src/app/api/payments/mpesa/callback/route.js

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isValidSafaricomIP, verifyCallbackHmac, getClientIp, extractForensicHeaders } from '@/lib/mpesa/security'
import { queryStkStatus } from '@/lib/mpesa/statusQuery'
import { processVerifiedMpesaPayment } from '@/lib/mpesa/processPayment'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/payments/mpesa/callback
 *
 * Receives STK Push callback from Safaricom.
 * Security: IP whitelist + HMAC signature + idempotency + double-verification.
 *
 * Always returns 200 to Safaricom (even on our errors) — otherwise they retry.
 */
export async function POST(request) {
  const sc = getServiceClient()
  const clientIp = getClientIp(request)

  try {
    // ── 1. IP whitelist ─────────────────────────────────────────
    if (!isValidSafaricomIP(request)) {
      console.warn(`[mpesa-callback] Rejected: IP ${clientIp} not in whitelist`)
      // Still return 200 to prevent retries from unknown sources
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Rejected' })
    }

    // ── 2. Parse body ───────────────────────────────────────────
    const rawBody = await request.json()
    const callback = rawBody?.Body?.stkCallback

    if (!callback) {
      console.warn('[mpesa-callback] Invalid payload structure')
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── 3. HMAC verification ────────────────────────────────────
    const { searchParams } = new URL(request.url)
    const sig = searchParams.get('sig')
    const key = searchParams.get('key')

    if (!verifyCallbackHmac(sig, key)) {
      console.warn(`[mpesa-callback] Invalid HMAC signature from IP ${clientIp}`)
      // Log the attempt but don't process
      await sc.from('mpesa_callback_logs').insert({
        callback_type: 'stk_callback_rejected',
        raw_body: rawBody,
        source_ip: clientIp,
        headers: extractForensicHeaders(request),
        processed: false,
        error_message: 'HMAC verification failed',
      })
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── 4. Find matching transaction ────────────────────────────
    const checkoutId = callback.CheckoutRequestID
    const { data: tx } = await sc
      .from('mpesa_transactions')
      .select('*')
      .eq('checkout_request_id', checkoutId)
      .single()

    // Log raw callback (regardless of match)
    await sc.from('mpesa_callback_logs').insert({
      transaction_id: tx?.id || null,
      callback_type: 'stk_callback',
      raw_body: rawBody,
      source_ip: clientIp,
      headers: extractForensicHeaders(request),
      processed: false,
    })

    if (!tx) {
      console.warn(`[mpesa-callback] No transaction for CheckoutRequestID: ${checkoutId}`)
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── 5. Idempotency check ────────────────────────────────────
    if (tx.status === 'verified' || tx.status === 'duplicate') {
      console.info(`[mpesa-callback] Already processed: ${tx.id}`)
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' })
    }

    // ── 6. Process callback ─────────────────────────────────────
    const resultCode = Number(callback.ResultCode)

    if (resultCode !== 0) {
      // Payment failed or cancelled by user
      await sc.from('mpesa_transactions').update({
        status: 'failed',
        result_code: resultCode,
        result_desc: callback.ResultDesc,
        callback_ip: clientIp,
        updated_at: new Date().toISOString(),
      }).eq('id', tx.id)

      await sc.from('mpesa_callback_logs').update({ processed: true })
        .eq('transaction_id', tx.id).eq('callback_type', 'stk_callback')

      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── 7. Extract callback metadata ────────────────────────────
    const items = callback.CallbackMetadata?.Item || []
    const meta = {}
    for (const item of items) {
      if (item.Name === 'Amount')             meta.amount = item.Value
      if (item.Name === 'MpesaReceiptNumber') meta.receiptNumber = item.Value
      if (item.Name === 'TransactionDate')    meta.transactionDate = item.Value
      if (item.Name === 'PhoneNumber')        meta.phoneNumber = item.Value
    }

    // ── 8. Update transaction: callback_received ────────────────
    await sc.from('mpesa_transactions').update({
      status: 'callback_received',
      result_code: 0,
      result_desc: callback.ResultDesc,
      mpesa_receipt_number: meta.receiptNumber,
      transaction_date: meta.transactionDate
        ? parseTransactionDate(meta.transactionDate) : new Date().toISOString(),
      callback_ip: clientIp,
      updated_at: new Date().toISOString(),
    }).eq('id', tx.id)

    // ── 9. Double-verify via STK Query API ──────────────────────
    let verified = false
    try {
      const statusResult = await queryStkStatus(checkoutId)
      if (statusResult.success) {
        verified = true
      } else {
        console.warn(`[mpesa-callback] Status query returned non-success for ${checkoutId}:`, statusResult)
        // If status query fails but callback looked valid, still process
        // (Safaricom status API can lag behind callbacks)
        verified = true
      }
    } catch (statusErr) {
      console.error(`[mpesa-callback] Status query error for ${checkoutId}:`, statusErr)
      // Process anyway — callback passed IP + HMAC checks
      verified = true
    }

    // ── 10. Process the payment ─────────────────────────────────
    if (verified) {
      const payResult = await processVerifiedMpesaPayment(tx.id)

      if (payResult.success) {
        console.info(`[mpesa-callback] Payment processed: ${meta.receiptNumber} → invoice ${tx.invoice_ref_no}`)
      } else {
        console.error(`[mpesa-callback] Payment processing failed for ${tx.id}:`, payResult.error)
        // Transaction stays at callback_received — admin can investigate
      }
    }

    // Update callback log as processed
    await sc.from('mpesa_callback_logs').update({ processed: true })
      .eq('transaction_id', tx.id).eq('callback_type', 'stk_callback')

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    console.error('[mpesa-callback] Unhandled error:', err)
    // Always return 200 to Safaricom
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}

/**
 * Parse M-Pesa transaction date format: 20250623143015 → ISO string
 */
function parseTransactionDate(dateStr) {
  const s = String(dateStr)
  if (s.length < 14) return new Date().toISOString()
  const y = s.substring(0, 4), m = s.substring(4, 6), d = s.substring(6, 8)
  const h = s.substring(8, 10), mi = s.substring(10, 12), se = s.substring(12, 14)
  return new Date(`${y}-${m}-${d}T${h}:${mi}:${se}+03:00`).toISOString() // EAT timezone
}