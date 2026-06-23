// src/app/api/payments/mpesa/c2b/confirm/route.js

import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isValidSafaricomIP, getClientIp, extractForensicHeaders } from '@/lib/mpesa/security'
import { formatPhone } from '@/lib/mpesa/config'
import { processVerifiedMpesaPayment } from '@/lib/mpesa/processPayment'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/payments/mpesa/c2b/confirm
 *
 * Safaricom calls this AFTER a C2B (Paybill) payment is processed.
 * The money has already moved — we record and match to an invoice.
 *
 * Flow:
 *   1. IP whitelist check
 *   2. Log raw callback
 *   3. Check for duplicate receipt number
 *   4. Match BillRefNumber to an invoice
 *   5. Create mpesa_transactions record
 *   6. Process payment (verify amount, record, generate receipt)
 */
export async function POST(request) {
  const clientIp = getClientIp(request)

  try {
    if (!isValidSafaricomIP(request)) {
      console.warn(`[c2b-confirm] Rejected: IP ${clientIp} not in whitelist`)
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Rejected' })
    }

    const body = await request.json()
    const sc = getServiceClient()

    // Log raw callback first
    const { data: logEntry } = await sc.from('mpesa_callback_logs').insert({
      callback_type: 'c2b_confirmation',
      raw_body: body,
      source_ip: clientIp,
      headers: extractForensicHeaders(request),
      processed: false,
    }).select('id').single()

    const {
      TransID,         // M-Pesa receipt number e.g. QKJ71H859T
      TransAmount,     // Amount paid
      BillRefNumber,   // Account reference entered by user
      MSISDN,          // Phone number
      TransTime,       // Transaction time YYYYMMDDHHmmss
      FirstName,
      MiddleName,
      LastName,
    } = body

    const amount = Number(TransAmount)
    const phone = formatPhone(MSISDN) || MSISDN
    const receiptNumber = (TransID || '').trim()
    const accountRef = (BillRefNumber || '').trim().toUpperCase()
    const payerName = [FirstName, MiddleName, LastName].filter(Boolean).join(' ')

    if (!receiptNumber) {
      console.error('[c2b-confirm] No TransID in callback')
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── Duplicate check ─────────────────────────────────────────
    const { data: existing } = await sc
      .from('mpesa_transactions')
      .select('id, status')
      .eq('mpesa_receipt_number', receiptNumber)
      .maybeSingle()

    if (existing) {
      console.info(`[c2b-confirm] Duplicate receipt ${receiptNumber} — already ${existing.status}`)
      if (logEntry?.id) {
        await sc.from('mpesa_callback_logs').update({
          transaction_id: existing.id, processed: true, error_message: 'Duplicate receipt',
        }).eq('id', logEntry.id)
      }
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── Match invoice ───────────────────────────────────────────
    let invoiceId = null
    let invoiceRefNo = null

    if (accountRef) {
      // Try exact match first
      const { data: exactMatch } = await sc
        .from('subscription_invoice_details')
        .select('id, invoice_ref_no, total_amount, balance_due, paid_at')
        .ilike('invoice_ref_no', accountRef)
        .is('paid_at', null)
        .maybeSingle()

      if (exactMatch) {
        invoiceId = exactMatch.id
        invoiceRefNo = exactMatch.invoice_ref_no
      } else {
        // Try partial match (user might omit prefix)
        const { data: partialMatch } = await sc
          .from('subscription_invoice_details')
          .select('id, invoice_ref_no, total_amount, balance_due, paid_at')
          .ilike('invoice_ref_no', `%${accountRef}%`)
          .is('paid_at', null)
          .limit(1)
          .maybeSingle()

        if (partialMatch) {
          invoiceId = partialMatch.id
          invoiceRefNo = partialMatch.invoice_ref_no
        }
      }
    }

    // ── Create transaction record ───────────────────────────────
    const idempotencyKey = `c2b-${receiptNumber}`

    const { data: tx, error: txErr } = await sc
      .from('mpesa_transactions')
      .insert({
        transaction_type: 'c2b',
        invoice_id: invoiceId,
        invoice_ref_no: invoiceRefNo || accountRef,
        phone_number: phone,
        amount,
        account_reference: accountRef,
        mpesa_receipt_number: receiptNumber,
        result_code: 0,
        result_desc: `C2B payment from ${payerName || phone}`,
        transaction_date: TransTime ? parseC2BDate(TransTime) : new Date().toISOString(),
        status: invoiceId ? 'callback_received' : 'callback_received',
        callback_ip: clientIp,
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single()

    if (txErr) {
      console.error('[c2b-confirm] Failed to create transaction:', txErr)
      // If it's a duplicate key error, that's the idempotency guard working
      if (txErr.code === '23505') {
        return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // Link log entry to transaction
    if (logEntry?.id) {
      await sc.from('mpesa_callback_logs').update({
        transaction_id: tx.id, processed: true,
      }).eq('id', logEntry.id)
    }

    // ── Process payment if invoice matched ──────────────────────
    if (invoiceId) {
      // C2B confirmations come directly from Safaricom after the payment
      // is processed — the money has moved. No need for double-verification
      // via status query (unlike STK push which can be spoofed more easily).
      // The IP whitelist + duplicate check is sufficient for C2B.
      const payResult = await processVerifiedMpesaPayment(tx.id)

      if (payResult.success) {
        console.info(`[c2b-confirm] Payment processed: ${receiptNumber} → invoice ${invoiceRefNo}`)
      } else {
        console.warn(`[c2b-confirm] Payment processing failed: ${payResult.error}`)
      }
    } else {
      console.warn(`[c2b-confirm] No invoice matched for ref "${accountRef}" receipt ${receiptNumber} from ${phone}. Amount: ${amount}. Needs manual reconciliation.`)

      // Create a notification for admin
      try {
        await sc.from('notifications').insert({
          recipient_type: 'admin',
          type: 'mpesa_unmatched_payment',
          notification_type: 'mpesa_unmatched_payment',
          title: `Unmatched M-Pesa Payment — ${receiptNumber}`,
          message: `KES ${amount.toLocaleString()} received from ${payerName || phone} with ref "${accountRef}" but no matching invoice found. Manual reconciliation required.`,
          reference_table: 'mpesa_transactions',
          reference_id: tx.id,
          reference_type: 'mpesa_transaction',
          is_read: false,
        })
      } catch { /* notification failure is non-critical */ }
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    console.error('[c2b-confirm] error:', err)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}

function parseC2BDate(dateStr) {
  const s = String(dateStr)
  if (s.length < 14) return new Date().toISOString()
  const y = s.substring(0, 4), m = s.substring(4, 6), d = s.substring(6, 8)
  const h = s.substring(8, 10), mi = s.substring(10, 12), se = s.substring(12, 14)
  return new Date(`${y}-${m}-${d}T${h}:${mi}:${se}+03:00`).toISOString()
}