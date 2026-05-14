/**
 * lib/sms/walkInSms.js
 * ────────────────────
 * SMS notifications related to walk-in work orders.
 *
 *  sendWalkInCreatedSms  — to the provider owner + admins (excluding initiator)
 *                          when a member with can_approve_work creates a
 *                          walk-in work order.
 *
 * Kept under 160 chars where possible. Africa's Talking concatenates >160 char
 * messages automatically; we still aim to fit one segment for cost.
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms, normalisePhone } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://garage-mu-two.vercel.app/'
const BRAND   = 'Motiifix'

export async function sendWalkInCreatedSms(supabase, {
  phone,
  recipientName,
  workOrderNumber,
  workOrderId,
  vehiclePlate,
  initiatorName,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const url = `${APP_URL()}/provider/work-orders/${workOrderId}`
  const greet = recipientName ? `${recipientName}, ` : ''
  const who   = initiatorName || 'A team member'

  const message = `${BRAND}: ${greet}${who} created walk-in WO ${workOrderNumber} for ${vehiclePlate}. View: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}