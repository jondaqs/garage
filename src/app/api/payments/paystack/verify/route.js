// src/app/api/payments/paystack/verify/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyTransaction } from '@/lib/paystack/client'
import { processVerifiedCardPayment } from '@/lib/paystack/processPayment'
import { paymentLimiter } from '@/lib/rateLimiters'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/payments/paystack/verify?reference=xxx
 *
 * Paystack redirect callback after payment. Verifies and redirects to dashboard.
 */
export async function GET(request) {
  const limited = paymentLimiter.check(request)
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference') || searchParams.get('trxref')

  if (!reference) {
    return NextResponse.redirect(new URL('/dashboard?payment=error', request.url))
  }

  try {
    const result = await verifyAndProcess(reference)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const redirectPath = result.success
      ? `/dashboard?payment=success&ref=${reference}`
      : `/dashboard?payment=failed&reason=${encodeURIComponent(result.error || 'unknown')}`
    return NextResponse.redirect(new URL(redirectPath, baseUrl || request.url))
  } catch {
    return NextResponse.redirect(new URL('/dashboard?payment=error', request.url))
  }
}

/**
 * POST /api/payments/paystack/verify
 *
 * Frontend calls this after the Paystack popup closes with success.
 * Body: { reference }
 */
export async function POST(request) {
  const limited2 = paymentLimiter.check(request)
  if (limited2) return limited2

  try {
    const authClient = await createClient()
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { reference } = await request.json()
    if (!reference) {
      return NextResponse.json({ error: 'reference is required' }, { status: 400 })
    }

    const result = await verifyAndProcess(reference)

    if (!result.success) {
      return NextResponse.json({ error: result.error, status: result.status }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[paystack] Verify POST error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}

/**
 * Core verify-and-process logic shared by GET and POST handlers.
 */
async function verifyAndProcess(reference) {
  const sc = getServiceClient()

  // 1. Verify with Paystack API
  const verification = await verifyTransaction(reference)

  if (!verification.success) {
    console.warn(`[paystack] Verification failed for ${reference}:`, verification.error)

    try {
      await sc.from('paystack_transactions').update({
        status: 'failed',
        result_message: verification.error || verification.gatewayResponse,
        updated_at: new Date().toISOString(),
      }).eq('reference', reference)
    } catch (e) { console.warn('[paystack] Could not update failed tx:', e.message) }

    return {
      success: false,
      error: verification.error || 'Payment verification failed',
      status: verification.status,
    }
  }

  const tx = verification.data
  const meta = tx.metadata || {}

  // 2. Check idempotency — already processed?
  let existing = null
  try {
    const { data } = await sc.from('paystack_transactions')
      .select('status, subscription_payment_id')
      .eq('reference', reference)
      .single()
    existing = data
  } catch { /* not found or table doesn't exist */ }

  if (existing?.status === 'verified' && existing?.subscription_payment_id) {
    return {
      success: true,
      alreadyProcessed: true,
      reference,
      channel: tx.channel,
      cardLast4: tx.cardLast4,
    }
  }

  // 3. Process the payment
  const invoiceId = meta.invoice_id
  const userId = meta.user_id
  const originalAmount = Number(meta.original_amount)
  const originalCurrency = meta.original_currency || 'KES'
  const exchangeRate = meta.exchange_rate ? Number(meta.exchange_rate) : null

  if (!invoiceId || !userId) {
    console.error(`[paystack] Missing metadata for ${reference}:`, meta)
    return { success: false, error: 'Payment metadata incomplete' }
  }

  // Determine payment amount in invoice currency
  // Use the subtotal (before service fee) for recording against the invoice
  const subtotalKes = meta.subtotal_kes ? Number(meta.subtotal_kes) : tx.amountValue
  let paymentInInvoiceCurrency = subtotalKes
  if (exchangeRate && exchangeRate > 0 && originalCurrency !== 'KES') {
    paymentInInvoiceCurrency = Math.round((subtotalKes / exchangeRate) * 100) / 100
  }

  const payResult = await processVerifiedCardPayment({
    sc,
    invoiceId,
    userId,
    amountInInvoiceCurrency: paymentInInvoiceCurrency,
    transactionRef: reference,
    channel: tx.channel,
    cardLast4: tx.cardLast4,
    cardType: tx.cardType,
    bank: tx.bank,
    paidKes: tx.amountValue,
    exchangeRate,
    paystackReference: reference,
  })

  // 4. Update our tracking record
  try {
    await sc.from('paystack_transactions').update({
      status: payResult.success ? 'verified' : 'processing_failed',
      paystack_reference: reference,
      channel: tx.channel,
      card_last4: tx.cardLast4,
      card_type: tx.cardType,
      paid_at: tx.paidAt,
      subscription_payment_id: payResult.paymentId || null,
      result_message: payResult.success ? 'Payment verified and recorded' : payResult.error,
      updated_at: new Date().toISOString(),
    }).eq('reference', reference)
  } catch (e) { console.warn('[paystack] Could not update tx record:', e.message) }

  if (!payResult.success) {
    return { success: false, error: payResult.error }
  }

  return {
    success: true,
    reference,
    paymentRef: payResult.paymentRef,
    receiptNumber: payResult.receiptNumber,
    channel: tx.channel,
    cardLast4: tx.cardLast4,
    cardType: tx.cardType,
    amountPaid: tx.amountValue,
    currency: tx.currency,
  }
}