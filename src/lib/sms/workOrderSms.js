/**
 * lib/sms/workOrderSms.js
 * ───────────────────────
 * All work-order-related outgoing SMS messages.
 * Short, punchy messages — SMS has a 160-char limit per segment.
 * Each function: builds message → calls sendAndQueueSms → returns { sent, skipped }
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND   = 'Motiifix'

// ─── 1. Estimate ready for customer approval ──────────────────────────────────

/**
 * sendEstimateApprovalSms(supabase, { phone, ownerName, workOrderNumber,
 *   providerName, estimateTotal, workOrderId })
 */
export async function sendEstimateApprovalSms(supabase, {
  phone, ownerName, workOrderNumber, providerName, estimateTotal, workOrderId,
}) {
  const url     = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const name    = ownerName ? `${ownerName}, ` : ''
  const total   = `KES ${Number(estimateTotal || 0).toLocaleString()}`
  const message = `${BRAND}: ${name}${providerName} has sent a service estimate of ${total} for WO ${workOrderNumber}. Approve/reject here: ${url}`

  return sendAndQueueSms(supabase, {
    to:             phone,
    recipientName:  ownerName,
    message:        message.slice(0, 320),   // allow 2 SMS segments
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 2. Estimate approved — notify provider ───────────────────────────────────

export async function sendEstimateApprovedSms(supabase, {
  phone, providerName, workOrderNumber, vehiclePlate, estimateTotal, workOrderId,
}) {
  const url     = `${APP_URL()}/provider/work-orders/${workOrderId}`
  const total   = `KES ${Number(estimateTotal || 0).toLocaleString()}`
  const message = `${BRAND}: Estimate APPROVED for WO ${workOrderNumber} (${vehiclePlate}). Amount: ${total}. Proceed with service. ${url}`

  return sendAndQueueSms(supabase, {
    to:             phone,
    recipientName:  providerName,
    message:        message.slice(0, 320),
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 3. Estimate rejected — notify provider ───────────────────────────────────

export async function sendEstimateRejectedSms(supabase, {
  phone, providerName, workOrderNumber, vehiclePlate, workOrderId,
}) {
  const url     = `${APP_URL()}/provider/work-orders/${workOrderId}`
  const message = `${BRAND}: Estimate REJECTED for WO ${workOrderNumber} (${vehiclePlate}). Work order cancelled. Contact customer to discuss. ${url}`

  return sendAndQueueSms(supabase, {
    to:             phone,
    recipientName:  providerName,
    message:        message.slice(0, 320),
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 4. Changes requested — notify provider ───────────────────────────────────

export async function sendEstimateChangesRequestedSms(supabase, {
  phone, providerName, workOrderNumber, workOrderId,
}) {
  const url     = `${APP_URL()}/provider/work-orders/${workOrderId}`
  const message = `${BRAND}: Customer requested changes to estimate for WO ${workOrderNumber}. Please revise and resubmit. ${url}`

  return sendAndQueueSms(supabase, {
    to:             phone,
    recipientName:  providerName,
    message:        message.slice(0, 320),
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 5. Work order created (booking accepted) — notify customer ───────────────

export async function sendWorkOrderCreatedSms(supabase, {
  phone, ownerName, workOrderNumber, providerName, vehiclePlate, workOrderId,
}) {
  const url     = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const name    = ownerName ? `${ownerName}, ` : ''
  const message = `${BRAND}: ${name}your vehicle ${vehiclePlate} has been checked in at ${providerName}. WO ${workOrderNumber} opened. Track: ${url}`

  return sendAndQueueSms(supabase, {
    to:             phone,
    recipientName:  ownerName,
    message:        message.slice(0, 320),
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 6. Service completed — notify customer ───────────────────────────────────

export async function sendWorkOrderCompletedSms(supabase, {
  phone, ownerName, workOrderNumber, providerName, vehiclePlate, workOrderId,
}) {
  const url     = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const name    = ownerName ? `${ownerName}, ` : ''
  const message = `${BRAND}: ${name}your vehicle ${vehiclePlate} is ready for pickup at ${providerName}. WO ${workOrderNumber} complete. ${url}`

  return sendAndQueueSms(supabase, {
    to:             phone,
    recipientName:  ownerName,
    message:        message.slice(0, 320),
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}
/**
 * sendInvoiceSms(supabase, { phone, ownerName, workOrderNumber,
 *   providerName, totalAmount, workOrderId })
 */
export async function sendInvoiceSms(supabase, {
  phone, ownerName, workOrderNumber, providerName, totalAmount, workOrderId,
}) {
  const { sendSms } = await import('./transport.js')
  const amount = `KES ${Number(totalAmount || 0).toLocaleString()}`
  const greeting = ownerName ? `Hi ${ownerName.split(' ')[0]},` : 'Hi,'
  const message = `${greeting} Your invoice of ${amount} for WO ${workOrderNumber} at ${providerName} is ready. Please arrange payment. View: ${process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'}/dashboard/work-orders/${workOrderId}`
  return sendSms(supabase, { phone, message })
}
