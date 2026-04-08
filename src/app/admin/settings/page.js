// src/app/admin/settings/page.js
'use client'

import { Settings } from 'lucide-react'

export default function AdminSettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Platform configuration</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-12 shadow-sm text-center">
        <Settings className="w-12 h-12 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-400">Settings panel coming soon.</p>
      </div>
    </div>
  )
}