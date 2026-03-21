import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  // ============================================
  // IMPORTANT: Allow internal API calls to pass through
  // ============================================
  
  // Allow email API to be called without authentication
  // This is safe because it's only called server-to-server
  if (request.nextUrl.pathname === '/api/team/send-invitation-email') {
    console.log('🔓 Allowing email API call (internal)')
    return NextResponse.next()
  }
  
  // Allow test endpoints
  if (request.nextUrl.pathname.startsWith('/api/test-')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value
        },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Protect provider routes
  if (request.nextUrl.pathname.startsWith('/provider')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Redirect to dashboard if already logged in
  if (request.nextUrl.pathname.startsWith('/auth/login') || 
      request.nextUrl.pathname.startsWith('/auth/signup')) {
    if (session) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*', 
    '/provider/:path*',
    '/auth/:path*',
    '/api/team/:path*'  // Include API routes in matcher
  ],
}