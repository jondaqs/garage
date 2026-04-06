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
  // NOT LOGGED IN — protect all app routes
  // ============================================================
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

  // ============================================================
  // LOGGED IN — resolve role from user_roles only (single query)
  // No extra round-trips to company_profiles or company_users.
  // Roles are assigned at registration and kept in sync by DB functions.
  // ============================================================
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

  const codes = profile.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []

  // Priority order — highest wins
  const isAdmin        = codes.includes('admin') || codes.includes('platform_admin')
  const isProvider     = codes.includes('service_provider_owner')
  const isCompanyOwner = codes.includes('company_owner')
  const isCompanyMember= codes.includes('company_member')

  let role = 'user'
  if (isAdmin)          role = 'admin'
  else if (isProvider)  role = 'provider'
  else if (isCompanyOwner)  role = 'company'   // owner → dedicated /company portal
  else if (isCompanyMember) role = 'member'    // member → stays in /dashboard

  // ============================================================
  // ROUTE PROTECTION
  // ============================================================

  // /admin — admins only
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // /company — company owners only
  // Members are NOT sent here — they use /dashboard with company sidebar sections
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
  if (pathname.startsWith('/dashboard')) {
    if (role === 'admin')   return NextResponse.redirect(new URL('/admin/dashboard',    request.url))
    if (role === 'company') return NextResponse.redirect(new URL('/company/dashboard',  request.url))
    if (role === 'provider')return NextResponse.redirect(new URL('/provider/dashboard', request.url))
    // role='member' and role='user' — let through to /dashboard
    return response
  }

  // /auth/login or /auth/signup — redirect already-logged-in users away
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup')) {
    if (role === 'admin')   return NextResponse.redirect(new URL('/admin/dashboard',    request.url))
    if (role === 'company') return NextResponse.redirect(new URL('/company/dashboard',  request.url))
    if (role === 'provider')return NextResponse.redirect(new URL('/provider/dashboard', request.url))
    // members and regular users → /dashboard
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