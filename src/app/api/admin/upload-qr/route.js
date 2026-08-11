/**
 * POST /api/admin/upload-qr
 *
 * Handles QR code upload server-side using the service role client,
 * bypassing storage RLS policies. The caller's session is verified
 * first and must be an admin.
 *
 * Accepts: multipart/form-data with a single "file" field.
 * Returns: { url: string } — the public URL of the uploaded QR code.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient }                from '@supabase/ssr'
import { cookies }                           from 'next/headers'
import { NextResponse }                      from 'next/server'
import { adminLimiter }                      from '@/lib/rateLimiters'

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

export async function POST(request) {
  const limited = adminLimiter.check(request)
  if (limited) return limited

  try {
    // 1. Verify the caller is authenticated
    const supabase = await getCallerClient()
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    // 2. Verify the caller is an admin
    const { data: isAdmin } = await supabase.rpc('is_user_admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    // 3. Parse the uploaded file
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image.' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5 MB.' }, { status: 400 })
    }

    const admin = getServiceClient()

    // 4. Delete old QR code files
    const { data: existingFiles } = await admin.storage
      .from('platform-assets')
      .list('public', { search: 'qr-code' })

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles
        .filter(f => f.name.startsWith('qr-code'))
        .map(f => `public/${f.name}`)
      if (filesToDelete.length > 0) {
        await admin.storage.from('platform-assets').remove(filesToDelete)
      }
    }

    // 5. Upload the new file using the service role (bypasses storage RLS)
    const fileExt = file.name.split('.').pop() || 'png'
    const filePath = `public/qr-code.${fileExt}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from('platform-assets')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '60',
        upsert: true,
      })

    if (uploadErr) throw uploadErr

    // 6. Get the public URL
    const { data: { publicUrl } } = admin.storage
      .from('platform-assets')
      .getPublicUrl(filePath)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('QR upload error:', err)
    return NextResponse.json(
      { error: 'Failed to upload QR code.' },
      { status: 500 },
    )
  }
}
