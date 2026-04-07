'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Users, CheckCircle, XCircle, Clock, AlertCircle, LogIn } from 'lucide-react'

// Inner component that reads search params
function AcceptInvitationContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const supabase     = createClient()
  const token        = searchParams.get('token')

  const [invitation, setInvitation] = useState(null)
  const [user,       setUser]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [responding, setResponding] = useState(false)
  const [done,       setDone]       = useState(null)  // { success, message, action }
  const [error,      setError]      = useState(null)

  useEffect(() => { init() }, [token])

  const init = async () => {
    try {
      if (!token) { setError('No invitation token found in this link.'); setLoading(false); return }

      // Check auth — page is accessible without login but actions require it
      const { data: { user: authUser } } = await supabase.auth.getUser()
      setUser(authUser)

      // Load invitation details (readable by invitee via RLS policy)
      const { data: inv, error: invErr } = await supabase
        .from('company_invitations')
        .select('id, email, first_name, last_name, staff_role, is_admin, status, expires_at, company:company_profiles(id, name, bio, city, country)')
        .eq('invitation_token', token)
        .maybeSingle()

      if (invErr || !inv) {
        setError('This invitation link is invalid or has expired. Please ask your company admin for a new invite.')
        setLoading(false)
        return
      }

      setInvitation(inv)
    } catch (err) {
      setError('Something went wrong loading this invitation.')
    } finally {
      setLoading(false)
    }
  }

  const handleResponse = async (action) => {
    if (!user) {
      // Save token and redirect to login, then come back
      const returnUrl = encodeURIComponent(`/invite/company?token=${token}`)
      router.push(`/auth/login?next=${returnUrl}`)
      return
    }

    setResponding(true)
    try {
      const res = await fetch('/api/company/team/respond-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, response: action }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to respond to invitation')
      }

      setDone({
        action,
        success: true,
        message: data.message,
        companyId:   data.companyId,
        companyName: data.companyName,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setResponding(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation Not Found</h2>
        <p className="text-gray-500 text-sm mb-6">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
        >
          Go to Home
        </button>
      </div>
    </div>
  )

  // ── Already actioned ──────────────────────────────────────────────────────
  if (invitation.status !== 'pending') {
    const isExpired = new Date(invitation.expires_at) < new Date()
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-gray-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isExpired ? 'Invitation Expired' : `Invitation Already ${invitation.status}`}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {isExpired
              ? 'This invitation link has expired. Please contact your company admin for a new one.'
              : `This invitation was already ${invitation.status}. No further action needed.`}
          </p>
          <button
            onClick={() => router.push(user ? '/dashboard' : '/')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
          >
            {user ? 'Go to Dashboard' : 'Go to Home'}
          </button>
        </div>
      </div>
    )
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    const accepted = done.action === 'accept'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${accepted ? 'bg-green-100' : 'bg-gray-100'}`}>
            {accepted
              ? <CheckCircle className="w-7 h-7 text-green-600" />
              : <XCircle    className="w-7 h-7 text-gray-500" />}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {accepted ? `Welcome to ${done.companyName}!` : 'Invitation Declined'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">{done.message}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── Expired but status still pending (race condition) ──────────────────────
  const isExpired = new Date(invitation.expires_at) < new Date()

  // ── Main invitation view ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">You&apos;re Invited</h1>
          <p className="text-gray-500 text-sm mt-1">
            {invitation.first_name ? `Hi ${invitation.first_name}! ` : ''}
            You have been invited to join a company on GariCare.
          </p>
        </div>

        {/* Invitation card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 leading-tight">
                {invitation.company?.name || 'Unknown Company'}
              </h2>
              {invitation.company?.city && (
                <p className="text-sm text-gray-400 mt-0.5">{[invitation.company.city, invitation.company.country].filter(Boolean).join(', ')}</p>
              )}
              {invitation.company?.bio && (
                <p className="text-sm text-gray-600 mt-2 line-clamp-2">{invitation.company.bio}</p>
              )}
            </div>
          </div>

          <div className="space-y-3 py-4 border-t border-b border-gray-100 mb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Users className="w-4 h-4" /> Your Role
              </div>
              <span className="text-sm font-medium text-gray-900 capitalize">
                {invitation.staff_role || 'Member'}
                {invitation.is_admin && <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Admin</span>}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" /> Expires
              </div>
              <span className={`text-sm font-medium ${isExpired ? 'text-red-600' : 'text-gray-900'}`}>
                {new Date(invitation.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                {isExpired && ' (expired)'}
              </span>
            </div>
          </div>

          {/* Not logged in — prompt login first */}
          {!user && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-3">
                <LogIn className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-700">
                  You need to be signed in to accept or decline this invitation.
                  Clicking Accept or Decline will take you to the login page and bring you back here.
                </p>
              </div>
            </div>
          )}

          {isExpired ? (
            <div className="text-center py-2 text-sm text-red-600 font-medium">
              This invitation has expired. Ask your company admin for a new one.
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => handleResponse('accept')}
                disabled={responding}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {responding ? 'Processing…' : 'Accept Invitation'}
              </button>
              <button
                onClick={() => handleResponse('reject')}
                disabled={responding}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                {responding ? 'Processing…' : 'Decline'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          GariCare · Fleet & Vehicle Management Platform
        </p>
      </div>
    </div>
  )
}

// Wrap in Suspense required by Next.js for useSearchParams in client components
export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  )
}