/**
 * POST /api/work-orders/[id]/send-invoice
 * Marks the invoice as sent and notifies the customer via email/SMS.
 * Authorised: owner, admin, accountant (SPU role), or SPU/mechanic with can_send_invoice=true
 */

import { createClient }         from '@/lib/supabase/server'
import { NextResponse }          from 'next/server'
import { sendInvoiceEmail }      from '@/lib/email/workOrderEmails'
import { sendInvoiceSms }        from '@/lib/sms/workOrderSms'

export async function POST(request, { params }) {
  try {
    const supabase            = await createClient()
    const { id: workOrderId } = await params

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── 1. Resolve caller's profile id ───────────────────────────────────
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 401 })

    // ── 2. Check authorisation ────────────────────────────────────────────
    // Must be: owner, admin, accountant (role), OR have can_send_invoice in SPU or mechanics
    const { data: wo } = await supabase
      .from('work_orders')
      .select('id, work_order_number, service_provider_id, vehicle_id')
      .eq('id', workOrderId)
      .single()
    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // Check via SPU
    const { data: spuRow } = await supabase
      .from('service_provider_users')
      .select('role, can_send_invoice')
      .eq('user_id', profile.id)
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .maybeSingle()

    // Check via mechanics table
    const { data: mechRow } = await supabase
      .from('mechanics')
      .select('can_send_invoice')
      .eq('user_id', profile.id)
      .eq('service_provider_id', wo.service_provider_id)
      .eq('is_active', true)
      .maybeSingle()

    // Check if owner
    const { data: provRow } = await supabase
      .from('service_providers')
      .select('id, name, owner_user_id')
      .eq('id', wo.service_provider_id)
      .maybeSingle()

    const isOwner     = provRow?.owner_user_id === profile.id
    const isAdminRole = ['admin', 'accountant'].includes(spuRow?.role)
    const spuCanSend  = !!spuRow?.can_send_invoice
    const mechCanSend = !!mechRow?.can_send_invoice

    if (!isOwner && !isAdminRole && !spuCanSend && !mechCanSend) {
      return NextResponse.json({
        error: 'You do not have permission to send invoices. Requires owner, admin, accountant role, or can_send_invoice permission.'
      }, { status: 403 })
    }

    // ── 3. Fetch the invoice ──────────────────────────────────────────────
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, status, issued_to_user_id')
      .eq('work_order_id', workOrderId)
      .maybeSingle()

    if (!invoice) return NextResponse.json({ error: 'No invoice found for this work order. Generate the invoice first.' }, { status: 400 })
    if (invoice.status === 'paid') return NextResponse.json({ error: 'Invoice is already paid.' }, { status: 400 })

    // ── 4. Mark as sent (update sent_at) ─────────────────────────────────
    await supabase
      .from('invoices')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', invoice.id)

    // ── 5. Resolve customer contact details ───────────────────────────────
    let ownerEmail = null, ownerPhone = null, ownerName = null, ownerId = null

    // Try from invoice's issued_to_user_id first
    if (invoice.issued_to_user_id) {
      ownerId = invoice.issued_to_user_id
    } else {
      // Fall back: find owner via vehicle_ownership
      const { data: vo } = await supabase
        .from('vehicle_ownership')
        .select('owner_user_id')
        .eq('vehicle_id', wo.vehicle_id)
        .maybeSingle()
      if (vo?.owner_user_id) ownerId = vo.owner_user_id
    }

    if (ownerId) {
      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('first_name, last_name, phone, auth_user_id')
        .eq('id', ownerId)
        .single()
      if (ownerProfile) {
        ownerName  = `${ownerProfile.first_name || ''} ${ownerProfile.last_name || ''}`.trim()
        ownerPhone = ownerProfile.phone
        // Get email from auth
        if (ownerProfile.auth_user_id) {
          const { data: au } = await supabase.auth.admin
            ?.getUserById?.(ownerProfile.auth_user_id)
            .catch(() => ({ data: null })) || { data: null }
          ownerEmail = au?.user?.email || null
        }
      }
    }

    // Also check booking for walk-in customers
    if (!ownerEmail && !ownerPhone) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('customer_email, customer_phone, customer:user_profiles!customer_user_id(first_name, last_name, phone, auth_user_id)')
        .eq('work_order_id', workOrderId)
        .maybeSingle()
      if (booking) {
        ownerEmail = ownerEmail || booking.customer_email
        ownerPhone = ownerPhone || booking.customer_phone || booking.customer?.phone
        if (!ownerName && booking.customer) {
          ownerName = `${booking.customer.first_name || ''} ${booking.customer.last_name || ''}`.trim()
        }
      }
    }

    // ── 6. Insert notification to customer ────────────────────────────────
    if (ownerId) {
      await supabase.from('notifications').insert({
        user_id:          ownerId,
        recipient_user_id: ownerId,
        type:             'invoice_issued',
        notification_type: 'invoice_issued',
        title:            `Invoice Ready — ${invoice.invoice_number}`,
        message:          `Your invoice of KES ${Number(invoice.total_amount).toLocaleString()} for work order ${wo.work_order_number} is ready. Please arrange payment.`,
        reference_table:  'invoices',
        reference_id:     invoice.id,
        reference_type:   'invoice',
        is_read:          false,
      }).catch(() => {})
    }

    // ── 7. Send email (non-fatal) ─────────────────────────────────────────
    let emailSent = false
    if (ownerEmail && typeof sendInvoiceEmail === 'function') {
      try {
        await sendInvoiceEmail(supabase, {
          to:              ownerEmail,
          ownerName,
          workOrderNumber: wo.work_order_number,
          providerName:    provRow?.name || 'the service provider',
          invoiceNumber:   invoice.invoice_number,
          totalAmount:     invoice.total_amount,
          workOrderId,
        })
        emailSent = true
      } catch (e) { console.error('Invoice email failed (non-fatal):', e.message) }
    }

    // ── 8. Send SMS (non-fatal) ───────────────────────────────────────────
    let smsSent = false
    if (ownerPhone && typeof sendInvoiceSms === 'function') {
      try {
        const r = await sendInvoiceSms(supabase, {
          phone:           ownerPhone,
          ownerName,
          workOrderNumber: wo.work_order_number,
          providerName:    provRow?.name || 'the service provider',
          totalAmount:     invoice.total_amount,
          workOrderId,
        })
        smsSent = r?.sent || false
      } catch (e) { console.error('Invoice SMS failed (non-fatal):', e.message) }
    }

    return NextResponse.json({
      success:          true,
      invoice_number:   invoice.invoice_number,
      email_sent:       emailSent,
      sms_sent:         smsSent,
      owner_has_email:  !!ownerEmail,
      owner_has_phone:  !!ownerPhone,
    })

  } catch (err) {
    console.error('POST /api/work-orders/[id]/send-invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}