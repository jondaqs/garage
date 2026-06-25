// src/lib/paystack/processPayment.js

/**
 * Process a verified Paystack card/Apple Pay payment.
 *
 * Called after Paystack confirms the transaction.
 * Records the payment via the shared record_subscription_payment RPC,
 * then auto-confirms the receipt (same as M-Pesa STK Push flow).
 *
 * @param {object} opts
 * @param {object} opts.sc                     - Supabase service client
 * @param {string} opts.invoiceId              - Subscription invoice ID
 * @param {string} opts.userId                 - user_profiles.id of the payer
 * @param {number} opts.amountInInvoiceCurrency - Amount in the invoice's currency
 * @param {string} opts.transactionRef         - Paystack reference
 * @param {string} opts.channel                - Payment channel (card, apple_pay, etc.)
 * @param {string} opts.cardLast4              - Last 4 digits of card
 * @param {string} opts.cardType               - Card type (visa, mastercard, etc.)
 * @param {string} opts.bank                   - Issuing bank
 * @param {number} opts.paidKes                - Amount paid in KES
 * @param {number} opts.exchangeRate           - Exchange rate used (if any)
 * @param {string} opts.paystackReference      - Paystack transaction reference
 */
export async function processVerifiedCardPayment({
  sc,
  invoiceId,
  userId,
  amountInInvoiceCurrency,
  transactionRef,
  channel = 'card',
  cardLast4,
  cardType,
  bank,
  paidKes,
  exchangeRate,
  paystackReference,
}) {
  try {
    // Build descriptive notes
    const channelLabel = channel === 'apple_pay' ? 'Apple Pay'
      : cardType ? `${cardType.toUpperCase()} ****${cardLast4 || ''}` : 'Card'
    const bankLabel = bank ? ` via ${bank}` : ''
    const notes = `${channelLabel}${bankLabel} — Ref: ${paystackReference}` +
      (paidKes ? ` (KES ${paidKes.toLocaleString()})` : '')

    // Record payment via shared RPC (handles dynamic credit recalculation)
    const { data: result, error: rpcErr } = await sc.rpc('record_subscription_payment', {
      p_invoice_id: invoiceId,
      p_amount: amountInInvoiceCurrency,
      p_paid_via: channel === 'apple_pay' ? 'apple_pay' : 'card',
      p_transaction_id: paystackReference,
      p_notes: notes,
      p_paid_by: userId,
    })

    if (rpcErr || !result?.success) {
      console.error('[paystack] record_subscription_payment failed:', rpcErr || result?.error)
      return { success: false, error: result?.error || rpcErr?.message || 'Payment recording failed' }
    }

    // Auto-confirm receipt — card payment is verified by Paystack, no admin needed
    if (result.receipt_id) {
      const { data: confirmResult, error: confirmErr } = await sc.rpc('confirm_subscription_receipt', {
        p_receipt_id: result.receipt_id,
        p_confirmed_by: userId,
      })
      if (confirmErr || !confirmResult?.success) {
        console.error(`[paystack] Auto-confirm failed for receipt ${result.receipt_id}:`, confirmErr || confirmResult?.error)
      } else {
        console.info(`[paystack] Receipt ${result.receipt_number} auto-confirmed for ${channelLabel} payment ${paystackReference}`)
      }
    }

    return {
      success: true,
      paymentId: result.payment_id,
      paymentRef: result.payment_ref,
      receiptNumber: result.receipt_number,
      fullyPaid: result.fully_paid,
    }
  } catch (err) {
    console.error('[paystack] processVerifiedCardPayment error:', err)
    return { success: false, error: err.message }
  }
}