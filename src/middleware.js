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

  // ========================================
  // COMPANY ROUTES PROTECTION
  // ========================================
  if (pathname.startsWith('/company')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single()

    if (!userProfile) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // ✅ CRITICAL FIX: Check company_profiles FIRST (no recursion)
    // This checks if user OWNS a company
    const { data: ownedCompany } = await supabase
      .from('company_profiles')
      .select('id, status')
      .eq('owner_user_id', userProfile.id)
      .maybeSingle()  // Use maybeSingle to avoid error if not found

    // Then check company_users (will work because of non-recursive RLS)
    const { data: companyMembership } = await supabase
      .from('company_users')
      .select('company_id, is_active')
      .eq('user_id', userProfile.id)
      .eq('is_active', true)
      .maybeSingle()  // Use maybeSingle to avoid error if not found

    // Allow access if user either owns OR is a member
    if (ownedCompany || companyMembership) {
      return response
    }

    // No company access - redirect to company signup
    return NextResponse.redirect(new URL('/auth/company-signup', request.url))
  }

  // ========================================
  // DASHBOARD ROUTES PROTECTION
  // ========================================
  if (pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // ✅ NEW: If user has company, redirect to company dashboard
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single()

    if (userProfile) {
      // Check if owns company
      const { data: ownedCompany } = await supabase
        .from('company_profiles')
        .select('id')
        .eq('owner_user_id', userProfile.id)
        .maybeSingle()

      if (ownedCompany) {
        // User owns company - redirect to company dashboard
        return NextResponse.redirect(new URL('/company/dashboard', request.url))
      }
    }

    // Regular user - allow access to normal dashboard
    return response
  }

  // ========================================
  // AUTH PAGES (login/signup)
  // ========================================
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup')) {
    if (session) {
      // User already logged in - check if they have company
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .single()

      if (userProfile) {
        const { data: ownedCompany } = await supabase
          .from('company_profiles')
          .select('id')
          .eq('owner_user_id', userProfile.id)
          .maybeSingle()

        if (ownedCompany) {
          return NextResponse.redirect(new URL('/company/dashboard', request.url))
        }
      }

      // Regular user
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