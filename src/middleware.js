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

  // Get session
  const { data: { session } } = await supabase.auth.getSession()

  // ========================================
  // NOT LOGGED IN - Protect routes
  // ========================================
  if (!session) {
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/provider') ||
      pathname.startsWith('/company') ||
      pathname.startsWith('/admin')
    ) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    return response
  }

  // ========================================
  // LOGGED IN - Determine user role
  // ========================================
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(`
      id,
      user_roles(
        role:user_roles_lookup(code)
      )
    `)
    .eq('auth_user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  let role = 'user'

  // Check if admin (highest priority)
  const isAdmin = profile.user_roles?.some(ur => ur.role?.code === 'admin')
  if (isAdmin) {
    role = 'admin'
  }

  // Check if service provider
  const { data: provider } = await supabase
    .from('service_providers')
    .select('id, status')
    .eq('owner_user_id', profile.id)
    .maybeSingle()

  if (provider) {
    role = 'provider'
  }

  // Check if company owner (via company_profiles)
  const { data: ownedCompany } = await supabase
    .from('company_profiles')
    .select('id, status')
    .eq('owner_user_id', profile.id)
    .maybeSingle()

  if (ownedCompany) {
    role = 'company'
  }

  // Check if company member (via company_users)
  if (!ownedCompany) {
    const { data: companyMember } = await supabase
      .from('company_users')
      .select('company_id, is_active')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()

    if (companyMember) {
      role = 'company'
    }
  }

  // ========================================
  // ROUTE PROTECTION & REDIRECTION
  // ========================================

  // Admin routes
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Company routes
  if (pathname.startsWith('/company')) {
    if (role !== 'company') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Provider routes
  if (pathname.startsWith('/provider')) {
    if (role !== 'provider') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Regular dashboard - redirect based on role
  if (pathname.startsWith('/dashboard')) {
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
    if (role === 'company') {
      return NextResponse.redirect(new URL('/company/dashboard', request.url))
    }
    if (role === 'provider') {
      return NextResponse.redirect(new URL('/provider/dashboard', request.url))
    }
    return response
  }

  // Auth pages - redirect if already logged in
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup')) {
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
    if (role === 'company') {
      return NextResponse.redirect(new URL('/company/dashboard', request.url))
    }
    if (role === 'provider') {
      return NextResponse.redirect(new URL('/provider/dashboard', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/provider/:path*',
    '/company/:path*',
    '/admin/:path*',
    '/auth/:path*',
  ],
}