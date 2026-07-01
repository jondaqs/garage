// src/app/api/payments/mpesa/stk-push/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { formatPhone } from '@/lib/mpesa/config'
import { initiateStkPush } from '@/lib/mpesa/stkPush'
import { generateCallbackHmac } from '@/lib/mpesa/security'
import { rateLimit } from '@/lib/rateLimiter'
import { isValidPhone, requireNumber, requireUUID } from '@/lib/validation'

const limiter = rateLimit({ windowMs: 60_000, max: 3, message: 'Too many payment attempts. Please wait a minute.' })

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request) {
  try {
    // Rate limit
    const limited = limiter.check(request)
    if (limited) return limited

    // Auth
    const authClient = await createClient()
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { invoiceId, phoneNumber, amount: rawAmount } = body
    if (!requireUUID(invoiceId)) return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 })
    if (!isValidPhone(phoneNumber)) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    const amount = requireNumber(rawAmount, { min: 1 })
    if (!amount) return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })

    if (!invoiceId || !phoneNumber) {
      return NextResponse.json({ error: 'invoiceId and phoneNumber are required' }, { status: 400 })
    }

    // Format phone
    const formattedPhone = formatPhone(phoneNumber)
    if (!formattedPhone) {
      return NextResponse.json({ error: 'Invalid phone number. Use format 07XXXXXXXX or 2547XXXXXXXX' }, { status: 400 })
    }

    const sc = getServiceClient()

    // Get user profile
    const { data: profile } = await sc
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Load invoice
    const { data: invoice } = await sc
      .from('subscription_invoice_details')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.paid_at) {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 })
    }

    if (invoice.effective_status === 'overdue') {
      return NextResponse.json({
        error: 'This invoice has expired. Please create a new subscription to get a fresh invoice.',
      }, { status: 400 })
    }

    // Determine amount in KES (M-Pesa always operates in KES)
    const invoiceBalance = Number(invoice.balance_due || invoice.total_amount)
    const invoiceCurrency = invoice.currency_code || 'KES'
    let payAmountKes = Math.ceil(Number(amount || invoiceBalance))
    let exchangeRate = null

    // Forex margin — must match the margin used by the UI display
    // (see /api/pricing/exchange-rate → FOREX_MARGIN_PCT)
    const FOREX_MARGIN_PCT = 2.5

    if (invoiceCurrency !== 'KES') {
      // Invoice is in foreign currency (e.g. USD) — convert to KES
      const { data: rateData } = await sc.rpc('get_public_exchange_rate', {
        p_target_code: 'KES',
      })
      if (rateData?.rate && rateData.rate > 0) {
        // Apply the same forex margin the UI shows so the prompted amount matches
        const margined = rateData.rate * (1 + FOREX_MARGIN_PCT / 100)
        exchangeRate = margined
        payAmountKes = Math.ceil(invoiceBalance * margined)
      } else {
        return NextResponse.json({
          error: `Cannot convert ${invoiceCurrency} to KES — exchange rate not available. Please try again later.`,
        }, { status: 503 })
      }
    }

    if (payAmountKes <= 0) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 })
    }

    // Check no pending STK push for this invoice
    const { data: pending } = await sc
      .from('mpesa_transactions')
      .select('id, status')
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pending) {
      return NextResponse.json({
        error: 'A payment request is already pending for this invoice. Please check your phone or wait a moment.',
      }, { status: 409 })
    }

    // Generate idempotency key and HMAC
    const idempotencyKey = `stk-${invoiceId}-${Date.now()}`
    const hmacSig = generateCallbackHmac(idempotencyKey)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
    const callbackUrl = `${baseUrl}/api/payments/mpesa/callback?sig=${hmacSig}&key=${encodeURIComponent(idempotencyKey)}`

    // Create transaction record
    const { data: tx, error: txErr } = await sc
      .from('mpesa_transactions')
      .insert({
        transaction_type: 'stk_push',
        invoice_id: invoiceId,
        invoice_ref_no: invoice.invoice_ref_no,
        user_id: profile.id,
        phone_number: formattedPhone,
        amount: payAmountKes,
        account_reference: invoice.invoice_ref_no?.substring(0, 12) || 'Carfix-Connect',
        idempotency_key: idempotencyKey,
        exchange_rate: exchangeRate,
        status: 'pending',
      })
      .select('id')
      .single()

    if (txErr) {
      console.error('[stk-push] Failed to create transaction:', txErr)
      return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
    }

    // Initiate STK push
    const result = await initiateStkPush({
      phoneNumber: formattedPhone,
      amount: payAmountKes,
      accountReference: invoice.invoice_ref_no?.substring(0, 12) || 'Carfix-Connect',
      transactionDesc: 'Subscription',
      callbackUrl,
    })

    if (!result.success) {
      await sc.from('mpesa_transactions').update({
        status: 'failed',
        result_desc: result.error,
        updated_at: new Date().toISOString(),
      }).eq('id', tx.id)

      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    // Update transaction with M-Pesa IDs
    await sc.from('mpesa_transactions').update({
      merchant_request_id: result.data.merchantRequestId,
      checkout_request_id: result.data.checkoutRequestId,
      updated_at: new Date().toISOString(),
    }).eq('id', tx.id)

    return NextResponse.json({
      success: true,
      transactionId: tx.id,
      checkoutRequestId: result.data.checkoutRequestId,
      customerMessage: result.data.customerMessage,
      amountKes: payAmountKes,
    })
  } catch (err) {
    console.error('[stk-push] error:', err)
    return NextResponse.json({ error: 'Payment initiation failed' }, { status: 500 })
  }
}