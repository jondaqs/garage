'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, Loader2, Car, AlertTriangle } from 'lucide-react'

function MfaVerifyInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase     = createClient()

  const [code,     setCode]     = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [verifying, setVerifying] = useState(false)
  const [factorId, setFactorId] = useState(null)

  const nextParam = searchParams.get('next') || null

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/auth/login')
          return
        }

        const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
        if (fErr) throw fErr

        const verified = factors?.totp?.find(f => f.status === 'verified')
        if (!verified) {
          // No 2FA factor — shouldn't be here, redirect to dashboard
          redirectToDashboard()
          return
        }

        setFactorId(verified.id)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [supabase, router])

  const redirectToDashboard = async () => {
    if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
      router.replace(nextParam)
      return
    }

    // Determine role-based redirect
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth/login'); return }

    const { data: profile } = await supabase
      .from('user_profiles_secure')
      .select(`id, user_roles(role:user_roles_lookup(code))`)
      .eq('auth_user_id', user.id)
      .single()

    const codes = profile?.user_roles?.map(ur => ur.role?.code).filter(Boolean) ?? []

    if (codes.includes('admin') || codes.includes('platform_admin')) {
      router.replace('/admin/dashboard')
    } else if (codes.includes('company_owner')) {
      router.replace('/company/dashboard')
    } else if (codes.includes('service_provider_owner')) {
      router.replace('/provider/dashboard')
    } else {
      router.replace('/dashboard')
    }
    router.refresh()
  }

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code')
      return
    }

    setVerifying(true)
    setError('')

    try {
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId,
      })
      if (chalErr) throw chalErr

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      })
      if (verErr) throw new Error('Invalid code. Please check your authenticator app and try again.')

      await redirectToDashboard()
    } catch (e) {
      setError(e.message)
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <Car size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GariCare</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-50 rounded-full mb-2">
              <ShieldCheck size={24} className="text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Two-Factor Verification
            </h2>
            <p className="text-sm text-gray-500">
              Enter the 6-digit code from your authenticator app to continue.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(val)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.length === 6) handleVerify()
              }}
              className="w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-base placeholder:tracking-normal"
              placeholder="000000"
              autoFocus
              autoComplete="one-time-code"
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={verifying || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold transition-colors"
          >
            {verifying ? (
              <><Loader2 size={16} className="animate-spin" /> Verifying…</>
            ) : (
              <><ShieldCheck size={16} /> Verify & Continue</>
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            Open your authenticator app (Google Authenticator, Authy, etc.) to get the code.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function MfaVerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    }>
      <MfaVerifyInner />
    </Suspense>
  )
}