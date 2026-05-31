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

  // Refresh session
  const { data: { session } } = await supabase.auth.getSession()

  // ============================================================
  // Allow the suspended page itself (and its assets) to load
  // without triggering redirect loops.
  // ============================================================
  if (pathname.startsWith('/account/suspended')) {
    return response
  }

  // ============================================================
  // NOT LOGGED IN — protect all app routes
  // ============================================================
  if (!session) {
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/provider') ||
      pathname.startsWith('/company') ||
      pathname.startsWith('/admin')
    ) {
      const loginUrl = new URL('/auth/login', request.url)
      const nextPath = pathname + (request.nextUrl.search || '')
      loginUrl.searchParams.set('next', nextPath)
      return NextResponse.redirect(loginUrl)
    }
    return response
  }

  // ============================================================
  // LOGGED IN — resolve role + account status in one query.
  // ============================================================
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(`
      id,
      is_active,
      is_suspended,
      user_roles(
        role:user_roles_lookup(code)
      )
    `)
    .eq('auth_user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // ── Account-level block check ────────────────────────────────
  // If the user_profiles row is suspended or inactive, redirect
  // to the suspended page regardless of role.
  if (profile.is_suspended) {
    const url = new URL('/account/suspended', request.url)
    url.searchParams.set('reason', 'suspended')
    return NextResponse.redirect(url)
  }

  if (!profile.is_active) {
    const url = new URL('/account/suspended', request.url)
    url.searchParams.set('reason', 'deactivated')
    return NextResponse.redirect(url)
  }

  const codes = profile.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []

  // Priority order — highest wins
  // All admin sub-roles (platform_admin, admin, moderator, support, reviewer)
  // get access to /admin/*. Permissions within are enforced at the UI/RPC level.
  const ADMIN_CODES = ['admin', 'platform_admin', 'moderator', 'support', 'reviewer']
  const isAdmin        = codes.some(c => ADMIN_CODES.includes(c))
  const isProvider     = codes.includes('service_provider_owner')
  const isCompanyOwner = codes.includes('company_owner')
  const isCompanyMember= codes.includes('company_member')

  let role = 'user'
  if (isAdmin)          role = 'admin'
  else if (isProvider)  role = 'provider'
  else if (isCompanyOwner)  role = 'company'
  else if (isCompanyMember) role = 'member'

  // ── Entity-level block checks ────────────────────────────────
  // Only OWNERS are locked out of their dedicated portals.
  // Staff / members keep access to /dashboard as normal users —
  // the cascade (is_active=false on membership tables) prevents
  // them from seeing provider/company-specific features inside
  // the dashboard, but they can still manage personal vehicles,
  // bookings, etc.

  // Company owner → blocked from /company/*
  if (role === 'company' && pathname.startsWith('/company')) {
    const { data: company } = await supabase
      .from('company_profiles')
      .select('status, is_suspended')
      .eq('owner_user_id', profile.id)
      .single()

    if (company?.is_suspended || company?.status === 'suspended' || company?.status === 'deactivated') {
      const url = new URL('/account/suspended', request.url)
      url.searchParams.set('reason', 'company_suspended')
      return NextResponse.redirect(url)
    }
  }

  // Provider owner → blocked from /provider/*
  if (role === 'provider' && pathname.startsWith('/provider')) {
    const { data: provider } = await supabase
      .from('service_providers')
      .select('status, is_active')
      .eq('owner_user_id', profile.id)
      .single()

    if (provider?.status === 'suspended' || provider?.status === 'deactivated' || provider?.is_active === false) {
      const url = new URL('/account/suspended', request.url)
      url.searchParams.set('reason', 'provider_suspended')
      return NextResponse.redirect(url)
    }
  }

  // ============================================================
  // ROUTE PROTECTION (unchanged)
  // ============================================================

  // /admin — admins only
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // /company — company owners only
  if (pathname.startsWith('/company')) {
    if (role !== 'company') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // /provider — service providers only
  if (pathname.startsWith('/provider')) {
    if (role !== 'provider') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // /dashboard — redirect away only if the user has a dedicated portal
  // Exception: admins can access the user dashboard via ?portal=user
  if (pathname.startsWith('/dashboard')) {
    if (role === 'admin') {
      const wantsUserPortal = request.nextUrl.searchParams.get('portal') === 'user'
      if (!wantsUserPortal) return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
    if (role === 'company') return NextResponse.redirect(new URL('/company/dashboard',  request.url))
    if (role === 'provider')return NextResponse.redirect(new URL('/provider/dashboard', request.url))
    return response
  }

  // /auth/login or /auth/signup — redirect already-logged-in users away
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup')) {
    const next = request.nextUrl.searchParams.get('next')
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      return NextResponse.redirect(new URL(next, request.url))
    }
    if (role === 'admin')   return NextResponse.redirect(new URL('/admin/dashboard',    request.url))
    if (role === 'company') return NextResponse.redirect(new URL('/company/dashboard',  request.url))
    if (role === 'provider')return NextResponse.redirect(new URL('/provider/dashboard', request.url))
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
    '/account/:path*',
  ],
}