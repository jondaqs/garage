// src/lib/notifications.js
// Centralized notification helper — wraps the create_notification RPC.
// Replaces all direct .from('notifications').insert() calls in client-side code.
//
// Usage:
//   import { sendNotification, sendAdminNotification } from '@/lib/notifications'
//
//   // User-targeted notification
//   await sendNotification(supabase, {
//     recipientUserId: userId,
//     type: 'booking_confirmed',
//     title: 'Booking Confirmed',
//     message: 'Your booking has been confirmed.',
//     referenceId: bookingId,
//     referenceType: 'booking',
//   })
//
//   // Admin broadcast notification
//   await sendAdminNotification(supabase, {
//     type: 'new_registration',
//     title: 'New Registration',
//     message: 'A new provider has registered.',
//     referenceId: providerId,
//     referenceType: 'service_provider',
//   })
//
//   // Batch — notify multiple users
//   await sendNotificationBatch(supabase, userIds, {
//     type: 'company_approved',
//     title: 'Company Approved',
//     message: 'The company has been approved.',
//     referenceId: companyId,
//     referenceType: 'company',
//   })

/**
 * Send a notification to a specific user via the create_notification RPC.
 * @param {object} supabase - Supabase client instance
 * @param {object} opts
 * @param {string} opts.recipientUserId - Target user's profile ID
 * @param {string} opts.type - notification_type value
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.referenceId] - Related entity ID
 * @param {string} [opts.referenceType] - Related entity type
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendNotification(supabase, {
  recipientUserId,
  type,
  title,
  message,
  referenceId = null,
  referenceType = null,
}) {
  try {
    const { data, error } = await supabase.rpc('create_notification', {
      p_recipient_user_id: recipientUserId,
      p_notification_type: type,
      p_title: title,
      p_message: message,
      p_reference_id: referenceId,
      p_reference_type: referenceType,
      p_recipient_type: null,
    })
    if (error) {
      console.warn('Notification RPC error (non-fatal):', error.message)
      return { success: false, error: error.message }
    }
    return data || { success: true }
  } catch (err) {
    console.warn('Notification error (non-fatal):', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Send an admin broadcast notification.
 */
export async function sendAdminNotification(supabase, {
  type,
  title,
  message,
  referenceId = null,
  referenceType = null,
}) {
  try {
    const { data, error } = await supabase.rpc('create_notification', {
      p_recipient_user_id: null,
      p_notification_type: type,
      p_title: title,
      p_message: message,
      p_reference_id: referenceId,
      p_reference_type: referenceType,
      p_recipient_type: 'admin',
    })
    if (error) {
      console.warn('Admin notification RPC error (non-fatal):', error.message)
      return { success: false, error: error.message }
    }
    return data || { success: true }
  } catch (err) {
    console.warn('Admin notification error (non-fatal):', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Send the same notification to multiple users.
 * Calls the RPC once per user (no batch RPC exists).
 */
export async function sendNotificationBatch(supabase, userIds, {
  type,
  title,
  message,
  referenceId = null,
  referenceType = null,
}) {
  const results = await Promise.allSettled(
    userIds.map(uid =>
      sendNotification(supabase, {
        recipientUserId: uid,
        type, title, message, referenceId, referenceType,
      })
    )
  )
  const failed = results.filter(r => r.status === 'rejected' || !r.value?.success)
  if (failed.length > 0) {
    console.warn(`${failed.length}/${userIds.length} batch notifications failed`)
  }
  return { total: userIds.length, failed: failed.length }
}
