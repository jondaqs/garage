'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShieldOff, Building2, Store, LogOut, Mail } from 'lucide-react'
import { Suspense } from 'react'

const REASONS = {
  suspended: {
    icon: ShieldOff,
    color: 'text-red-600 bg-red-100',
    title: 'Account Suspended',
    description:
      'Your account has been suspended by an administrator. ' +
      'While suspended, you cannot access the platform. ' +
      'If you believe this is a mistake, please contact support.',
  },
  deactivated: {
    icon: ShieldOff,
    color: 'text-gray-600 bg-gray-100',
    title: 'Account Deactivated',
    description:
      'Your account has been deactivated. ' +
      'You no longer have access to the platform. ' +
      'Please reach out to support if you need your account reactivated.',
  },
  company_suspended: {
    icon: Building2,
    color: 'text-orange-600 bg-orange-100',
    title: 'Company Suspended',
    description:
      'The company you are associated with has been suspended by an administrator. ' +
      'While the company is suspended, all team members are unable to access company features. ' +
      'Please contact your company owner or reach out to support for more information.',
  },
  provider_suspended: {
    icon: Store,
    color: 'text-yellow-700 bg-yellow-100',
    title: 'Service Provider Suspended',
    description:
      'Your service provider account has been suspended. ' +
      'Your shops and services are currently offline. ' +
      'Contact support to resolve this and restore your listing.',
  },
}

function SuspendedContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const reason = searchParams.get('reason') || 'suspended'
  const info = REASONS[reason] || REASONS.suspended

  const Icon = info.icon

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className={`w-16 h-16 rounded-full ${info.color} flex items-center justify-center mx-auto mb-6`}>
          <Icon size={32} />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">{info.title}</h1>

        <p className="text-gray-600 text-sm leading-relaxed mb-8">
          {info.description}
        </p>

        <div className="space-y-3">
          <a
            href="mailto:support@garicare.com"
            className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Mail size={16} /> Contact Support
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-5 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-8">
          If your account has been reinstated and you are still seeing this page,
          try signing out and back in.
        </p>
      </div>
    </div>
  )
}

export default function SuspendedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    }>
      <SuspendedContent />
    </Suspense>
  )
}