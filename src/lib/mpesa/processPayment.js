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
 * 1. Convert KES amount to invoice currency if needed
 * 2. Record payment via record_subscription_payment RPC
 * 3. Auto-confirm receipt (STK push payments are verified — no admin needed)
 * 4. Link the subscription_payment to the mpesa_transaction
 *
 * M-Pesa always operates in KES. If the invoice is in a different currency
 * (e.g. USD), we convert the paid KES amount to the invoice currency using
 * the exchange rate stored at transaction creation time.
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

  // 2. Load the invoice with currency info
  const { data: invoice } = await sc
    .from('subscription_invoice_details')
    .select('*')
    .eq('id', tx.invoice_id)
    .single()

  if (!invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  if (invoice.paid_at) {
    await sc.from('mpesa_transactions').update({
      status: 'duplicate',
      result_desc: 'Invoice already paid before this transaction was processed',
      updated_at: new Date().toISOString(),
    }).eq('id', transactionId)
    return { success: false, error: 'Invoice already paid' }
  }

  // 3. Convert KES payment amount to invoice currency
  const paidKes = Number(tx.amount) // always KES from M-Pesa
  let paymentInInvoiceCurrency = paidKes
  const invoiceCurrencyCode = invoice.currency_code || 'KES'

  if (invoiceCurrencyCode !== 'KES') {
    // Need to convert KES → invoice currency (e.g. KES → USD)
    // Use the exchange rate stored on the transaction, or look it up
    const exchangeRate = tx.exchange_rate || null

    if (exchangeRate && exchangeRate > 0) {
      // exchange_rate is USD→KES rate (e.g. 150), so KES→USD = 1/rate
      paymentInInvoiceCurrency = Math.round((paidKes / exchangeRate) * 100) / 100
    } else {
      // Fallback: look up current rate from DB
      const { data: rateData } = await sc.rpc('get_public_exchange_rate', {
        p_target_code: 'KES',
      })
      if (rateData?.rate && rateData.rate > 0) {
        paymentInInvoiceCurrency = Math.round((paidKes / rateData.rate) * 100) / 100
      } else {
        console.warn(`[mpesa] No exchange rate found for KES→${invoiceCurrencyCode}. Recording KES amount as-is.`)
      }
    }
  }

  // 4. Validate amount covers the invoice (with tolerance for rounding)
  const balanceDue = Number(invoice.balance_due || invoice.total_amount)
  if (paymentInInvoiceCurrency < balanceDue * 0.95) {
    console.warn(`[mpesa] Partial payment: ${paymentInInvoiceCurrency} ${invoiceCurrencyCode} vs ${balanceDue} due. KES paid: ${paidKes}`)
    // Still process — partial payments are valid
  }

  // 5. Find the paying user
  let paidBy = tx.user_id
  if (!paidBy) {
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

  // 6. Record payment via RPC — amount in invoice currency
  //    Pass p_paid_by so the RPC works from server-side (no auth.uid() session)
  const { data: result, error: rpcErr } = await sc.rpc('record_subscription_payment', {
    p_invoice_id:     tx.invoice_id,
    p_amount:         paymentInInvoiceCurrency,
    p_paid_via:       'mpesa',
    p_transaction_id: tx.mpesa_receipt_number,
    p_notes:          `M-Pesa ${tx.transaction_type === 'stk_push' ? 'STK Push' : 'Paybill'} — ${tx.mpesa_receipt_number} (KES ${paidKes.toLocaleString()})`,
    p_paid_by:        paidBy,
  })

  if (rpcErr || !result?.success) {
    console.error('[mpesa] record_subscription_payment failed:', rpcErr || result?.error)
    return { success: false, error: result?.error || rpcErr?.message || 'Payment recording failed' }
  }

  // 7. Link payment and mark verified
  await sc.from('mpesa_transactions').update({
    status: 'verified',
    verified_at: new Date().toISOString(),
    verified_via: 'callback+status_query',
    subscription_payment_id: result.payment_id,
    updated_at: new Date().toISOString(),
  }).eq('id', transactionId)

  // 8. Auto-confirm receipt — STK push is verified by Safaricom, no admin needed
  //    Pass p_confirmed_by so the RPC works from server-side (no auth.uid() session)
  if (result.receipt_id) {
    try {
      const { data: confirmResult, error: confirmErr } = await sc.rpc('confirm_subscription_receipt', {
        p_receipt_id: result.receipt_id,
        p_confirmed_by: paidBy,
      })
      if (confirmErr || !confirmResult?.success) {
        console.error(`[mpesa] Auto-confirm failed for receipt ${result.receipt_id}:`, confirmErr || confirmResult?.error)
      } else {
        console.info(`[mpesa] Receipt ${result.receipt_number} auto-confirmed for M-Pesa payment ${tx.mpesa_receipt_number || tx.checkout_request_id}`)
      }
    } catch (confirmErr) {
      console.error(`[mpesa] Auto-confirm exception for receipt ${result.receipt_id}:`, confirmErr)
      // Non-critical — admin can confirm manually
    }
  }

  return {
    success: true,
    paymentId: result.payment_id,
    receiptNumber: result.receipt_number,
    mpesaReceipt: tx.mpesa_receipt_number,
    paidKes,
    paidInvoiceCurrency: paymentInInvoiceCurrency,
  }
}