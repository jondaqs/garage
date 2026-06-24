// src/app/api/payments/mpesa/status/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
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
 * POST /api/payments/mpesa/status
 *
 * Frontend polls this after initiating STK push.
 * Returns the current transaction status.
 *
 * KEY FIX: When status is still 'pending' and >10 seconds have elapsed,
 * actively queries Safaricom's STK Query API instead of passively waiting
 * for the callback. This handles cases where the callback is blocked by
 * IP whitelisting, HMAC verification, or network issues.
 *
 * Also retries processing for 'callback_received' transactions that got
 * stuck (e.g. processVerifiedMpesaPayment failed on first attempt).
 *
 * Body: { checkoutRequestId } or { transactionId }
 */
export async function POST(request) {
  try {
    // Auth
    const authClient = await createClient()
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { checkoutRequestId, transactionId } = body

    if (!checkoutRequestId && !transactionId) {
      return NextResponse.json({ error: 'checkoutRequestId or transactionId required' }, { status: 400 })
    }

    const sc = getServiceClient()

    let query = sc.from('mpesa_transactions').select(
      'id, status, result_code, result_desc, mpesa_receipt_number, amount, verified_at, subscription_payment_id, checkout_request_id, created_at'
    )

    if (checkoutRequestId) {
      query = query.eq('checkout_request_id', checkoutRequestId)
    } else {
      query = query.eq('id', transactionId)
    }

    const { data: tx, error: txErr } = await query.single()

    if (txErr || !tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // ── Active verification for stuck transactions ──────────────

    // Case 1: Still 'pending' after 10+ seconds → query Safaricom directly
    if (tx.status === 'pending' && tx.checkout_request_id) {
      const ageMs = Date.now() - new Date(tx.created_at).getTime()

      if (ageMs > 10_000) {
        try {
          const stkResult = await queryStkStatus(tx.checkout_request_id)

          if (stkResult.success) {
            // Safaricom confirms payment — process it now (callback was missed)
            // Note: STK Query API does NOT return the M-Pesa receipt number —
            // that only comes via the callback payload. We proceed without it;
            // if the callback arrives later it will update the receipt number.
            console.info(`[mpesa-status] Active verify: payment confirmed for ${tx.checkout_request_id}`)

            // Update transaction to callback_received first
            await sc.from('mpesa_transactions').update({
              status: 'callback_received',
              result_code: 0,
              result_desc: 'Verified via active STK query (callback missed)',
              updated_at: new Date().toISOString(),
            }).eq('id', tx.id)

            // Process the payment
            const payResult = await processVerifiedMpesaPayment(tx.id)

            if (payResult.success) {
              console.info(`[mpesa-status] Active verify: payment processed for ${tx.id}`)
              // Re-fetch to return updated status
              const { data: updated } = await sc.from('mpesa_transactions')
                .select('id, status, result_desc, mpesa_receipt_number, amount, verified_at, subscription_payment_id')
                .eq('id', tx.id).single()

              // Get payment reference as fallback when M-Pesa receipt is unavailable
              let paymentRef = null
              if (updated?.subscription_payment_id) {
                const { data: payment } = await sc.from('subscription_payments')
                  .select('payment_ref_id')
                  .eq('id', updated.subscription_payment_id)
                  .single()
                paymentRef = payment?.payment_ref_id || null
              }

              if (updated) {
                return NextResponse.json({
                  transactionId: updated.id,
                  status: updated.status,
                  resultDesc: updated.result_desc,
                  mpesaReceipt: updated.mpesa_receipt_number || paymentRef,
                  amount: updated.amount,
                  verifiedAt: updated.verified_at,
                  paymentRecorded: !!updated.subscription_payment_id,
                })
              }
            } else {
              console.warn(`[mpesa-status] Active verify: processing failed for ${tx.id}:`, payResult.error)
              // Return callback_received so frontend knows it's progressing
              return NextResponse.json({
                transactionId: tx.id,
                status: 'callback_received',
                resultDesc: 'Payment received, processing...',
                mpesaReceipt: null,
                amount: tx.amount,
                verifiedAt: null,
                paymentRecorded: false,
              })
            }
          } else if (stkResult.resultCode === 1032) {
            // User cancelled the STK prompt
            await sc.from('mpesa_transactions').update({
              status: 'failed',
              result_code: 1032,
              result_desc: 'Request cancelled by user',
              updated_at: new Date().toISOString(),
            }).eq('id', tx.id)

            return NextResponse.json({
              transactionId: tx.id,
              status: 'failed',
              resultDesc: 'Request cancelled by user',
              mpesaReceipt: null,
              amount: tx.amount,
              verifiedAt: null,
              paymentRecorded: false,
            })
          } else if (stkResult.resultCode === 1037 || stkResult.resultCode === 1) {
            // 1037 = timeout (user didn't respond), 1 = insufficient funds / general fail
            await sc.from('mpesa_transactions').update({
              status: 'failed',
              result_code: stkResult.resultCode,
              result_desc: stkResult.resultDesc || 'Payment not completed',
              updated_at: new Date().toISOString(),
            }).eq('id', tx.id)

            return NextResponse.json({
              transactionId: tx.id,
              status: 'failed',
              resultDesc: stkResult.resultDesc || 'Payment not completed',
              mpesaReceipt: null,
              amount: tx.amount,
              verifiedAt: null,
              paymentRecorded: false,
            })
          }
          // For other result codes (or if query itself failed), fall through
          // and return current DB status — next poll will try again
        } catch (queryErr) {
          console.warn(`[mpesa-status] STK query error for ${tx.checkout_request_id}:`, queryErr.message)
          // Fall through — return current DB status
        }
      }
    }

    // Case 2: Stuck at 'callback_received' for >5 seconds → retry processing
    if (tx.status === 'callback_received') {
      try {
        const payResult = await processVerifiedMpesaPayment(tx.id)

        if (payResult.success) {
          console.info(`[mpesa-status] Retry processing succeeded for ${tx.id}`)
          const { data: updated } = await sc.from('mpesa_transactions')
            .select('id, status, result_desc, mpesa_receipt_number, amount, verified_at, subscription_payment_id')
            .eq('id', tx.id).single()

          // Get payment reference as fallback
          let paymentRef = null
          if (updated?.subscription_payment_id) {
            const { data: payment } = await sc.from('subscription_payments')
              .select('payment_ref_id')
              .eq('id', updated.subscription_payment_id)
              .single()
            paymentRef = payment?.payment_ref_id || null
          }

          if (updated) {
            return NextResponse.json({
              transactionId: updated.id,
              status: updated.status,
              resultDesc: updated.result_desc,
              mpesaReceipt: updated.mpesa_receipt_number || paymentRef,
              amount: updated.amount,
              verifiedAt: updated.verified_at,
              paymentRecorded: !!updated.subscription_payment_id,
            })
          }
        }
        // If retry also failed, fall through and return callback_received
      } catch (retryErr) {
        console.warn(`[mpesa-status] Retry processing error for ${tx.id}:`, retryErr.message)
      }
    }

    // ── Return current status from DB ───────────────────────────
    // Include payment ref fallback for verified transactions without M-Pesa receipt
    let fallbackReceipt = null
    if (tx.status === 'verified' && !tx.mpesa_receipt_number && tx.subscription_payment_id) {
      const { data: payment } = await sc.from('subscription_payments')
        .select('payment_ref_id')
        .eq('id', tx.subscription_payment_id)
        .single()
      fallbackReceipt = payment?.payment_ref_id || null
    }

    return NextResponse.json({
      transactionId: tx.id,
      status: tx.status,
      resultDesc: tx.result_desc,
      mpesaReceipt: tx.status === 'verified' ? (tx.mpesa_receipt_number || fallbackReceipt) : null,
      amount: tx.amount,
      verifiedAt: tx.verified_at,
      paymentRecorded: !!tx.subscription_payment_id,
    })
  } catch (err) {
    console.error('[mpesa-status] error:', err)
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 })
  }
}