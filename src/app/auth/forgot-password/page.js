'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Car, Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import Script from 'next/script'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [sent, setSent]         = useState(false)

  // Turnstile CAPTCHA
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef(null)
  const turnstileWidgetId = useRef(null)

  const resetTurnstile = useCallback(() => {
    setTurnstileToken('')
    if (window.turnstile && turnstileWidgetId.current != null) {
      window.turnstile.reset(turnstileWidgetId.current)
    }
  }, [])

  useEffect(() => {
    const onSuccess = (e) => setTurnstileToken(e.detail)
    const onExpired = () => setTurnstileToken('')
    window.addEventListener('turnstile-success', onSuccess)
    window.addEventListener('turnstile-expired', onExpired)
    return () => {
      window.removeEventListener('turnstile-success', onSuccess)
      window.removeEventListener('turnstile-expired', onExpired)
    }
  }, [])

  // Manually render Turnstile on mount — auto-render only fires once
  // when the script first loads; client-side navigation skips it.
  useEffect(() => {
    const el = turnstileRef.current
    if (!el) return
    let pollTimer = null

    const renderWidget = () => {
      if (!window.turnstile || !el) return
      if (el.querySelector('iframe')) return
      turnstileWidgetId.current = window.turnstile.render(el, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token) => {
          window.__turnstileToken = token
          window.dispatchEvent(new CustomEvent('turnstile-success', { detail: token }))
        },
        'expired-callback': () => {
          window.__turnstileToken = ''
          window.dispatchEvent(new CustomEvent('turnstile-expired'))
        },
        theme: 'light',
      })
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      pollTimer = setInterval(() => {
        if (window.turnstile) { clearInterval(pollTimer); pollTimer = null; renderWidget() }
      }, 150)
    }

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      if (window.turnstile && turnstileWidgetId.current != null) {
        try { window.turnstile.remove(turnstileWidgetId.current) } catch {}
        turnstileWidgetId.current = null
      }
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return

    if (!turnstileToken) {
      setError('Please complete the security check.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const origin = window.location.origin
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
        captchaToken: turnstileToken,
      })

      if (resetErr) throw resetErr

      setSent(true)
      resetTurnstile()
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      resetTurnstile()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <Link
          href="/auth/login"
          className="mb-4 text-blue-600 hover:text-blue-700 font-medium flex items-center"
        >
          <ArrowLeft size={16} className="mr-1" />
          Back to Sign In
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Car className="text-blue-600 mr-2" size={40} />
              <h1 className="text-3xl font-bold text-gray-800">GariCare</h1>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Forgot Password</h2>
            <p className="text-gray-600 mt-2">
              {sent
                ? 'Check your inbox for the reset link'
                : "Enter your email and we'll send you a reset link"}
            </p>
          </div>

          {sent ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-3 p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle size={36} className="text-emerald-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-800">
                    Check your inbox
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">
                    If an account exists with that email, we've sent a password reset link. 
                    Check the inbox (and spam folder) for the email associated with this account.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-center">
                <p className="text-xs text-gray-500">
                  Didn't receive the email? Check your spam folder, or try again.
                </p>
                <button
                  onClick={() => { setSent(false); setError('') }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Send again
                </button>
              </div>

              <div className="pt-4 border-t border-gray-100 text-center">
                <Link
                  href="/auth/login"
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    required
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              {/* Cloudflare Turnstile CAPTCHA */}
              <div className="flex justify-center">
                <div
                  ref={turnstileRef}
                  className="cf-turnstile"
                  data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                  data-callback="onTurnstileSuccess"
                  data-expired-callback="onTurnstileExpired"
                  data-theme="light"
                />
              </div>

              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                strategy="afterInteractive"
              />
              <Script id="turnstile-callbacks-forgot" strategy="afterInteractive">
                {`
                  window.onTurnstileSuccess = function(token) {
                    window.__turnstileToken = token;
                    window.dispatchEvent(new CustomEvent('turnstile-success', { detail: token }));
                  };
                  window.onTurnstileExpired = function() {
                    window.__turnstileToken = '';
                    window.dispatchEvent(new CustomEvent('turnstile-expired'));
                  };
                `}
              </Script>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Sending…</>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <div className="text-center">
                <Link href="/auth/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Remember your password? Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}