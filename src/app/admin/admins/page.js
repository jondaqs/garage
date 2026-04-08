// src/app/admin/admins/page.js
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, UserPlus } from 'lucide-react'

export default function AdminManagementPage() {
  const supabase = createClient()
  const [admins, setAdmins]     = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadAdmins() }, [])

  const loadAdmins = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          id, first_name, last_name, email, created_at,
          user_roles(role:user_roles_lookup(code, display_name))
        `)
        .filter('user_roles.role.code', 'in', '("admin","platform_admin")')
        .order('created_at', { ascending: false })

      if (error) throw error
      // Filter to only users who actually have admin roles
      const adminUsers = (data || []).filter(u =>
        u.user_roles?.some(ur => ['admin','platform_admin'].includes(ur.role?.code))
      )
      setAdmins(adminUsers)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Management</h1>
          <p className="text-gray-500 mt-1">{admins.length} platform administrators</p>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {admins.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-400">
                  <Shield className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  No admins found
                </td>
              </tr>
            ) : (
              admins.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-xs font-bold">
                        {(u.first_name?.[0] || '?').toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{u.email || '—'}</td>
                  <td className="px-6 py-4">
                    {u.user_roles?.filter(ur => ['admin','platform_admin'].includes(ur.role?.code))
                      .map(ur => (
                        <span key={ur.role?.code} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium mr-1">
                          {ur.role?.display_name}
                        </span>
                      ))}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}