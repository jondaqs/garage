// src/lib/mpesa/processPayment.js

import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Process a verified M-Pesa payment:
 * 1. Validate amount against invoice
 * 2. Record payment via record_subscription_payment RPC
 * 3. Link the subscription_payment to the mpesa_transaction
 *
 * Called after double-verification (callback + status query).
 *
 * @param {string} transactionId — mpesa_transactions.id
 * @returns {Object} { success, paymentId?, error? }
 */
export async function processVerifiedMpesaPayment(transactionId) {
  const sc = getServiceClient()

  // 1. Load the M-Pesa transaction
  const { data: tx, error: txErr } = await sc
    .from('mpesa_transactions')
    .select('*')
    .eq('id', transactionId)
    .single()

  if (txErr || !tx) {
    return { success: false, error: 'Transaction not found' }
  }

  if (tx.status === 'verified') {
    return { success: false, error: 'Already verified', paymentId: tx.subscription_payment_id }
  }

  if (!tx.invoice_id) {
    return { success: false, error: 'No invoice linked to this transaction' }
  }

  // 2. Load the invoice
  const { data: invoice } = await sc
    .from('subscription_invoice_details')
    .select('*')
    .eq('id', tx.invoice_id)
    .single()

  if (!invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  if (invoice.paid_at) {
    // Already paid — mark transaction as duplicate
    await sc.from('mpesa_transactions').update({
      status: 'duplicate',
      result_desc: 'Invoice already paid before this transaction was processed',
      updated_at: new Date().toISOString(),
    }).eq('id', transactionId)

    return { success: false, error: 'Invoice already paid' }
  }

  // 3. Validate amount
  const balanceDue = Number(invoice.balance_due || invoice.total_amount)
  const paidAmount = Number(tx.amount)

  if (paidAmount < balanceDue * 0.99) {
    // Allow 1% tolerance for rounding, but flag significant underpayment
    console.warn(`[mpesa] Partial payment: ${paidAmount} vs ${balanceDue} due on invoice ${invoice.invoice_ref_no}`)
    // Still process — partial payments are valid, invoice tracks balance
  }

  // 4. Find the user profile for paid_by
  let paidBy = tx.user_id
  if (!paidBy) {
    // C2B: try to find user by phone number
    const { data: userByPhone } = await sc
      .from('user_profiles_secure')
      .select('id')
      .eq('phone_idx', tx.phone_number) // may need pii_hmac lookup
      .maybeSingle()
    paidBy = userByPhone?.id || invoice.user_id
  }

  if (!paidBy) {
    // Last resort: use the subscription's user/owner
    const { data: sub } = await sc
      .from('subscriptions')
      .select('user_id, subscribed_by')
      .eq('id', invoice.subscription_id)
      .single()
    paidBy = sub?.user_id || sub?.subscribed_by
  }

  if (!paidBy) {
    return { success: false, error: 'Cannot determine paying user' }
  }

  // 5. Record payment via RPC
  const { data: result, error: rpcErr } = await sc.rpc('record_subscription_payment', {
    p_invoice_id:     tx.invoice_id,
    p_amount:         paidAmount,
    p_paid_via:       'mpesa',
    p_transaction_id: tx.mpesa_receipt_number,
    p_notes:          `M-Pesa ${tx.transaction_type === 'stk_push' ? 'STK Push' : 'Paybill'} — ${tx.mpesa_receipt_number}`,
  })

  if (rpcErr || !result?.success) {
    console.error('[mpesa] record_subscription_payment failed:', rpcErr || result?.error)
    return { success: false, error: result?.error || rpcErr?.message || 'Payment recording failed' }
  }

  // 6. Link payment to transaction and mark verified
  await sc.from('mpesa_transactions').update({
    status: 'verified',
    verified_at: new Date().toISOString(),
    verified_via: 'callback+status_query',
    subscription_payment_id: result.payment_id,
    updated_at: new Date().toISOString(),
  }).eq('id', transactionId)

  return {
    success: true,
    paymentId: result.payment_id,
    receiptNumber: result.receipt_number,
    mpesaReceipt: tx.mpesa_receipt_number,
  }
}