// src/app/api/test-service-key/route.js
// Quick test to verify service role key is set

import { NextResponse } from 'next/server'

export async function GET() {
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  
  return NextResponse.json({
    status: hasServiceKey ? 'SERVICE_KEY_FOUND' : 'SERVICE_KEY_MISSING',
    checks: {
      SUPABASE_SERVICE_ROLE_KEY: hasServiceKey,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: hasAnonKey,
      NEXT_PUBLIC_SUPABASE_URL: hasUrl
    },
    preview: hasServiceKey 
      ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...'
      : 'NOT SET',
    message: hasServiceKey
      ? '✅ Service role key is configured'
      : '❌ Service role key is MISSING - add SUPABASE_SERVICE_ROLE_KEY to Vercel'
  })
}