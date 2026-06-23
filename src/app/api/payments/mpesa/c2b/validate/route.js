// src/app/api/payments/mpesa/c2b/validate/route.js

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isValidSafaricomIP, getClientIp, extractForensicHeaders } from '@/lib/mpesa/security'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/payments/mpesa/c2b/validate
 *
 * Safaricom calls this BEFORE processing a C2B (Paybill) payment.
 * Return ResultCode 0 to accept, 1 to reject.
 *
 * We validate:
 *   1. IP whitelist
 *   2. Account reference matches a real unpaid invoice
 *   3. Amount is > 0
 */
export async function POST(request) {
  const clientIp = getClientIp(request)

  try {
    if (!isValidSafaricomIP(request)) {
      console.warn(`[c2b-validate] Rejected: IP ${clientIp} not in whitelist`)
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Rejected' })
    }

    const body = await request.json()
    const sc = getServiceClient()

    // Log raw callback
    await sc.from('mpesa_callback_logs').insert({
      callback_type: 'c2b_validation',
      raw_body: body,
      source_ip: clientIp,
      headers: extractForensicHeaders(request),
      processed: false,
    })

    const {
      TransAmount,
      BillRefNumber,
      MSISDN,
    } = body

    const amount = Number(TransAmount)
    if (!amount || amount <= 0) {
      console.warn('[c2b-validate] Invalid amount:', TransAmount)
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid amount' })
    }

    // Match BillRefNumber to an invoice
    const accountRef = (BillRefNumber || '').trim().toUpperCase()
    if (!accountRef) {
      console.warn('[c2b-validate] Empty account reference from', MSISDN)
      // Accept anyway — user might have typed wrong ref, we'll handle in confirmation
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // Try to find matching invoice
    const { data: invoice } = await sc
      .from('subscription_invoice_details')
      .select('id, invoice_ref_no, total_amount, balance_due, paid_at')
      .or(`invoice_ref_no.ilike.%${accountRef}%`)
      .is('paid_at', null)
      .limit(1)
      .maybeSingle()

    if (invoice) {
      console.info(`[c2b-validate] Matched invoice ${invoice.invoice_ref_no} for ${amount} from ${MSISDN}`)
    } else {
      console.warn(`[c2b-validate] No matching invoice for ref "${accountRef}" from ${MSISDN} — accepting for manual matching`)
    }

    // Accept the payment — even if no invoice match, we'll reconcile manually
    // Rejecting would lose the payment and frustrate the customer
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    console.error('[c2b-validate] error:', err)
    // Accept on error — better to receive the payment and reconcile later
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}