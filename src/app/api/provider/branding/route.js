/**
 * POST /api/provider/branding
 *
 * Uploads a provider header or footer image to storage (service role)
 * and tracks it in uploaded_files.
 *
 * FormData fields:
 *   file  – the image file (PNG/JPG, will be converted to WebP client-side)
 *   type  – "header" | "footer"
 *
 * DELETE /api/provider/branding?type=header|footer
 *
 * Removes the specified branding image.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient }                from '@supabase/ssr'
import { cookies }                           from 'next/headers'
import { NextResponse }                      from 'next/server'
import { writeLimiter }                      from '@/lib/rateLimiters'

const BUCKET = 'platform-assets'
const VALID_TYPES = ['header', 'footer']

function getServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getCallerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()      { return cookieStore.getAll() },
        setAll(toSet) { try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
      },
    },
  )
}

/** Resolve the provider owned by the caller. Returns { profileId, providerId } or null. */
async function resolveProvider(supabase, sc) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile } = await sc
    .from('user_profiles_secure')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile) return null

  const { data: sp } = await sc
    .from('service_providers_secure')
    .select('id')
    .eq('owner_user_id', profile.id)
    .single()
  if (!sp) return null

  return { profileId: profile.id, providerId: sp.id }
}

// ── POST — upload branding image ──────────────────────────────────────────────
export async function POST(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await getCallerClient()
    const sc       = getServiceClient()

    const ctx = await resolveProvider(supabase, sc)
    if (!ctx) return NextResponse.json({ error: 'Not authenticated or not a provider owner.' }, { status: 403 })

    const formData = await request.formData()
    const file = formData.get('file')
    const type = formData.get('type') // "header" | "footer"

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Type must be "header" or "footer".' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image.' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5 MB.' }, { status: 400 })
    }

    const refType  = `provider_branding_${type}`
    const filePath = `provider-branding/${ctx.providerId}/${type}.webp`

    // 1. Remove old file from storage (ignore errors if not found)
    await sc.storage.from(BUCKET).remove([filePath])

    // 2. Upload the new file
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadErr } = await sc.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '300',
        upsert: true,
      })
    if (uploadErr) throw uploadErr

    // 3. Get the public URL
    const { data: { publicUrl } } = sc.storage
      .from(BUCKET)
      .getPublicUrl(filePath)

    // 4. Upsert uploaded_files tracking row
    //    Delete any existing row for this branding type + provider, then insert.
    await sc.from('uploaded_files')
      .delete()
      .eq('reference_type', refType)
      .eq('reference_id', ctx.providerId)

    await sc.from('uploaded_files').insert({
      uploader_user_id: ctx.profileId,
      file_name:        `${type}.webp`,
      file_size:        file.size,
      file_type:        file.type,
      storage_path:     filePath,
      storage_bucket:   BUCKET,
      reference_type:   refType,
      reference_id:     ctx.providerId,
      is_public:        true,
    })

    return NextResponse.json({ url: publicUrl + '?t=' + Date.now() })
  } catch (err) {
    console.error('Branding upload error:', err)
    return NextResponse.json({ error: 'Failed to upload branding image.' }, { status: 500 })
  }
}

// ── DELETE — remove branding image ────────────────────────────────────────────
export async function DELETE(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

  try {
    const supabase = await getCallerClient()
    const sc       = getServiceClient()

    const ctx = await resolveProvider(supabase, sc)
    if (!ctx) return NextResponse.json({ error: 'Not authenticated or not a provider owner.' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Type must be "header" or "footer".' }, { status: 400 })
    }

    const refType  = `provider_branding_${type}`
    const filePath = `provider-branding/${ctx.providerId}/${type}.webp`

    // Remove from storage
    await sc.storage.from(BUCKET).remove([filePath])

    // Remove tracking row
    await sc.from('uploaded_files')
      .delete()
      .eq('reference_type', refType)
      .eq('reference_id', ctx.providerId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Branding delete error:', err)
    return NextResponse.json({ error: 'Failed to delete branding image.' }, { status: 500 })
  }
}
