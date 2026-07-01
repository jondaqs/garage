/**
 * POST /api/profile/avatar
 *
 * Handles avatar upload server-side using the service role client,
 * bypassing storage RLS policies. The caller's session is verified
 * first to ensure only authenticated users can upload.
 *
 * Accepts: multipart/form-data with a single "file" field.
 * Returns: { url: string } — the public URL of the uploaded avatar.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient }                from '@supabase/ssr'
import { cookies }                           from 'next/headers'
import { NextResponse }                      from 'next/server'

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
  try {
    // 1. Verify the caller is authenticated
    const supabase = await getCallerClient()
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    // 2. Parse the uploaded file
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

    // 3. Delete old avatar files for this user
    const { data: existingFiles } = await admin.storage
      .from('avatars')
      .list(user.id)

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles.map(f => `${user.id}/${f.name}`)
      await admin.storage.from('avatars').remove(filesToDelete)
    }

    // 4. Upload the new file using the service role (bypasses storage RLS)
    const fileExt = file.name.split('.').pop() || 'webp'
    const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadErr) throw uploadErr

    // 5. Get the public URL
    const { data: { publicUrl } } = admin.storage
      .from('avatars')
      .getPublicUrl(filePath)

    // 6. Update user_profiles with the new URL
    const { error: profileErr } = await admin
      .from('user_profiles')
      .update({ profile_picture_url: publicUrl })
      .eq('auth_user_id', user.id)

    if (profileErr) throw profileErr

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('Avatar upload error!')
    return NextResponse.json(
      { error: 'Failed to upload avatar.' },
      { status: 500 },
    )
  }
}