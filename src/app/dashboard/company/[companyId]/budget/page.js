'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, AlertCircle, Lock, TrendingUp } from 'lucide-react'

export default function MemberBudgetPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [budget,     setBudget]     = useState(null)
  const [history,    setHistory]    = useState([])
  const [isAdmin,    setIsAdmin]    = useState(false)
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

      // Verify membership and check admin status
      const { data: mem } = await supabase
        .from('company_users')
        .select('is_admin')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!mem) { setError('You are not a member of this company.'); setLoading(false); return }

      setIsAdmin(mem.is_admin)

      if (!mem.is_admin) {
        // Non-admins cannot see budget
        setLoading(false)
        return
      }

      // Fetch current budget period
      const today = new Date().toISOString().split('T')[0]

      const [{ data: current }, { data: hist }] = await Promise.all([
        supabase
          .from('company_budgets')
          .select('*')
          .eq('company_id', companyId)
          .lte('period_start', today)
          .gte('period_end', today)
          .maybeSingle(),
        supabase
          .from('company_budgets')
          .select('*')
          .eq('company_id', companyId)
          .order('period_start', { ascending: false })
          .limit(6),
      ])

      setBudget(current ?? null)
      setHistory(hist ?? [])
    } catch (err) {
      setError('Failed to load budget.')
    } finally {
      setLoading(false)
    }
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

  // Non-admin blocked view
  if (!isAdmin) return (
    <div className="max-w-md mx-auto mt-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Lock className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Budget is admin-only</h2>
      <p className="text-gray-500 text-sm">Only company admins can view budget information.</p>
    </div>
  )

  const currency = budget?.currency || 'KES'
  const spent    = budget?.spent_amount ?? 0
  const limit    = budget?.budget_limit ?? 0
  const pct      = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budget</h1>
        <p className="text-sm text-gray-500 mt-1">Current period spend tracking</p>
      </div>

      {/* Current period card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Current Period</p>
            {budget && (
              <p className="text-xs text-gray-400">
                {new Date(budget.period_start).toLocaleDateString()} – {new Date(budget.period_end).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {!budget ? (
          <p className="text-gray-500 text-sm">No active budget period found.</p>
        ) : (
          <>
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-3xl font-bold text-gray-900">
                  {currency} {spent.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">spent of {currency} {limit.toLocaleString()} budget</p>
              </div>
              <p className={`text-lg font-semibold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-green-600'}`}>
                {pct}%
              </p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {currency} {Math.max(0, limit - spent).toLocaleString()} remaining
            </p>
          </>
        )}
      </div>

      {/* Budget history */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Budget History</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Period', 'Budget', 'Spent', 'Usage'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map(row => {
                const p = row.budget_limit > 0
                  ? Math.min(100, Math.round((row.spent_amount / row.budget_limit) * 100))
                  : 0
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-700">
                      {new Date(row.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700">{row.currency} {row.budget_limit?.toLocaleString()}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{row.currency} {row.spent_amount?.toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                        ${p >= 90 ? 'bg-red-100 text-red-700' : p >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {p}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}