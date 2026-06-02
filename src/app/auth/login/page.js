'use client'

import React, { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Car, Mail, Lock, Eye, EyeOff, Chrome, CheckCircle } from 'lucide-react'
import Link from 'next/link'

/**
 * Only accept relative same-origin paths as a post-login destination —
 * never a fully-qualified URL — to avoid open-redirect abuse via the
 * ?next= parameter (e.g. ?next=https://evil.example.com).
 */
const safeNext = (raw) => {
  if (!raw) return null
  if (typeof raw !== 'string') return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

function LoginPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()
  const nextParam    = safeNext(searchParams.get('next'))

  const [formData, setFormData] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const message = searchParams.get('message')

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (signInError) throw signInError

      if (authData.user) {
        // ── Check if user has 2FA enabled ─────────────────────────
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const hasTotp = factors?.totp?.some(f => f.status === 'verified')

        if (hasTotp) {
          // Check current assurance level — if already AAL2, skip MFA page
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aal?.currentLevel !== 'aal2') {
            const mfaUrl = nextParam
              ? `/auth/mfa-verify?next=${encodeURIComponent(nextParam)}`
              : '/auth/mfa-verify'
            router.push(mfaUrl)
            return
          }
        }

        // Single query — roles already include everything we need
        const { data: profile } = await supabase
          .from('user_profiles')
          .select(`
            id,
            user_roles(
              role:user_roles_lookup(code)
            )
          `)
          .eq('auth_user_id', authData.user.id)
          .single()

        const codes = profile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []

        // ── Honour ?next= first ──────────────────────────────────
        // If the user was deep-linked into a protected page (e.g. via
        // the invoice email CTA), middleware preserved the path on the
        // query string. Send them there in preference to the role default.
        if (nextParam) {
          router.push(nextParam)
          router.refresh()
          return
        }

        // ── Priority order ──────────────────────────────────────
        // 1. Platform admin
        if (codes.includes('admin') || codes.includes('platform_admin')) {
          router.push('/admin/dashboard')
          router.refresh()
          return
        }

        // 2. Company owner → dedicated company portal
        if (codes.includes('company_owner')) {
          router.push('/company/dashboard')
          router.refresh()
          return
        }

        // 3. Service provider owner
        if (codes.includes('service_provider_owner')) {
          // Verify registration is complete
          const { data: provider } = await supabase
            .from('service_providers')
            .select('id')
            .eq('owner_user_id', profile.id)
            .maybeSingle()

          if (!provider) {
            // Registration flow not yet completed
            router.push('/auth/provider-signup')
          } else {
            router.push('/provider/dashboard')
            router.refresh()
          }
          return
        }

        // 4. Company member → normal dashboard
        // (Sidebar will detect membership and inject company nav sections)
        if (codes.includes('company_member')) {
          router.push('/dashboard')
          router.refresh()
          return
        }

        // 5. Regular user
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    // Pass `next` through OAuth so /auth/callback can route the user to the
    // original deep-link destination after Supabase finishes the exchange.
    const callback = new URL('/auth/callback', window.location.origin)
    if (nextParam) callback.searchParams.set('next', nextParam)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 text-blue-600 hover:text-blue-700 font-medium flex items-center"
        >
          ← Back to Home
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Car className="text-blue-600 mr-2" size={40} />
              <h1 className="text-3xl font-bold text-gray-800">GariCare</h1>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Welcome Back</h2>
            <p className="text-gray-600 mt-2">Sign in to continue</p>
          </div>

          {message === 'password_reset' && (
            <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
              <CheckCircle size={16} className="flex-shrink-0" />
              Password reset successful. Sign in with your new password.
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition font-medium flex items-center justify-center mb-6 disabled:opacity-50"
          >
            <Chrome className="mr-2" size={20} />
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <Link href="/auth/forgot-password" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/auth/signup" className="text-blue-600 hover:text-blue-700 font-medium">
              Don&apos;t have an account? Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// Next 16 requires components using useSearchParams() to sit under a
// Suspense boundary so the rest of the page can be statically rendered.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}