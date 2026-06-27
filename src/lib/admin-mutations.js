// src/lib/admin-mutations.js
// Client-side helper for admin database operations.
// Routes all writes through /api/admin/mutations for server-side auth verification.
//
// Usage:
//   import { adminInsert, adminUpdate, adminLog } from '@/lib/admin-mutations'
//
//   // Insert a new lookup row
//   const { data, error } = await adminInsert('services', {
//     name: 'Oil Change', code: 'oil_change', is_active: true
//   })
//
//   // Update a row by ID
//   const { data, error } = await adminUpdate('services', rowId, {
//     display_name: 'Full Oil Change'
//   })
//
//   // Update by filters (e.g., platform_settings)
//   const { data, error } = await adminUpdate('platform_settings', null, data, {
//     setting_key: 'sms_config'
//   })
//
//   // Log an admin action
//   await adminLog('approve_company', 'company', companyId)

async function adminMutation(table, operation, data, id = null, filters = null) {
  try {
    const response = await fetch('/api/admin/mutations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, operation, data, id, filters }),
    })

    const result = await response.json()

    if (!response.ok) {
      return { data: null, error: { message: result.error || 'Admin mutation failed' } }
    }

    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: { message: err.message } }
  }
}

/**
 * Insert a row into an admin-whitelisted table.
 */
export async function adminInsert(table, data) {
  return adminMutation(table, 'insert', data)
}

/**
 * Update a row by ID or filters.
 * @param {string} table
 * @param {string|null} id - Row ID (pass null if using filters)
 * @param {object} data - Fields to update
 * @param {object} [filters] - Filter object for tables without an id match
 */
export async function adminUpdate(table, id, data, filters = null) {
  return adminMutation(table, 'update', data, id, filters)
}

/**
 * Log an admin action. Auto-sets admin_user_id server-side.
 */
export async function adminLog(actionType, targetType, targetId) {
  return adminMutation('admin_action_logs', 'insert', {
    action_type: actionType,
    target_type: targetType,
    target_id:   targetId,
  })
}
