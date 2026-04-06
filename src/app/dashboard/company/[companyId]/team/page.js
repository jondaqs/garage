'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, AlertCircle, Shield, UserCheck } from 'lucide-react'

export default function MemberTeamPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [members,    setMembers]    = useState([])
  const [membership, setMembership] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  useEffect(() => { fetchData() }, [companyId])

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) return

      // Verify membership
      const { data: mem } = await supabase
        .from('company_users')
        .select('is_admin, staff_role')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!mem) { setError('You are not a member of this company.'); setLoading(false); return }
      setMembership(mem)

      // Fetch all active members
      const { data: membersData, error: membersErr } = await supabase
        .from('company_users')
        .select(`
          id, staff_role, is_admin, is_active, created_at,
          user:user_profiles!company_users_user_id_fkey(
            id, first_name, last_name, email, phone
          )
        `)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (membersErr) throw membersErr
      setMembers(membersData ?? [])
    } catch (err) {
      setError('Failed to load team.')
    } finally {
      setLoading(false)
    }
  }

  const roleLabel = (role) => {
    const map = {
      owner:         'Owner',
      fleet_manager: 'Fleet Manager',
      driver:        'Driver',
      mechanic:      'Mechanic',
      accountant:    'Accountant',
      other:         'Member',
    }
    return map[role] ?? role ?? 'Member'
  }

  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" /><p>{error}</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            {members.length} active member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Users className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No team members found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Role', 'Email', 'Status'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-sm font-semibold flex-shrink-0">
                        {(m.user?.first_name?.[0] || '?').toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {[m.user?.first_name, m.user?.last_name].filter(Boolean).join(' ') || '—'}
                        </p>
                        {m.user?.phone && (
                          <p className="text-xs text-gray-400">{m.user.phone}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-700 capitalize">{roleLabel(m.staff_role)}</span>
                      {m.is_admin && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                          <Shield size={10} /> Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {m.user?.email || '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                      <UserCheck size={11} /> Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}