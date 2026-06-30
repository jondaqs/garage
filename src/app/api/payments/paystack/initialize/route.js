// src/app/api/payments/paystack/initialize/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { initializeTransaction } from '@/lib/paystack/client'
import { PAYSTACK_CONFIG, FOREX_MARGIN_PCT } from '@/lib/paystack/config'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/payments/paystack/initialize
 *
 * Creates a Paystack transaction for a subscription invoice.
 * Adds a configurable service fee on top of the invoice amount.
 *
 * Body: { invoiceId, email }
 * Returns: { success, accessCode, reference, amountKes, subtotalKes, serviceFeeKes, serviceFeePct }
 */
export async function POST(request) {
  try {
    // Auth
    const authClient = await createClient()
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { invoiceId, email } = await request.json()
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    if (!PAYSTACK_CONFIG.secretKey || !PAYSTACK_CONFIG.publicKey) {
      return NextResponse.json({ error: 'Card payments are not configured. Please contact support.' }, { status: 503 })
    }

    const sc = getServiceClient()

    // Load card service fee from admin settings
    let serviceFeePct = 3.5 // default: covers Paystack's 2.9% + margin
    try {
      const { data: settings } = await sc
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'payment_accounts')
        .single()
      if (settings?.setting_value?.card?.service_fee_pct != null) {
        serviceFeePct = Number(settings.setting_value.card.service_fee_pct)
      }
    } catch { /* use default */ }

    // Look up the invoice
    const { data: invoice, error: invErr } = await sc
      .from('subscription_invoice_details')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.effective_status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 })
    }

    if (invoice.effective_status === 'overdue') {
      return NextResponse.json({
        error: 'This invoice has expired. Please create a new subscription to get a fresh invoice.',
      }, { status: 400 })
    }

    // Resolve payer profile
    const { data: profile } = await sc
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Determine amount in KES (subtotal before service fee)
    const invoiceBalance = Number(invoice.balance_due || invoice.total_amount)
    const invoiceCurrency = invoice.currency_code || 'KES'
    let subtotalKes = Math.ceil(invoiceBalance)
    let exchangeRate = null

    if (invoiceCurrency !== 'KES') {
      const { data: rateData } = await sc.rpc('get_public_exchange_rate', { p_target_code: 'KES' })
      if (rateData?.rate && rateData.rate > 0) {
        const margined = rateData.rate * (1 + FOREX_MARGIN_PCT / 100)
        exchangeRate = margined
        subtotalKes = Math.ceil(invoiceBalance * margined)
      } else {
        return NextResponse.json({
          error: 'Cannot convert to KES — exchange rate unavailable. Try again later.',
        }, { status: 503 })
      }
    }

    // Calculate service fee
    const serviceFeeKes = Math.ceil(subtotalKes * serviceFeePct / 100)
    const totalKes = subtotalKes + serviceFeeKes

    // Generate unique reference
    const reference = `GC-${invoiceId.substring(0, 8)}-${Date.now()}`

    // Build callback URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://carfix-connect.com'
    const callbackUrl = `${baseUrl}/api/payments/paystack/verify?reference=${reference}`

    // Initialize Paystack transaction (total = subtotal + service fee)
    const result = await initializeTransaction({
      email,
      amountKobo: totalKes * 100,
      currency: 'KES',
      reference,
      callbackUrl,
      metadata: {
        invoice_id: invoiceId,
        invoice_ref: invoice.invoice_ref_no,
        user_id: profile.id,
        auth_user_id: user.id,
        original_currency: invoiceCurrency,
        original_amount: invoiceBalance,
        exchange_rate: exchangeRate,
        subtotal_kes: subtotalKes,
        service_fee_kes: serviceFeeKes,
        service_fee_pct: serviceFeePct,
        custom_fields: [
          { display_name: 'Invoice', variable_name: 'invoice_ref', value: invoice.invoice_ref_no },
          { display_name: 'Package', variable_name: 'package', value: invoice.package_name || 'Subscription' },
        ],
      },
      channels: ['card', 'apple_pay'],
    })

    if (!result.success) {
      console.error('[paystack] Initialize failed:', result.error)
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    // Store a pending record
    try {
      await sc.from('paystack_transactions').insert({
        reference: result.data.reference,
        invoice_id: invoiceId,
        user_id: profile.id,
        amount_kes: totalKes,
        original_amount: invoiceBalance,
        original_currency: invoiceCurrency,
        exchange_rate: exchangeRate,
        status: 'pending',
      })
    } catch (logErr) {
      console.warn('[paystack] Could not log transaction:', logErr.message)
    }

    return NextResponse.json({
      success: true,
      accessCode: result.data.accessCode,
      authorizationUrl: result.data.authorizationUrl,
      reference: result.data.reference,
      amountKes: totalKes,
      subtotalKes,
      serviceFeeKes,
      serviceFeePct,
      publicKey: PAYSTACK_CONFIG.publicKey,
    })
  } catch (err) {
    console.error('[paystack] Initialize error:', err)
    return NextResponse.json({ error: 'Payment initialization failed' }, { status: 500 })
  }
}