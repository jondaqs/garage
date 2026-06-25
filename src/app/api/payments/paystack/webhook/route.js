// src/app/api/payments/paystack/webhook/route.js

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { verifyWebhookSignature, verifyTransaction } from '@/lib/paystack/client'
import { processVerifiedCardPayment } from '@/lib/paystack/processPayment'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/payments/paystack/webhook
 *
 * Receives Paystack webhook events (charge.success, etc.).
 * Safety net for cases where the popup closed before the callback fired.
 */
export async function POST(request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-paystack-signature')

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[paystack-webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(rawBody)

    // Only process successful charges
    if (event.event !== 'charge.success') {
      return NextResponse.json({ received: true })
    }

    const data = event.data
    const reference = data.reference
    const meta = data.metadata || {}

    console.info(`[paystack-webhook] charge.success for ${reference}`)

    const sc = getServiceClient()

    // Check if already processed (idempotency)
    let existing = null
    try {
      const { data: row } = await sc.from('paystack_transactions')
        .select('status')
        .eq('reference', reference)
        .single()
      existing = row
    } catch { /* not found */ }

    if (existing?.status === 'verified') {
      console.info(`[paystack-webhook] Already processed: ${reference}`)
      return NextResponse.json({ received: true })
    }

    // Double-verify with Paystack API
    const verification = await verifyTransaction(reference)
    if (!verification.success) {
      console.warn(`[paystack-webhook] Verification failed for ${reference}:`, verification.error)
      return NextResponse.json({ received: true })
    }

    const tx = verification.data
    const invoiceId = meta.invoice_id
    const userId = meta.user_id
    const exchangeRate = meta.exchange_rate ? Number(meta.exchange_rate) : null

    if (!invoiceId || !userId) {
      console.warn(`[paystack-webhook] Missing metadata for ${reference}`)
      return NextResponse.json({ received: true })
    }

    // Use subtotal (before service fee) for recording against the invoice
    const subtotalKes = meta.subtotal_kes ? Number(meta.subtotal_kes) : tx.amountValue
    let paymentInInvoiceCurrency = subtotalKes
    const originalCurrency = meta.original_currency || 'KES'
    if (exchangeRate && exchangeRate > 0 && originalCurrency !== 'KES') {
      paymentInInvoiceCurrency = Math.round((subtotalKes / exchangeRate) * 100) / 100
    }

    // Process the payment
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

    // Update tracking record
    try {
      await sc.from('paystack_transactions').update({
        status: payResult.success ? 'verified' : 'processing_failed',
        channel: tx.channel,
        card_last4: tx.cardLast4,
        paid_at: tx.paidAt,
        subscription_payment_id: payResult.paymentId || null,
        result_message: payResult.success ? 'Verified via webhook' : payResult.error,
        updated_at: new Date().toISOString(),
      }).eq('reference', reference)
    } catch (e) { console.warn('[paystack-webhook] Could not update tx:', e.message) }

    if (payResult.success) {
      console.info(`[paystack-webhook] Payment processed: ${reference} → ${payResult.paymentRef}`)
    } else {
      console.error(`[paystack-webhook] Processing failed for ${reference}:`, payResult.error)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[paystack-webhook] Error:', err)
    return NextResponse.json({ received: true })
  }
}