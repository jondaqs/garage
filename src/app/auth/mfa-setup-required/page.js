'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ShieldCheck, ShieldAlert, Loader2, Car, AlertTriangle,
  Copy, CheckCircle, Eye, EyeOff, Smartphone, LogOut,
} from 'lucide-react'

function MfaSetupRequiredInner() {
  const router   = useRouter()
  const params   = useSearchParams()
  const supabase = createClient()

  const nextParam = params.get('next') || null

  // ── state ───────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true)
  const [enrollData,   setEnrollData]   = useState(null)
  const [verifyCode,   setVerifyCode]   = useState('')
  const [verifying,    setVerifying]    = useState(false)
  const [error,        setError]        = useState('')
  const [showSecret,   setShowSecret]   = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)
  const [alreadyDone,  setAlreadyDone]  = useState(false)

  // ── check if user already has 2FA (shouldn't be here) ──────
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/auth/login'); return }

        const { data: factors } = await supabase.auth.mfa.listFactors()
        const verified = factors?.totp?.find(f => f.status === 'verified')
        if (verified) {
          setAlreadyDone(true)
          // They already have 2FA — redirect onward
          await redirectOnward()
          return
        }

        // Clean up any leftover unverified factors
        const unverified = factors?.totp?.find(f => f.status === 'unverified')
        if (unverified) {
          await supabase.auth.mfa.unenroll({ factorId: unverified.id })
        }

        // Start enrollment automatically
        await startEnroll()
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [supabase, router])

  // ── redirect helper ────────────────────────────────────────
  const redirectOnward = async () => {
    if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
      router.replace(nextParam)
      return
    }

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

  // ── enroll ─────────────────────────────────────────────────
  const startEnroll = async () => {
    setError('')
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'GariCare Authenticator',
      })
      if (err) throw err
      setEnrollData(data)
    } catch (e) {
      setError(e.message || 'Failed to start 2FA setup')
    }
  }

  // ── verify ─────────────────────────────────────────────────
  const verifyEnrollment = async () => {
    if (verifyCode.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app')
      return
    }
    setVerifying(true)
    setError('')

    try {
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId: enrollData.id,
      })
      if (chalErr) throw chalErr

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: enrollData.id,
        challengeId: challenge.id,
        code: verifyCode,
      })
      if (verErr) throw verErr

      // Success — redirect to MFA verify page (to complete AAL2)
      // or straight to dashboard since we just verified
      await redirectOnward()
    } catch (e) {
      setError(e.message || 'Invalid code. Please try again.')
      setVerifyCode('')
    } finally {
      setVerifying(false)
    }
  }

  // ── copy secret ────────────────────────────────────────────
  const copySecret = async () => {
    if (!enrollData?.totp?.secret) return
    try {
      await navigator.clipboard.writeText(enrollData.totp.secret)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = enrollData.totp.secret
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setSecretCopied(true)
    setTimeout(() => setSecretCopied(false), 2500)
  }

  // ── logout ─────────────────────────────────────────────────
  const handleLogout = async () => {
    // Clean up unverified factor before leaving
    if (enrollData?.id) {
      try { await supabase.auth.mfa.unenroll({ factorId: enrollData.id }) } catch {}
    }
    await supabase.auth.signOut()
    router.replace('/auth/login')
  }

  // ── loading ────────────────────────────────────────────────
  if (loading || alreadyDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <Car size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GariCare</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header banner */}
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
            <div className="flex items-start gap-3">
              <ShieldAlert size={22} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-amber-900">
                  Two-Factor Authentication Required
                </h2>
                <p className="text-sm text-amber-700 mt-1">
                  Your account role requires 2FA to be enabled before you can continue. 
                  This protects sensitive business data and operations.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {enrollData && (
              <>
                {/* Step 1: Scan */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-xs rounded-full">1</span>
                    Scan with your authenticator app
                  </div>
                  <p className="text-xs text-gray-500 ml-7">
                    Use Google Authenticator, Authy, Microsoft Authenticator, or any TOTP app.
                  </p>

                  <div className="flex justify-center py-3">
                    <div className="bg-white p-4 rounded-xl border-2 border-gray-100 shadow-sm">
                      <img
                        src={enrollData.totp.qr_code}
                        alt="Scan this QR code"
                        className="w-44 h-44"
                      />
                    </div>
                  </div>

                  {/* Manual secret */}
                  <div className="ml-7">
                    <button
                      onClick={() => setShowSecret(s => !s)}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
                    >
                      {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                      {showSecret ? 'Hide manual key' : "Can't scan? Enter key manually"}
                    </button>
                    {showSecret && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 break-all select-all">
                          {enrollData.totp.secret}
                        </code>
                        <button
                          onClick={copySecret}
                          className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Copy"
                        >
                          {secretCopied ? <CheckCircle size={16} className="text-emerald-500" /> : <Copy size={16} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: Verify */}
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <span className="flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-xs rounded-full">2</span>
                    Enter the 6-digit verification code
                  </div>
                  <div className="ml-7">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={verifyCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                        setVerifyCode(val)
                        setError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && verifyCode.length === 6) verifyEnrollment()
                      }}
                      className="w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-base placeholder:tracking-normal"
                      placeholder="000000"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <div className="ml-7">
                    <button
                      onClick={verifyEnrollment}
                      disabled={verifying || verifyCode.length !== 6}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold transition-colors"
                    >
                      {verifying ? (
                        <><Loader2 size={16} className="animate-spin" /> Verifying…</>
                      ) : (
                        <><ShieldCheck size={16} /> Verify &amp; Continue</>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Retry if enroll failed */}
            {!enrollData && error && (
              <button
                onClick={startEnroll}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold transition-colors"
              >
                <Smartphone size={16} />
                Retry Setup
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[11px] text-gray-400 max-w-[220px]">
              You won't be asked to set this up again once verified.
            </p>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              <LogOut size={13} />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MfaSetupRequiredPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    }>
      <MfaSetupRequiredInner />
    </Suspense>
  )
}