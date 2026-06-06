'use client'

/**
 * Personal budget page.
 *
 * Symmetric to /company/budget but scoped to the current user. Budgets
 * live in the user_budgets table (server-managed, cross-device) and
 * spent_amount is maintained by the update_user_spending trigger +
 * process_payment — both currency-aware.
 *
 * Only vehicles the user individually owns
 * (vehicle_ownership.owner_user_id) contribute to spend; fleet vehicles
 * paid by a company member never bleed into a personal budget.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DollarSign, Plus, Edit2, Trash2, AlertCircle, CheckCircle,
  Car, ChevronDown, ChevronUp, Calendar, TrendingUp, Coins, RefreshCw,
} from 'lucide-react'

const fmtCurrency = (amount, currency) => {
  const symbol = currency?.symbol || currency?.code || 'KES'
  return `${symbol} ${Number(amount || 0).toLocaleString()}`
}

export default function UserBudgetPage() {
  const supabase = createClient()

  const [profileId,    setProfileId]    = useState(null)
  const [budget,       setBudget]       = useState(null)
  const [history,      setHistory]      = useState([])
  const [otherCurrency, setOtherCurrency] = useState([])
  const [currencies,   setCurrencies]   = useState([])
  const [breakdown,    setBreakdown]    = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [error,        setError]        = useState(null)
  const [success,      setSuccess]      = useState(null)
  const [deletingId,   setDeletingId]   = useState(null)
  const [syncing,      setSyncing]      = useState(false)

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]
  const [formData, setFormData] = useState({
    budget_amount: '',
    period_start:  monthStart,
    period_end:    monthEnd,
    currency_id:   '',
  })

  const [breakdownStart, setBreakdownStart] = useState(monthStart)
  const [breakdownEnd,   setBreakdownEnd]   = useState(monthEnd)

  // ── Bootstrap ──────────────────────────────────────────────────────────
  const fetchBudget = useCallback(async ({ recompute = false } = {}) => {
    try {
      const url = recompute ? '/api/user/budget?recompute=1' : '/api/user/budget'
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load budget')

      setBudget(data.budget || null)
      setHistory(data.history || [])

      if (data.budget) {
        setFormData(f => ({
          ...f,
          budget_amount: data.budget.budget_amount,
          period_start:  data.budget.period_start,
          period_end:    data.budget.period_end,
          currency_id:   data.budget.currency_id || data.budget.currency?.id || '',
        }))
      }
    } catch (err) {
      setError(err.message || 'Failed to load budget data')
    }
  }, [])

  // Manual sync: forces the server to recompute spent_amount from
  // receipts. Useful when the trigger missed something (e.g. a payment
  // recorded before the budget existed, or a backdated payment).
  const handleSync = async () => {
    setError(null); setSuccess(null); setSyncing(true)
    try {
      await fetchBudget({ recompute: true })
      setSuccess('Spend re-synced from receipts.')
      setTimeout(() => setSuccess(null), 2500)
    } catch (err) {
      setError(err.message || 'Failed to sync')
    } finally {
      setSyncing(false)
    }
  }

  const loadCurrencies = useCallback(async () => {
    const { data } = await supabase
      .from('currencies')
      .select('id, code, display_name, symbol, sort_order')
      .eq('is_active', true)
      .order('sort_order', { nullsFirst: false })
      .order('code')
    setCurrencies(data || [])
    setFormData(f => f.currency_id
      ? f
      : { ...f, currency_id: data?.find(c => c.code === 'KES')?.id || data?.[0]?.id || '' })
  }, [supabase])

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
    if (profile) setProfileId(profile.id)
  }, [supabase])

  useEffect(() => {
    Promise.all([fetchBudget(), loadCurrencies(), loadProfile()])
      .finally(() => setLoading(false))
  }, [fetchBudget, loadCurrencies, loadProfile])

  // ── Other-currency spend disclosure for current period ─────────────────
  const loadOtherCurrencySpend = useCallback(async () => {
    if (!budget || !profileId) { setOtherCurrency([]); return }

    const { data: ownership } = await supabase
      .from('vehicle_ownership')
      .select('vehicle_id')
      .eq('owner_user_id', profileId)
    const vehicleIds = (ownership || []).map(r => r.vehicle_id)
    if (vehicleIds.length === 0) { setOtherCurrency([]); return }

    const { data: receipts } = await supabase
      .from('receipts')
      .select(`
        amount_paid,
        invoice:invoices!inner(
          vehicle_id, status,
          work_order:work_orders_secure!inner(
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
  }, [budget, profileId, supabase])

  useEffect(() => { loadOtherCurrencySpend() }, [loadOtherCurrencySpend])

  // ── Per-vehicle breakdown (grouped by currency) ────────────────────────
  const fetchBreakdown = useCallback(async () => {
    if (!profileId) return
    setBreakdownLoading(true)
    try {
      const { data: ownership } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id, vehicle:vehicles_secure(id, plate_number, make, model)')
        .eq('owner_user_id', profileId)
      const vehicles = (ownership || []).map(r => r.vehicle).filter(Boolean)
      if (vehicles.length === 0) {
        setBreakdown({ rows: [], totals: [] })
        return
      }

      const { data: receipts } = await supabase
        .from('receipts')
        .select(`
          amount_paid,
          invoice:invoices!inner(
            id, vehicle_id, status,
            work_order:work_orders_secure!inner(
              currency:currencies(id, code, symbol)
            )
          )
        `)
        .gte('paid_at', breakdownStart + 'T00:00:00')
        .lte('paid_at', breakdownEnd   + 'T23:59:59')
        .eq('invoice.status', 'paid')
        .in('invoice.vehicle_id', vehicles.map(v => v.id))

      const vehById = new Map(vehicles.map(v => [v.id, v]))
      const rows    = new Map()
      for (const r of (receipts || [])) {
        const vid = r.invoice?.vehicle_id
        const cur = r.invoice?.work_order?.currency
        if (!vid || !cur?.id) continue
        const k = vid + '::' + cur.id
        const prev = rows.get(k) || {
          vehicle:    vehById.get(vid),
          currency:   cur,
          total:      0,
          invoiceIds: new Set(),
        }
        prev.total += Number(r.amount_paid || 0)
        if (r.invoice?.id) prev.invoiceIds.add(r.invoice.id)
        rows.set(k, prev)
      }

      const out = Array.from(rows.values()).map(r => ({
        vehicle:       r.vehicle,
        currency:      r.currency,
        total:         r.total,
        invoice_count: r.invoiceIds.size,
      })).sort((a, b) => b.total - a.total)

      const totMap = new Map()
      for (const r of out) {
        const prev = totMap.get(r.currency.id) || { currency: r.currency, total: 0, invoice_count: 0 }
        prev.total         += r.total
        prev.invoice_count += r.invoice_count
        totMap.set(r.currency.id, prev)
      }

      setBreakdown({ rows: out, totals: Array.from(totMap.values()) })
    } catch {
      setBreakdown({ rows: [], totals: [] })
    } finally {
      setBreakdownLoading(false)
    }
  }, [profileId, breakdownStart, breakdownEnd, supabase])

  useEffect(() => {
    if (showBreakdown) fetchBreakdown()
  }, [showBreakdown, fetchBreakdown])

  // ── Save / delete ──────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(null); setSuccess(null)
    const amt = parseFloat(formData.budget_amount)
    if (!amt || amt <= 0)            { setError('Please enter a valid budget amount.'); return }
    if (!formData.currency_id)       { setError('Please select a currency.'); return }
    if (!formData.period_start || !formData.period_end) {
      setError('Period start and end are required.'); return
    }
    if (formData.period_end <= formData.period_start) {
      setError('Period end must be after period start.'); return
    }
    setSaving(true)
    try {
      const method  = budget ? 'PATCH' : 'POST'
      const payload = budget
        ? { id: budget.id, ...formData, budget_amount: amt }
        : { ...formData, budget_amount: amt }
      const res = await fetch('/api/user/budget', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save budget')
      setSuccess('Budget saved.')
      setShowForm(false)
      await fetchBudget()
      setTimeout(() => setSuccess(null), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      const res = await fetch('/api/user/budget?id=' + encodeURIComponent(id), { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      setDeletingId(null)
      setSuccess('Budget period deleted.')
      setTimeout(() => setSuccess(null), 2500)
      await fetchBudget()
    } catch (err) {
      setError(err.message)
    }
  }

  // ── Derived display values ─────────────────────────────────────────────
  const spentPct = budget && budget.budget_amount > 0
    ? Math.min(Math.round((budget.spent_amount / budget.budget_amount) * 100), 100)
    : 0
  const remaining    = budget ? budget.budget_amount - budget.spent_amount : 0
  const isOverBudget = remaining < 0
  const barColor     = spentPct > 90 ? 'bg-red-500'
                     : spentPct > 70 ? 'bg-yellow-500'
                                     : 'bg-green-500'

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and control your personal service spend
          </p>
        </div>
        <button
          onClick={() => {
            if (!showForm && !budget) {
              setFormData(f => ({
                budget_amount: '',
                period_start:  monthStart,
                period_end:    monthEnd,
                currency_id:   f.currency_id || currencies.find(c => c.code === 'KES')?.id || currencies[0]?.id || '',
              }))
            }
            setShowForm(s => !s)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {budget ? <><Edit2 className="w-4 h-4" /> Edit Budget</> : <><Plus className="w-4 h-4" /> Set Budget</>}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            {budget ? 'Update Budget' : 'Set Budget'}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
              <input type="date" value={formData.period_start}
                onChange={e => setFormData({ ...formData, period_start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
              <input type="date" value={formData.period_end}
                onChange={e => setFormData({ ...formData, period_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select value={formData.currency_id}
                onChange={e => setFormData({ ...formData, currency_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                {currencies.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code}{c.symbol && c.symbol !== c.code ? ` (${c.symbol})` : ''} — {c.display_name}
                  </option>
                ))}
              </select>
              {budget && formData.currency_id !== budget.currency_id && (
                <p className="text-xs text-amber-600 mt-1.5">
                  Changing currency will reset spend tracking for this period.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget Amount</label>
              <input type="number" min="0" step="500" value={formData.budget_amount}
                onChange={e => setFormData({ ...formData, budget_amount: e.target.value })}
                placeholder="e.g. 20000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Budget'}
            </button>
            <button onClick={() => setShowForm(false)} disabled={saving}
              className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Current period card */}
      {budget ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Current Period</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">
                {new Date(budget.period_start).toLocaleDateString('en-KE', { month: 'long', day: 'numeric' })}
                {' – '}
                {new Date(budget.period_end).toLocaleDateString('en-KE', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Tracked in {budget.currency?.code || '—'}{budget.currency?.symbol && budget.currency?.symbol !== budget.currency?.code ? ` (${budget.currency.symbol})` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Recalculate spend from receipts"
                className="text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              </button>
              <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                isOverBudget      ? 'bg-red-100 text-red-700'
                : spentPct > 70   ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-green-100 text-green-700'
              }`}>
                {isOverBudget ? 'Over Budget' : spentPct > 70 ? 'High Usage' : 'On Track'}
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Spent</span>
              <span className="font-semibold text-gray-900">{spentPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all ${barColor}`} style={{ width: `${spentPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
            {[
              { label: 'Budget',    value: budget.budget_amount, color: 'text-gray-900' },
              { label: 'Spent',     value: budget.spent_amount,  color: 'text-red-600'  },
              { label: 'Remaining', value: Math.abs(remaining),
                color:  isOverBudget ? 'text-red-600' : 'text-green-600',
                prefix: isOverBudget ? '−' : '' },
            ].map(({ label, value, color, prefix = '' }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-base font-bold mt-0.5 ${color}`}>
                  {prefix}{fmtCurrency(value, budget.currency)}
                </p>
              </div>
            ))}
          </div>

          {/* Delete action for the current period. Lives here (not in
              the header) so it's clearly tied to the budget object and
              doesn't clash with the prominent Edit button at the top. */}
          <div className="pt-3 border-t border-gray-100 flex justify-end">
            {deletingId === budget.id ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Delete this budget?</span>
                <button onClick={() => handleDelete(budget.id)}
                  className="font-semibold text-red-600 hover:text-red-700 uppercase tracking-wide">
                  Confirm
                </button>
                <span className="text-gray-300">·</span>
                <button onClick={() => setDeletingId(null)}
                  className="font-semibold text-gray-400 hover:text-gray-600 uppercase tracking-wide">
                  Cancel
                </button>
              </span>
            ) : (
              <button onClick={() => setDeletingId(budget.id)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 size={12} /> Delete budget
              </button>
            )}
          </div>

          {otherCurrency.length > 0 && (
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Coins size={14} className="text-amber-600" />
                <p className="text-xs font-semibold text-gray-700">
                  Spend in other currencies this period
                </p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                These payments don&apos;t count against your {budget.currency?.code} budget. Shown
                for visibility — set a separate budget per period in another currency
                if you want to track them.
              </p>
              <div className="space-y-1.5">
                {otherCurrency.map(({ currency, total, count }) => (
                  <div key={currency.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      <span className="font-semibold text-gray-800">{currency.code}</span>
                      {' '}
                      <span className="text-xs text-gray-400">({count} payment{count !== 1 ? 's' : ''})</span>
                    </span>
                    <span className="font-medium text-gray-700">
                      {fmtCurrency(total, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-300 p-12 text-center">
          <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700 mb-1">No budget set for this period</p>
          <p className="text-xs text-gray-400">
            Click &ldquo;Set Budget&rdquo; to define a spend limit.
          </p>
        </div>
      )}

      {/* Spend-by-vehicle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowBreakdown(s => !s)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Car size={18} className="text-blue-600" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">Spend by Vehicle</p>
              <p className="text-xs text-gray-500 mt-0.5">Per-vehicle costs, grouped by currency</p>
            </div>
          </div>
          {showBreakdown ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {showBreakdown && (
          <div className="border-t border-gray-100 p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-xs text-gray-500">Period:</span>
              </div>
              <input type="date" value={breakdownStart}
                onChange={e => setBreakdownStart(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={breakdownEnd}
                onChange={e => setBreakdownEnd(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" />
              <button onClick={fetchBreakdown} disabled={breakdownLoading}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                {breakdownLoading ? 'Loading…' : 'Apply'}
              </button>
            </div>

            {breakdownLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : breakdown?.rows?.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {breakdown.totals.map(t => (
                    <div key={t.currency.id} className="bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-2">
                      <TrendingUp size={13} className="text-blue-700" />
                      <span className="text-xs font-medium text-blue-900">{fmtCurrency(t.total, t.currency)}</span>
                      <span className="text-[10px] text-blue-700">({t.invoice_count} inv.)</span>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left  py-2 text-xs font-semibold text-gray-500 uppercase">Vehicle</th>
                        <th className="text-left  py-2 text-xs font-semibold text-gray-500 uppercase">Currency</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Invoices</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Spend</th>
                        {budget && <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">% of Budget</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.rows.map((row, i) => {
                        const matchesBudget = budget && row.currency.id === budget.currency_id
                        const pct = (matchesBudget && budget.budget_amount > 0)
                          ? Math.round((row.total / budget.budget_amount) * 100)
                          : null
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3">
                              <p className="font-medium text-gray-900">{row.vehicle?.plate_number}</p>
                              <p className="text-xs text-gray-400">
                                {[row.vehicle?.make, row.vehicle?.model].filter(Boolean).join(' ')}
                              </p>
                            </td>
                            <td className="py-3">
                              <span className="text-xs font-semibold text-gray-700">{row.currency.code}</span>
                            </td>
                            <td className="py-3 text-right text-gray-600 text-xs">{row.invoice_count}</td>
                            <td className="py-3 text-right font-semibold text-gray-900">
                              {fmtCurrency(row.total, row.currency)}
                            </td>
                            {budget && (
                              <td className="py-3 text-right">
                                {pct == null ? (
                                  <span className="text-xs text-gray-300">—</span>
                                ) : (
                                  <span className={`text-xs font-medium ${
                                    pct > 30 ? 'text-red-600' : pct > 15 ? 'text-yellow-600' : 'text-green-600'
                                  }`}>{pct}%</span>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Car size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No spend recorded for this period.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Budget history */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Budget History</h2>
          <div className="space-y-3">
            {history.map((h, i) => {
              const pct    = h.budget_amount > 0
                ? Math.min(Math.round((h.spent_amount / h.budget_amount) * 100), 100)
                : 0
              const isOver = h.spent_amount > h.budget_amount
              const barClr = pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-yellow-400' : 'bg-green-400'
              const isCurrent = budget?.id === h.id
              return (
                <div key={h.id || i} className="group">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1 gap-2">
                    <span className="flex items-center gap-2">
                      {new Date(h.period_start).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}
                      {' · '}
                      <span className="font-semibold text-gray-600">{h.currency?.code || '—'}</span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-semibold text-blue-600 tracking-wide">
                          Current
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`font-medium ${isOver ? 'text-red-600' : 'text-gray-700'}`}>
                        {fmtCurrency(h.spent_amount, h.currency)} / {fmtCurrency(h.budget_amount, h.currency)}
                      </span>
                      {deletingId === h.id ? (
                        <span className="flex items-center gap-1.5">
                          <button onClick={() => handleDelete(h.id)}
                            className="text-[10px] uppercase font-semibold text-red-600 hover:text-red-700">
                            Confirm
                          </button>
                          <span className="text-gray-300">·</span>
                          <button onClick={() => setDeletingId(null)}
                            className="text-[10px] uppercase font-semibold text-gray-400 hover:text-gray-600">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setDeletingId(h.id)}
                          title="Delete this period"
                          className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${barClr}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}