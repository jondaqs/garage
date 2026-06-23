// src/app/api/payments/mpesa/status/route.js

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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
      'id, status, result_code, result_desc, mpesa_receipt_number, amount, verified_at, subscription_payment_id'
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

    // Don't expose internal fields — return clean status
    return NextResponse.json({
      transactionId: tx.id,
      status: tx.status,
      resultDesc: tx.result_desc,
      mpesaReceipt: tx.status === 'verified' ? tx.mpesa_receipt_number : null,
      amount: tx.amount,
      verifiedAt: tx.verified_at,
      paymentRecorded: !!tx.subscription_payment_id,
    })
  } catch (err) {
    console.error('[mpesa-status] error:', err)
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 })
  }
}