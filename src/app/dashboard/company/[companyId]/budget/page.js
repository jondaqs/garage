'use client'

/**
 * Read-only company budget view for non-owner members.
 *
 * Mirrors the owner page's display of current period + history but
 * removes all mutation (no form, no delete). Visible only to admins;
 * non-admins see a friendly lock screen.
 *
 * Currency model is identical to the owner page: spent_amount is
 * server-maintained and matching-currency only; the "other currencies"
 * disclosure surfaces parallel spend in different currencies.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DollarSign, AlertCircle, Lock, TrendingUp, Coins,
} from 'lucide-react'

const fmtCurrency = (amount, currency) => {
  const symbol = currency?.symbol || currency?.code || 'KES'
  return `${symbol} ${Number(amount || 0).toLocaleString()}`
}

export default function MemberBudgetPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [budget,        setBudget]        = useState(null)
  const [history,       setHistory]       = useState([])
  const [otherCurrency, setOtherCurrency] = useState([])
  const [isAdmin,       setIsAdmin]       = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      if (!profile) return

      const { data: mem } = await supabase
        .from('company_users')
        .select('is_admin')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!mem) {
        setError('You are not a member of this company.')
        setLoading(false); return
      }

      setIsAdmin(mem.is_admin)
      if (!mem.is_admin) { setLoading(false); return }

      const today = new Date().toISOString().split('T')[0]
      const select = '*, currency:currencies(id, code, symbol, display_name)'

      const [{ data: current }, { data: hist }] = await Promise.all([
        supabase
          .from('company_budgets')
          .select(select)
          .eq('company_id', companyId)
          .lte('period_start', today)
          .gte('period_end', today)
          .maybeSingle(),
        supabase
          .from('company_budgets')
          .select(select)
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
  }, [companyId, router, supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // Other-currency spend disclosure for the current period (admin-only).
  const loadOtherCurrencySpend = useCallback(async () => {
    if (!budget || !companyId || !isAdmin) { setOtherCurrency([]); return }

    const { data: ownership } = await supabase
      .from('vehicle_ownership')
      .select('vehicle_id')
      .eq('owner_company_id', companyId)
    const vehicleIds = (ownership || []).map(r => r.vehicle_id)
    if (vehicleIds.length === 0) { setOtherCurrency([]); return }

    const { data: receipts } = await supabase
      .from('receipts')
      .select(`
        amount_paid,
        invoice:invoices!inner(
          vehicle_id, status,
          work_order:work_orders!inner(
            currency:currencies(id, code, symbol)
          )
        )
      `)
      .gte('paid_at', budget.period_start + 'T00:00:00')
      .lte('paid_at', budget.period_end   + 'T23:59:59')
      .eq('invoice.status', 'paid')
      .in('invoice.vehicle_id', vehicleIds)

    const buckets = new Map()
    for (const r of (receipts || [])) {
      const cur = r.invoice?.work_order?.currency
      if (!cur?.id || cur.id === budget.currency_id) continue
      const prev = buckets.get(cur.id) || { currency: cur, total: 0, count: 0 }
      prev.total += Number(r.amount_paid || 0)
      prev.count += 1
      buckets.set(cur.id, prev)
    }
    setOtherCurrency(Array.from(buckets.values()).sort((a, b) => b.total - a.total))
  }, [budget, companyId, isAdmin, supabase])

  useEffect(() => { loadOtherCurrencySpend() }, [loadOtherCurrencySpend])

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

  if (!isAdmin) return (
    <div className="max-w-md mx-auto mt-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Lock className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Budget is admin-only</h2>
      <p className="text-gray-500 text-sm">Only company admins can view budget information.</p>
    </div>
  )

  const spent = budget?.spent_amount ?? 0
  const limit = budget?.budget_amount ?? 0
  const pct   = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0
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
              <>
                <p className="text-xs text-gray-400">
                  {new Date(budget.period_start).toLocaleDateString()} – {new Date(budget.period_end).toLocaleDateString()}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Tracked in {budget.currency?.code || '—'}
                </p>
              </>
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
                  {fmtCurrency(spent, budget.currency)}
                </p>
                <p className="text-sm text-gray-500">
                  spent of {fmtCurrency(limit, budget.currency)} budget
                </p>
              </div>
              <p className={`text-lg font-semibold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-amber-600' : 'text-green-600'}`}>
                {pct}%
              </p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {fmtCurrency(Math.max(0, limit - spent), budget.currency)} remaining
            </p>

            {otherCurrency.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Coins size={14} className="text-amber-600" />
                  <p className="text-xs font-semibold text-gray-700">
                    Also spent in other currencies this period
                  </p>
                </div>
                <div className="space-y-1.5">
                  {otherCurrency.map(({ currency, total, count }) => (
                    <div key={currency.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        <span className="font-semibold text-gray-800">{currency.code}</span>
                        {' '}<span className="text-xs text-gray-400">({count})</span>
                      </span>
                      <span className="font-medium text-gray-700">
                        {fmtCurrency(total, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                {['Period', 'Currency', 'Budget', 'Spent', 'Usage'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map(row => {
                const p = row.budget_amount > 0
                  ? Math.min(100, Math.round((row.spent_amount / row.budget_amount) * 100))
                  : 0
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-700">
                      {new Date(row.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-700">
                      {row.currency?.code || '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-700">{fmtCurrency(row.budget_amount, row.currency)}</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{fmtCurrency(row.spent_amount, row.currency)}</td>
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