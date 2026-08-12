/**
 * Fetch branding image URLs (header & footer) for a service provider.
 *
 * Used by all PDF generators (invoice, receipt, work-order report) to
 * conditionally include provider branding. Returns null URLs when no
 * branding images have been uploaded — callers should skip rendering
 * in that case.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sc  Service-role client
 * @param {string} providerId  UUID of the service provider
 * @returns {Promise<{ headerUrl: string|null, footerUrl: string|null }>}
 */
export async function getProviderBranding(sc, providerId) {
  const result = { headerUrl: null, footerUrl: null }
  if (!providerId) return result

  try {
    const { data } = await sc
      .from('uploaded_files')
      .select('reference_type, storage_path, storage_bucket')
      .eq('reference_id', providerId)
      .in('reference_type', ['provider_branding_header', 'provider_branding_footer'])

    if (!data || data.length === 0) return result

    for (const row of data) {
      const { data: { publicUrl } } = sc.storage
        .from(row.storage_bucket)
        .getPublicUrl(row.storage_path)

      if (row.reference_type === 'provider_branding_header') {
        result.headerUrl = publicUrl
      } else {
        result.footerUrl = publicUrl
      }
    }
  } catch (e) {
    console.error('getProviderBranding error:', e.message)
  }

  return result
}
