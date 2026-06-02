'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Car, Lock, Eye, EyeOff, Loader2, CheckCircle,
  ShieldCheck, AlertTriangle, Shield,
} from 'lucide-react'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const router   = useRouter()
  const supabase = createClient()

  // ── session / MFA state ────────────────────────────────────
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession]           = useState(false)
  const [needsMfa, setNeedsMfa]               = useState(false)
  const [mfaFactorId, setMfaFactorId]         = useState(null)
  const [mfaVerified, setMfaVerified]         = useState(false)

  // ── MFA verification state ─────────────────────────────────
  const [mfaCode, setMfaCode]         = useState('')
  const [mfaVerifying, setMfaVerifying] = useState(false)
  const [mfaError, setMfaError]       = useState('')

  // ── password form state ────────────────────────────────────
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState(false)

  // ── init: check session + MFA status ───────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setCheckingSession(false); return }

        setHasSession(true)

        // Check if user has MFA enrolled
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const verifiedFactor = factors?.totp?.find(f => f.status === 'verified')

        if (verifiedFactor) {
          // Check current AAL — maybe already at AAL2
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aal?.currentLevel === 'aal2') {
            // Already elevated — skip MFA step
            setMfaVerified(true)
          } else {
            setNeedsMfa(true)
            setMfaFactorId(verifiedFactor.id)
          }
        } else {
          // No MFA — can proceed directly
          setMfaVerified(true)
        }
      } catch (e) {
        console.error('Session check failed:', e)
      } finally {
        setCheckingSession(false)
      }
    }
    init()
  }, [supabase])

  // ── MFA verify handler ─────────────────────────────────────
  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) {
      setMfaError('Enter the full 6-digit code')
      return
    }

    setMfaVerifying(true)
    setMfaError('')

    try {
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      })
      if (chalErr) throw chalErr

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode,
      })
      if (verErr) throw new Error('Invalid code. Please check your authenticator app and try again.')

      // Now at AAL2 — proceed to password form
      setNeedsMfa(false)
      setMfaVerified(true)
    } catch (e) {
      setMfaError(e.message)
      setMfaCode('')
    } finally {
      setMfaVerifying(false)
    }
  }

  // ── password checks ────────────────────────────────────────
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    match:     password.length > 0 && password === confirm,
  }
  const allPassed = Object.values(checks).every(Boolean)

  // ── password reset handler ─────────────────────────────────
  const handleReset = async (e) => {
    e.preventDefault()

    if (!allPassed) {
      setError('Please meet all password requirements')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reset',
          newPassword: password,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset password')

      setSuccess(true)

      // Sign out so they can log in fresh with the new password
      setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/auth/login?message=password_reset')
      }, 3000)
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── loading ────────────────────────────────────────────────
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    )
  }

  // ── no session ─────────────────────────────────────────────
  if (!hasSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center space-y-5">
            <div className="flex items-center justify-center">
              <Car className="text-blue-600 mr-2" size={40} />
              <h1 className="text-3xl font-bold text-gray-800">GariCare</h1>
            </div>

            <div className="flex flex-col items-center gap-3 p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={32} className="text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-800">Invalid or Expired Link</p>
                <p className="text-xs text-amber-600 mt-1">
                  This password reset link is no longer valid. Please request a new one.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href="/auth/forgot-password"
                className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium text-center"
              >
                Request New Reset Link
              </Link>
              <Link
                href="/auth/login"
                className="text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Car className="text-blue-600 mr-2" size={40} />
              <h1 className="text-3xl font-bold text-gray-800">GariCare</h1>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">
              {needsMfa ? 'Verify Your Identity' : 'Set New Password'}
            </h2>
            <p className="text-gray-600 mt-2">
              {success
                ? 'Your password has been updated'
                : needsMfa
                  ? 'Enter your 2FA code to continue with the password reset'
                  : 'Choose a strong password for your account'}
            </p>
          </div>

          {/* ── SUCCESS STATE ── */}
          {success && (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-3 p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle size={36} className="text-emerald-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-800">
                    Password Reset Successful
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">
                    Redirecting you to sign in with your new password…
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── MFA VERIFICATION STEP ── */}
          {!success && needsMfa && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <Shield size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Your account has two-factor authentication enabled. 
                  Please verify with your authenticator app to proceed.
                </p>
              </div>

              {mfaError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{mfaError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Authentication Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setMfaCode(val)
                    setMfaError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mfaCode.length === 6) handleMfaVerify()
                  }}
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-base placeholder:tracking-normal"
                  placeholder="000000"
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>

              <button
                onClick={handleMfaVerify}
                disabled={mfaVerifying || mfaCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                {mfaVerifying ? (
                  <><Loader2 size={18} className="animate-spin" /> Verifying…</>
                ) : (
                  <><ShieldCheck size={18} /> Verify & Continue</>
                )}
              </button>

              <p className="text-center text-xs text-gray-400">
                Open your authenticator app (Google Authenticator, Authy, etc.) to get the code.
              </p>
            </div>
          )}

          {/* ── PASSWORD FORM (shown after MFA verified or if no MFA) ── */}
          {!success && mfaVerified && (
            <form onSubmit={handleReset} className="space-y-5">
              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    required
                    autoFocus
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError('') }}
                    required
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* Password requirements */}
              {password.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg space-y-1.5">
                  <p className="text-xs font-medium text-gray-600 mb-1">Password requirements:</p>
                  <Requirement met={checks.length}    label="At least 8 characters" />
                  <Requirement met={checks.uppercase}  label="One uppercase letter" />
                  <Requirement met={checks.lowercase}  label="One lowercase letter" />
                  <Requirement met={checks.number}     label="One number" />
                  {confirm.length > 0 && (
                    <Requirement met={checks.match}    label="Passwords match" />
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !allPassed}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Resetting…</>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function Requirement({ met, label }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${met ? 'bg-emerald-100' : 'bg-gray-200'}`}>
        {met ? (
          <CheckCircle size={10} className="text-emerald-600" />
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        )}
      </div>
      <span className={met ? 'text-emerald-700' : 'text-gray-500'}>{label}</span>
    </div>
  )
}