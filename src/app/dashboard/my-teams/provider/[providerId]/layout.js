// src/app/dashboard/my-teams/provider/[providerId]/layout.js
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock, ArrowLeft } from 'lucide-react'

export default function ProviderMemberLayout({ children }) {
  const { providerId } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [status, setStatus] = useState('loading') // loading | ok | blocked

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus('ok'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
      if (!profile) { setStatus('ok'); return }

      const { data: spu } = await supabase
        .from('service_provider_users')
        .select('deactivation_requested_at')
        .eq('user_id', profile.id)
        .eq('service_provider_id', providerId)
        .eq('is_active', true)
        .maybeSingle()

      setStatus(spu?.deactivation_requested_at ? 'blocked' : 'ok')
    }
    check()
  }, [supabase, providerId])

  if (status === 'loading') return null

  if (status === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-yellow-200 shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
            <Clock size={28} className="text-yellow-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Leave Request Pending</h2>
          <p className="text-sm text-gray-600 mb-6">
            Your request to leave this team is being reviewed. Access to this provider
            is suspended until the provider owner or a team manager confirms your departure.
          </p>
          <button
            onClick={() => router.push('/dashboard/my-teams')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800"
          >
            <ArrowLeft size={16} /> Back to My Teams
          </button>
        </div>
      </div>
    )
  }

  return children
}