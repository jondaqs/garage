'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Shield, ShieldCheck, ShieldOff, Loader2, Copy, CheckCircle,
  AlertTriangle, Smartphone, KeyRound, Eye, EyeOff, X,
} from 'lucide-react'

/**
 * TwoFactorSetup — drop-in 2FA enrollment / management component.
 *
 * Props:
 *   accentColor  — tailwind color prefix, e.g. 'blue' | 'green' | 'indigo'  (default 'blue')
 *
 * Uses Supabase Auth MFA (TOTP) under the hood:
 *   enroll → challenge → verify   (to enable)
 *   challenge → verify → unenroll (to disable)
 */
export default function TwoFactorSetup({ accentColor = 'blue' }) {
  const supabase = createClient()

  // ── state ──────────────────────────────────────────────────
  const [loading,        setLoading]        = useState(true)
  const [factor,         setFactor]         = useState(null)   // existing verified factor
  const [enrolling,      setEnrolling]      = useState(false)
  const [enrollData,     setEnrollData]     = useState(null)   // { id, totp: { qr_code, secret, uri } }
  const [verifyCode,     setVerifyCode]     = useState('')
  const [verifying,      setVerifying]      = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState('')
  const [showSecret,     setShowSecret]     = useState(false)
  const [secretCopied,   setSecretCopied]   = useState(false)
  const [disabling,      setDisabling]      = useState(false)
  const [disableCode,    setDisableCode]    = useState('')
  const [confirmDisable, setConfirmDisable] = useState(false)

  // ── load existing factors ──────────────────────────────────
  const loadFactors = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase.auth.mfa.listFactors()
      if (err) throw err
      // Find the first verified TOTP factor
      const verified = data?.totp?.find(f => f.status === 'verified') || null
      setFactor(verified)
    } catch (e) {
      console.error('Failed to load MFA factors:', e)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadFactors() }, [loadFactors])

  // ── enroll ─────────────────────────────────────────────────
  const startEnroll = async () => {
    setError('')
    setSuccess('')
    setEnrolling(true)
    setVerifyCode('')
    setShowSecret(false)
    setSecretCopied(false)

    try {
      // If there's an unverified factor from a previous attempt, unenroll it first
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const unverified = factors?.totp?.find(f => f.status === 'unverified')
      if (unverified) {
        await supabase.auth.mfa.unenroll({ factorId: unverified.id })
      }

      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Carfix-Connect Authenticator',
      })
      if (err) throw err
      setEnrollData(data)
    } catch (e) {
      setError(e.message || 'Failed to start 2FA setup')
      setEnrolling(false)
    }
  }

  const cancelEnroll = async () => {
    // Clean up the unverified factor
    if (enrollData?.id) {
      try { await supabase.auth.mfa.unenroll({ factorId: enrollData.id }) } catch {}
    }
    setEnrolling(false)
    setEnrollData(null)
    setVerifyCode('')
    setError('')
  }

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

      setSuccess('Two-factor authentication enabled successfully!')
      setEnrolling(false)
      setEnrollData(null)
      setVerifyCode('')
      await loadFactors()
      setTimeout(() => setSuccess(''), 5000)
    } catch (e) {
      setError(e.message || 'Invalid code. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  // ── disable ────────────────────────────────────────────────
  const startDisable = () => {
    setConfirmDisable(true)
    setDisableCode('')
    setError('')
    setSuccess('')
  }

  const executeDisable = async () => {
    if (disableCode.length !== 6) {
      setError('Enter the 6-digit code to confirm disabling 2FA')
      return
    }
    setDisabling(true)
    setError('')

    try {
      // Verify current code first
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      })
      if (chalErr) throw chalErr

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: disableCode,
      })
      if (verErr) throw new Error('Invalid code. Please enter a valid 2FA code.')

      // Now unenroll
      const { error: unErr } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      })
      if (unErr) throw unErr

      setSuccess('Two-factor authentication has been disabled.')
      setConfirmDisable(false)
      setDisableCode('')
      await loadFactors()
      setTimeout(() => setSuccess(''), 5000)
    } catch (e) {
      setError(e.message || 'Failed to disable 2FA')
    } finally {
      setDisabling(false)
    }
  }

  // ── copy secret to clipboard ───────────────────────────────
  const copySecret = async () => {
    if (!enrollData?.totp?.secret) return
    try {
      await navigator.clipboard.writeText(enrollData.totp.secret)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2500)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = enrollData.totp.secret
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2500)
    }
  }

  // ── shared styles ──────────────────────────────────────────
  const btnPrimary = `flex items-center justify-center gap-2 px-4 py-2.5 bg-${accentColor}-600 text-white rounded-lg hover:bg-${accentColor}-700 disabled:opacity-50 text-sm font-medium transition-colors`
  const btnOutline = `flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium transition-colors`
  const codeInput = `w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-${accentColor}-500 focus:border-transparent placeholder:text-base placeholder:tracking-normal`

  // ── loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-6 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Checking 2FA status…</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-2 rounded-lg ${factor ? 'bg-emerald-50' : 'bg-gray-100'}`}>
            {factor ? (
              <ShieldCheck size={20} className="text-emerald-600" />
            ) : (
              <Shield size={20} className="text-gray-400" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Two-Factor Authentication (2FA)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {factor
                ? 'Your account is protected with an authenticator app.'
                : 'Add an extra layer of security using an authenticator app.'}
            </p>
          </div>
        </div>
        {factor && !confirmDisable && !enrolling && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
            <CheckCircle size={12} />
            Enabled
          </span>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
          <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* ── 2FA NOT ENABLED — show enable button ── */}
      {!factor && !enrolling && (
        <button onClick={startEnroll} className={btnPrimary}>
          <Smartphone size={16} />
          Set Up Two-Factor Authentication
        </button>
      )}

      {/* ── ENROLLMENT FLOW ── */}
      {enrolling && enrollData && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Step 1: Scan QR */}
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <span className={`flex items-center justify-center w-5 h-5 bg-${accentColor}-600 text-white text-xs rounded-full`}>1</span>
              Scan the QR code with your authenticator app
            </div>
            <p className="text-xs text-gray-500 ml-7">
              Use Google Authenticator, Authy, Microsoft Authenticator, or any TOTP-compatible app.
            </p>

            {/* QR Code */}
            <div className="flex justify-center py-4">
              <div className="bg-white p-4 rounded-xl border-2 border-gray-100 shadow-sm">
                <img
                  src={enrollData.totp.qr_code}
                  alt="Scan this QR code"
                  className="w-48 h-48"
                />
              </div>
            </div>

            {/* Manual entry secret */}
            <div className="ml-7">
              <button
                onClick={() => setShowSecret(s => !s)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
              >
                {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                {showSecret ? 'Hide' : "Can't scan? Enter key manually"}
              </button>
              {showSecret && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 break-all select-all">
                    {enrollData.totp.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Copy to clipboard"
                  >
                    {secretCopied ? <CheckCircle size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Verify */}
          <div className="p-5 bg-gray-50 border-t border-gray-200 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <span className={`flex items-center justify-center w-5 h-5 bg-${accentColor}-600 text-white text-xs rounded-full`}>2</span>
              Enter the 6-digit code from your app
            </div>
            <div className="ml-7 max-w-xs">
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
                className={codeInput}
                placeholder="000000"
                autoFocus
              />
            </div>
            <div className="ml-7 flex items-center gap-3">
              <button
                onClick={verifyEnrollment}
                disabled={verifying || verifyCode.length !== 6}
                className={btnPrimary}
              >
                {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Verify & Enable
              </button>
              <button onClick={cancelEnroll} className={btnOutline}>
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2FA ENABLED — show status + disable option ── */}
      {factor && !confirmDisable && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <KeyRound size={16} className="text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700">Authenticator App</p>
              <p className="text-[11px] text-gray-400">
                Added {new Date(factor.created_at).toLocaleDateString('en-KE', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            </div>
          </div>
          <button onClick={startDisable} className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 transition-colors">
            <ShieldOff size={13} />
            Disable Two-Factor Authentication
          </button>
        </div>
      )}

      {/* ── DISABLE CONFIRMATION ── */}
      {factor && confirmDisable && (
        <div className="border border-red-200 rounded-xl p-5 bg-red-50/50 space-y-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Disable Two-Factor Authentication?</p>
              <p className="text-xs text-red-600 mt-1">
                This will remove the extra security layer from your account. Enter your current 2FA code to confirm.
              </p>
            </div>
          </div>
          <div className="max-w-xs">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                setDisableCode(val)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && disableCode.length === 6) executeDisable()
              }}
              className={codeInput.replace(accentColor, 'red')}
              placeholder="000000"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={executeDisable}
              disabled={disabling || disableCode.length !== 6}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {disabling ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
              Confirm Disable
            </button>
            <button
              onClick={() => { setConfirmDisable(false); setDisableCode(''); setError('') }}
              className={btnOutline}
            >
              Keep Enabled
            </button>
          </div>
        </div>
      )}
    </div>
  )
}