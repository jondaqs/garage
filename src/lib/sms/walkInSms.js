/**
 * lib/sms/walkInSms.js
 * ────────────────────
 * SMS notifications related to walk-in work orders.
 *
 *  sendWalkInCreatedSms   — to the provider owner + admins (excluding initiator)
 *                           when a member with can_approve_work creates a
 *                           walk-in work order.
 *  sendWalkInInviteSms    — to the customer when the vehicle has NO registered
 *                           owner. Companion to the registration invite email.
 *                           Includes the signup link with the invite token.
 *  sendWalkInOwnerSms     — to the registered customer who already has an
 *                           account. Points at the work order page directly.
 *
 * Kept under 160 chars where possible. Africa's Talking concatenates >160 char
 * messages automatically; we still aim to fit one segment for cost.
 *
 * Server-only — never import in client components.
 */

import { sendAndQueueSms, normalisePhone } from './transport.js'

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://carfix-connect.com/'
const BRAND   = 'Carfix-Connect'

// ─── 1. Provider owner + admin alert SMS ─────────────────────────────────────

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

  const message = `${BRAND}: ${greet}${who} created walk-in work order ${workOrderNumber} for ${vehiclePlate}. View: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 2. Unregistered customer invite SMS ─────────────────────────────────────

/**
 * Sent alongside the registration-invite email when the vehicle's owner is
 * unregistered and a phone number was supplied at intake. Even when an email
 * was also supplied (a "belt and braces" pairing) — the owner may have sent
 * a chauffeur to drop the vehicle off, so reaching both channels matters.
 *
 * @param {string} inviteToken — the same token surfaced by create_walk_in_work_order
 */
export async function sendWalkInInviteSms(supabase, {
  phone,
  customerName,
  workOrderNumber,
  workOrderId,
  vehiclePlate,
  providerName,
  inviteToken,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }
  if (!inviteToken) return { sent: false, skipped: true, reason: 'no invite token' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  // Build the signup deep-link — same format as the invite email
  const signupUrl = `${APP_URL().replace(/\/$/, '')}/auth/signup?invite_token=${inviteToken}&ref=walkin`

  const greet = customerName ? `${customerName}, ` : ''
  const who   = providerName ? `at ${providerName} ` : ''

  // Kept compact: ~155 chars with realistic data.
  const message =
    `${BRAND}: ${greet}your vehicle ${vehiclePlate} is ${who}(${workOrderNumber}). ` +
    `Track service & approve estimates: ${signupUrl} (link expires in 7 days).`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 3. Registered customer SMS ──────────────────────────────────────────────

/**
 * Sent to the registered owner of the vehicle. Points at the work order page
 * directly (no invite token needed — they already have an account).
 *
 * We send this even though we also fire an in-app notification — the owner
 * may have sent a chauffeur, so they may not be near the app at the time the
 * vehicle is dropped off.
 */
export async function sendWalkInOwnerSms(supabase, {
  phone,
  customerName,
  workOrderNumber,
  workOrderId,
  vehiclePlate,
  providerName,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const url   = `${APP_URL()}/dashboard/work-orders/${workOrderId}`
  const greet = customerName ? `${customerName}, ` : ''
  const where = providerName ? `at ${providerName}` : 'at the garage'

  const message =
    `${BRAND}: ${greet}your vehicle ${vehiclePlate} is ${where}. ` +
    `Work order ${workOrderNumber} created. Track: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}

// ─── 4. Company fleet recipient SMS ──────────────────────────────────────────

/**
 * Sent to the company owner + every active fleet manager / admin of the
 * company that owns the walked-in vehicle. Routes them at the company-side
 * dashboard rather than the personal dashboard.
 */
export async function sendWalkInFleetSms(supabase, {
  phone,
  recipientName,
  companyName,
  workOrderNumber,
  workOrderId,
  vehiclePlate,
  providerName,
}) {
  if (!phone) return { sent: false, skipped: true, reason: 'no phone' }

  const normalisedPhone = normalisePhone(phone)
  if (!normalisedPhone) return { sent: false, skipped: true, reason: 'invalid phone' }

  const url   = `${APP_URL()}/company/work-orders/${workOrderId}`
  const greet = recipientName ? `${recipientName}, ` : ''
  const where = providerName ? `at ${providerName}` : 'at the garage'
  const co    = companyName ? `${companyName} ` : 'fleet '

  const message =
    `${BRAND}: ${greet}${co}vehicle ${vehiclePlate} is ${where}. ` +
    `${workOrderNumber} opened. Track: ${url}`

  return sendAndQueueSms(supabase, {
    to:             normalisedPhone,
    message,
    referenceTable: 'work_orders',
    referenceId:    workOrderId,
  })
}