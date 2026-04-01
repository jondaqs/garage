import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
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

  // Get the current session
  const { data: { session } } = await supabase.auth.getSession()

  // Company routes protection
  if (pathname.startsWith('/company')) {
    // First check if user is logged in
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // Get user from session
    const user = session.user

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      // No user profile found, redirect to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // ========================================
    // ✅ FIXED: Check BOTH ownership and membership
    // ========================================
    
    // Check if user owns a company
    const { data: ownedCompany } = await supabase
      .from('company_profiles')
      .select('id, status')
      .eq('owner_user_id', userProfile.id)
      .single()

    // Check if user is a company member
    const { data: companyMembership } = await supabase
      .from('company_users')
      .select('id, company_id, is_active')
      .eq('user_id', userProfile.id)
      .eq('is_active', true)
      .single()

    // Allow access if user either owns a company OR is a member
    if (ownedCompany || companyMembership) {
      // User has company access, allow through
      return response
    }

    // User has no company access, redirect to company signup
    return NextResponse.redirect(new URL('/auth/company-signup', request.url))
  }

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // Redirect to dashboard if already logged in and trying to access auth pages
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup')) {
    if (session) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*', 
    '/auth/:path*',
    '/company/:path*'
  ],
}