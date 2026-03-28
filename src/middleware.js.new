// src/middleware.js
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession()

  const pathname = request.nextUrl.pathname

  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/auth/login',
    '/auth/signup',
    '/auth/provider-signup',
    '/auth/company-signup',
    '/auth/callback',
    '/auth/reset-password',
    '/auth/update-password',
  ]

  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  )

  // Authentication check for protected routes
  if (!isPublicRoute && !session) {
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect authenticated users away from signup/login pages to their appropriate dashboard
  if (session) {
    // Check if on any signup or login page
    const authPages = ['/auth/login', '/auth/signup', '/auth/provider-signup']
    const isOnAuthPage = authPages.some(page => pathname === page)
    
    if (isOnAuthPage) {
      // Allow access to company-signup even if authenticated (users can create companies later)
      if (pathname === '/auth/company-signup') {
        return supabaseResponse
      }

      // Get user's profile to determine their type
      const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
          company_id,
          service_provider:service_provider_users(service_provider_id, is_active)
        `)
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      // Redirect company users
      if (profile?.company_id) {
        const { data: company } = await supabase
          .from('company_profiles')
          .select('status, is_active, is_suspended')
          .eq('id', profile.company_id)
          .single()

        if (company?.is_suspended) {
          return NextResponse.redirect(new URL('/company/suspended', request.url))
        } else if (company?.status === 'pending_verification' || !company?.is_active) {
          return NextResponse.redirect(new URL('/company/pending-verification', request.url))
        } else {
          return NextResponse.redirect(new URL('/company/dashboard', request.url))
        }
      }

      // Redirect service providers
      if (profile?.service_provider?.[0]?.service_provider_id) {
        if (profile.service_provider[0].is_active) {
          return NextResponse.redirect(new URL('/provider/dashboard', request.url))
        } else {
          // Provider exists but not active yet
          return NextResponse.redirect(new URL('/provider/pending-approval', request.url))
        }
      }

      // Normal users
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Company routes protection
  if (pathname.startsWith('/company')) {
    if (!session) {
      const redirectUrl = new URL('/auth/login', request.url)
      redirectUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Allow company-signup for authenticated users (even if they're already a company owner)
    if (pathname === '/auth/company-signup') {
      return supabaseResponse
    }

    // Allow pending verification page
    if (pathname === '/company/pending-verification') {
      return supabaseResponse
    }

    // Allow suspended page
    if (pathname === '/company/suspended') {
      return supabaseResponse
    }

    // Check if user is part of a company for other company routes
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()

    if (!profile?.company_id) {
      // User not part of a company - redirect to company signup
      return NextResponse.redirect(new URL('/auth/company-signup', request.url))
    }

    // Check company status for dashboard and other restricted routes
    if (!pathname.includes('/pending-verification') && !pathname.includes('/suspended')) {
      const { data: company } = await supabase
        .from('company_profiles')
        .select('status, is_active, is_suspended')
        .eq('id', profile.company_id)
        .single()

      // If company is suspended, redirect to suspended page
      if (company?.is_suspended) {
        if (pathname !== '/company/suspended') {
          return NextResponse.redirect(new URL('/company/suspended', request.url))
        }
      }

      // If company is pending verification, redirect to pending page
      if ((company?.status === 'pending_verification' || !company?.is_active) && !company?.is_suspended) {
        if (pathname !== '/company/pending-verification') {
          return NextResponse.redirect(new URL('/company/pending-verification', request.url))
        }
      }
    }
  }

  // Provider routes protection
  if (pathname.startsWith('/provider')) {
    if (!session) {
      const redirectUrl = new URL('/auth/login', request.url)
      redirectUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Allow provider-signup for authenticated users
    if (pathname === '/auth/provider-signup') {
      return supabaseResponse
    }

    // Check if user is a service provider
    const { data: profile } = await supabase
      .from('user_profiles')
      .select(`
        id,
        service_provider:service_provider_users!inner(
          service_provider_id,
          is_active
        )
      `)
      .eq('auth_user_id', session.user.id)
      .maybeSingle()

    if (!profile?.service_provider?.[0]?.service_provider_id) {
      // User is not a provider - redirect to provider signup
      return NextResponse.redirect(new URL('/auth/provider-signup', request.url))
    }

    // Check if provider account is active (except for pending-approval page)
    if (!profile.service_provider[0].is_active && pathname !== '/provider/pending-approval') {
      return NextResponse.redirect(new URL('/provider/pending-approval', request.url))
    }
  }

  // Admin routes protection
  if (pathname.startsWith('/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single()

    if (profile) {
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select(`
          role:user_roles_lookup(code)
        `)
        .eq('user_id', profile.id)

      const isAdmin = userRoles?.some(ur => 
        ur.role?.code === 'platform_admin' || ur.role?.code === 'admin'
      )

      if (!isAdmin) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    } else {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Smart dashboard routing - redirect /dashboard based on user type
  if (pathname === '/dashboard' && session) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select(`
        company_id,
        service_provider:service_provider_users(service_provider_id, is_active)
      `)
      .eq('auth_user_id', session.user.id)
      .maybeSingle()

    // Redirect company users to company dashboard
    if (profile?.company_id) {
      const { data: company } = await supabase
        .from('company_profiles')
        .select('status, is_active, is_suspended')
        .eq('id', profile.company_id)
        .single()

      if (company?.is_suspended) {
        return NextResponse.redirect(new URL('/company/suspended', request.url))
      } else if (company?.status === 'pending_verification' || !company?.is_active) {
        return NextResponse.redirect(new URL('/company/pending-verification', request.url))
      } else {
        return NextResponse.redirect(new URL('/company/dashboard', request.url))
      }
    }

    // Redirect service providers to provider dashboard
    if (profile?.service_provider?.[0]?.service_provider_id) {
      if (profile.service_provider[0].is_active) {
        return NextResponse.redirect(new URL('/provider/dashboard', request.url))
      } else {
        return NextResponse.redirect(new URL('/provider/pending-approval', request.url))
      }
    }

    // Normal users stay at /dashboard (no redirect needed)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}