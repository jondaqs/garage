import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimiter'

// Auth pages: 20 requests per minute per IP
const authLimiter = rateLimit({ windowMs: 60_000, max: 20, message: 'Too many requests. Please slow down and try again.' })

// Exchange rate / pricing: 10 requests per minute per IP
const rateLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'Too many rate lookups. Please try again shortly.' })

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // ============================================================
  // Rate-limit auth pages to deter brute-force / bot traffic
  // ============================================================
  const isAuthPage =
    pathname.startsWith('/auth/login') ||
    pathname.startsWith('/auth/forgot-password') ||
    pathname.startsWith('/auth/mfa-verify') ||
    pathname.startsWith('/auth/reset-password')

  if (isAuthPage) {
    const limited = authLimiter.check(request)
    if (limited) return limited
  }

  // ============================================================
  // Rate-limit exchange rate API + pricing page
  // ============================================================
  if (pathname.startsWith('/api/pricing/exchange-rate') || pathname === '/pricing') {
    const limited = rateLimiter.check(request)
    if (limited) return limited
  }

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
  // Allow MFA pages to load without redirect loops.
  // ============================================================
  if (pathname.startsWith('/auth/mfa-verify') || pathname.startsWith('/auth/mfa-setup-required')) {
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
  // MFA ENFORCEMENT — if the user has enrolled TOTP factors but
  // the current session is only AAL1, redirect to MFA verify.
  // ============================================================
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/provider') ||
    pathname.startsWith('/company') ||
    pathname.startsWith('/admin')

  if (isProtectedRoute) {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const mfaUrl = new URL('/auth/mfa-verify', request.url)
        const nextPath = pathname + (request.nextUrl.search || '')
        mfaUrl.searchParams.set('next', nextPath)
        return NextResponse.redirect(mfaUrl)
      }
    } catch {
      // If AAL check fails, allow through — the page will handle it
    }
  }

  // ============================================================
  // LOGGED IN — resolve role + account status in one query.
  // ============================================================
  const { data: profile } = await supabase
    .from('user_profiles_secure')
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

  // ============================================================
  // MANDATORY 2FA — certain roles MUST have TOTP enrolled.
  // If not enrolled, redirect to the setup-required page.
  // ============================================================
  const roleMust2FA = isAdmin || isProvider || isCompanyOwner || isCompanyMember

  // Provider team members (mechanics, managers, etc.) don't have a
  // dedicated role code — they're tracked via service_provider_users.
  let isProviderTeamMember = false
  if (!roleMust2FA && role === 'user' && isProtectedRoute) {
    const { data: spu } = await supabase
      .from('service_provider_users')
      .select('id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    isProviderTeamMember = !!spu
  }

  if ((roleMust2FA || isProviderTeamMember) && isProtectedRoute) {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal1') {
        // No TOTP factor enrolled — force setup
        const setupUrl = new URL('/auth/mfa-setup-required', request.url)
        const nextPath = pathname + (request.nextUrl.search || '')
        setupUrl.searchParams.set('next', nextPath)
        return NextResponse.redirect(setupUrl)
      }
    } catch {
      // If check fails, allow through
    }
  }

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
      .from('company_profiles_secure')
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
      .from('service_providers_secure')
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

  // /dashboard — redirect away only if the user has a dedicated portal
  // Portal mode: when admin enters via ?portal=user, a cookie is set so ALL
  // subsequent /dashboard/* navigations work without the query param.
  if (pathname.startsWith('/dashboard')) {
    if (role === 'admin') {
      const wantsUserPortal = request.nextUrl.searchParams.get('portal') === 'user'
      const hasPortalCookie = request.cookies.get('portal_mode')?.value === 'user'

      if (wantsUserPortal && !hasPortalCookie) {
        // Set cookie and continue (strip query param via redirect for clean URLs)
        const cleanUrl = new URL(pathname, request.url)
        const res = NextResponse.redirect(cleanUrl)
        res.cookies.set('portal_mode', 'user', { path: '/', maxAge: 60 * 60 * 4, sameSite: 'lax' })
        return res
      }

      if (!wantsUserPortal && !hasPortalCookie) {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url))
      }
      // hasPortalCookie — allow through
    }
    if (role === 'company') return NextResponse.redirect(new URL('/company/dashboard',  request.url))
    if (role === 'provider')return NextResponse.redirect(new URL('/provider/dashboard', request.url))
    return response
  }

  // /admin — admins only. Clear portal cookie when returning to admin panel.
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    if (request.cookies.get('portal_mode')?.value) {
      response.cookies.set('portal_mode', '', { path: '/', maxAge: 0 })
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