// src/lib/admin/banUser.js
// Calls the /api/admin/ban-user route to ban or unban a user at the
// Supabase Auth level. Call this AFTER the status RPC succeeds.
//
// Usage:
//   import { banUser, unbanUser } from '@/lib/admin/banUser'
//   await banUser(auth_user_id)   // on suspend / deactivate
//   await unbanUser(auth_user_id) // on unsuspend / activate

export async function banUser(authUserId) {
  try {
    const res = await fetch('/api/admin/ban-user', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ auth_user_id: authUserId, action: 'ban' }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      console.warn('Auth-level ban failed (non-fatal):', data.error)
    }
    return data
  } catch (err) {
    // Non-fatal — the middleware still blocks access even if the auth ban fails.
    console.warn('Auth-level ban request failed (non-fatal):', err)
    return { success: false, error: err.message }
  }
}

export async function unbanUser(authUserId) {
  try {
    const res = await fetch('/api/admin/ban-user', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ auth_user_id: authUserId, action: 'unban' }),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      console.warn('Auth-level unban failed (non-fatal):', data.error)
    }
    return data
  } catch (err) {
    console.warn('Auth-level unban request failed (non-fatal):', err)
    return { success: false, error: err.message }
  }
}