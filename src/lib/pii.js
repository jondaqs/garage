// ============================================================================
// PII Utility Module
// Location: src/lib/pii.js
// ============================================================================
// Provides helper functions for PII-safe search operations.
// Uses the server-side pii_hmac() function to compute blind indexes.
//
// Usage:
//   import { piiHmac, piiHmacRaw } from '@/lib/pii'
//
//   // Search user by email (case-insensitive)
//   const hash = await piiHmac(supabase, 'user@example.com')
//   const { data } = await supabase
//     .from('user_profiles_secure')
//     .select('id')
//     .eq('email_idx', hash)
//
//   // Search vehicle by plate (case-sensitive)
//   const plateHash = await piiHmacRaw(supabase, 'KAA 123A')
//   const { data } = await supabase
//     .from('vehicles_secure')
//     .select('id, make, model')
//     .eq('plate_number_idx', plateHash)
// ============================================================================

/**
 * Compute a case-insensitive blind index (HMAC) for PII search.
 * Use for: email, phone, customer_email, invited_email, etc.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} value - The plaintext value to hash
 * @returns {Promise<string|null>} 64-char hex HMAC or null
 */
export async function piiHmac(supabase, value) {
  if (!value || typeof value !== 'string' || !value.trim()) return null

  const { data, error } = await supabase.rpc('pii_hmac', {
    plaintext: value,
  })

  if (error) {
    console.error('[PII] pii_hmac error:', error.message)
    return null
  }

  return data
}

/**
 * Compute a case-sensitive blind index (HMAC) for PII search.
 * Use for: plate_number, VIN, registration_number, tax_id.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} value - The plaintext value to hash
 * @returns {Promise<string|null>} 64-char hex HMAC or null
 */
export async function piiHmacRaw(supabase, value) {
  if (!value || typeof value !== 'string' || !value.trim()) return null

  const { data, error } = await supabase.rpc('pii_hmac_raw', {
    plaintext: value,
  })

  if (error) {
    console.error('[PII] pii_hmac_raw error:', error.message)
    return null
  }

  return data
}
