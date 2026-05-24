'use client'

/**
 * Personal budget page.
 *
 * Mirrors /company/budget but scoped to the current user. Two important
 * differences from the company version:
 *
 *   1. Storage — budget periods live in localStorage (per device, keyed
 *      by the user's profile id). No new DB tables or RLS work. If we
 *      later promote this to a `user_budgets` table, swap the
 *      load/save helpers below for fetch() calls; the rest of the
 *      page can stay.
 *
 *   2. Spend — derived on read from the user's own paid receipts joined
 *      to invoices joined to vehicle_ownership.owner_user_id. The
 *      company version trusts a server-maintained spent_amount column
 *      kept in sync by process_payment + update_company_spending. For
 *      personal vehicles there's no equivalent trigger, so computing
 *      live both keeps the page accurate and avoids drift entirely.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DollarSign, Plus, Edit2, Trash2, AlertCircle, CheckCircle,
  Car, ChevronDown, ChevronUp, Calendar, TrendingUp,
} from 'lucide-react'

// ── localStorage helpers ─────────────────────────────────────────────────
// Schema:
//   garicare:user_budget:<profileId> = JSON.stringify([{ id, budget_amount,
//     spent_amount (transient — recomputed on load), period_start, period_end,
//     currency, created_at, updated_at }])
// The "current" budget is whichever row covers today's date. We keep up
// to 12 historical periods to match the company page's history table.
const LS_KEY = (profileId) => `garicare:user_budget:${profileId}`
const LS_LIMIT = 24

const loadBudgets = (profileId) => {
  if (!profileId || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LS_KEY(profileId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveBudgets = (profileId, rows) => {
  if (!profileId || typeof window === 'undefined') return
  try {
    // Bound storage. Oldest periods drop first.
    const trimmed = [...rows]
      .sort((a, b) => (b.period_start || '').localeCompare(a.period_start || ''))
      .slice(0, LS_LIMIT)
    window.localStorage.setItem(LS_KEY(profileId), JSON.stringify(trimmed))
  } catch {}
}

const todayIso = () => new Date().toISOString().split('T')[0]
const uuid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36)

export default function UserBudgetPage() {
  const supabase = createClient()

  const [profileId,  setProfileId]  = useState(null)
  const [budget,     setBudget]     = useState(null)      // current-period row
  const [history,    setHistory]    = useState([])        // most-recent first
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)
  const [success,    setSuccess]    = useState(null)

  // Form
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]
  const [showForm, setShowForm]   = useState(false)
  const [formData, setFormData]   = useState({
    budget_amount: '',
    period_start:  monthStart,
    period_end:    monthEnd,
    currency:      'KES',
  })

  // Vehicle spend breakdown
  const [showBreakdown,    setShowBreakdown]    = useState(false)
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [breakdown,        setBreakdown]        = useState(null)
  const [breakdownStart,   setBreakdownStart]   = useState(monthStart)
  const [breakdownEnd,     setBreakdownEnd]     = useState(monthEnd)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState(null)

  // ── Bootstrap: resolve profile, load budgets, compute spend ───────────
  const bootstrap = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
      if (!profile) { setError('Profile not found.'); return }
      setProfileId(profile.id)

      // Load saved budgets and compute live spend for each. Computing
      // spend for every period in one shot avoids N round-trips and lets
      // the history table show the same number it did when the period
      // was current.
      const stored = loadBudgets(profile.id)
      if (stored.length === 0) {
        setBudget(null)
        setHistory([])
        return
      }

      const today = todayIso()
      const withSpend = await Promise.all(stored.map(async (row) => {
        const spent = await computeSpend(profile.id, row.period_start, row.period_end)
        return { ...row, spent_amount: spent }
      }))

      // Sort newest first; pick the row whose period covers today.
      withSpend.sort((a, b) => (b.period_start || '').localeCompare(a.period_start || ''))
      const current = withSpend.find(r => r.period_start <= today && r.period_end >= today) || null
      setBudget(current)
      setHistory(withSpend)

      if (current) {
        setFormData({
          budget_amount: String(current.budget_amount ?? ''),
          period_start:  current.period_start,
          period_end:    current.period_end,
          currency:      current.currency || 'KES',
        })
      }
    } catch (err) {
      console.error(err)
      setError('Failed to load budget data.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { bootstrap() }, [bootstrap])

  // ── Spend computation ────────────────────────────────────────────────
  // Sums amount_paid from receipts whose invoice is paid and whose
  // vehicle is currently owned by this user, restricted to the period.
  // RLS on receipts already lets the owner read these rows.
  const computeSpend = async (pid, periodStart, periodEnd) => {
    try {
      // 1. Vehicles the user currently owns. We only consider active
      //    ownership rows — vehicles handed off mid-period legitimately
      //    drop off the budget here, mirroring how the company side
      //    behaves when a vehicle leaves the fleet.
      const { data: ownership } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_user_id', pid)
      const vehicleIds = (ownership || []).map(r => r.vehicle_id)
      if (vehicleIds.length === 0) return 0

      // 2. Receipts in window for those vehicles. We use an inner join
      //    so PostgREST filters down by invoice.vehicle_id efficiently.
      const startTs = periodStart + 'T00:00:00'
      const endTs   = periodEnd   + 'T23:59:59'
      const { data: receipts } = await supabase
        .from('receipts')
        .select('amount_paid, paid_at, invoice:invoices!inner(vehicle_id, status)')
        .gte('paid_at', startTs)
        .lte('paid_at', endTs)
        .eq('invoice.status', 'paid')
        .in('invoice.vehicle_id', vehicleIds)

      return (receipts || []).reduce((sum, r) => sum + Number(r.amount_paid || 0), 0)
    } catch {
      return 0
    }
  }

  // ── Per-vehicle breakdown ─────────────────────────────────────────────
  // Same shape as company's get_fleet_spend_summary.by_vehicle: a row
  // per vehicle with plate / make / model / invoice count / total_spent.
  const fetchBreakdown = useCallback(async () => {
    if (!profileId) return
    setBreakdownLoading(true)
    try {
      // Vehicles the user owns (with display fields).
      const { data: ownership } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id, vehicle:vehicles(id, plate_number, make, model)')
        .eq('owner_user_id', profileId)
      const vehicles = (ownership || []).map(r => r.vehicle).filter(Boolean)
      if (vehicles.length === 0) {
        setBreakdown({ total_spend: 0, by_vehicle: [] })
        return
      }

      const startTs = breakdownStart + 'T00:00:00'
      const endTs   = breakdownEnd   + 'T23:59:59'
      const { data: receipts } = await supabase
        .from('receipts')
        .select('amount_paid, invoice:invoices!inner(id, vehicle_id, status)')
        .gte('paid_at', startTs)
        .lte('paid_at', endTs)
        .eq('invoice.status', 'paid')
        .in('invoice.vehicle_id', vehicles.map(v => v.id))

      // Aggregate per vehicle. invoice_count counts distinct invoices.
      const perVeh = new Map()
      for (const v of vehicles) {
        perVeh.set(v.id, {
          vehicle_id:    v.id,
          plate_number:  v.plate_number,
          make:          v.make,
          model:         v.model,
          total_spent:   0,
          _invoiceIds:   new Set(),
        })
      }
      for (const r of (receipts || [])) {
        const vid = r.invoice?.vehicle_id
        const row = perVeh.get(vid)
        if (!row) continue
        row.total_spent += Number(r.amount_paid || 0)
        if (r.invoice?.id) row._invoiceIds.add(r.invoice.id)
      }

      const by_vehicle = Array.from(perVeh.values())
        .map(({ _invoiceIds, ...rest }) => ({ ...rest, invoice_count: _invoiceIds.size }))
        .filter(r => r.invoice_count > 0 || r.total_spent > 0)
        .sort((a, b) => b.total_spent - a.total_spent)
      const total_spend = by_vehicle.reduce((s, r) => s + r.total_spent, 0)

      setBreakdown({ total_spend, by_vehicle })
    } catch (err) {
      console.error(err)
      setBreakdown({ total_spend: 0, by_vehicle: [] })
    } finally {
      setBreakdownLoading(false)
    }
  }, [profileId, breakdownStart, breakdownEnd, supabase])

  useEffect(() => {
    if (showBreakdown) fetchBreakdown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBreakdown])

  // ── Save / delete ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(null)
    const amt = parseFloat(formData.budget_amount)
    if (!amt || amt <= 0) { setError('Please enter a valid budget amount.'); return }
    if (!formData.period_start || !formData.period_end) {
      setError('Period start and end are required.'); return
    }
    if (formData.period_end <= formData.period_start) {
      setError('Period end must be after period start.'); return
    }

    setSaving(true)
    try {
      const stored = loadBudgets(profileId)
      const now = new Date().toISOString()

      let next
      if (budget?.id) {
        // Update in place. Reject overlap with another existing row.
        const overlap = stored.find(r =>
          r.id !== budget.id &&
          !(formData.period_end < r.period_start || formData.period_start > r.period_end)
        )
        if (overlap) {
          setError('This period overlaps with another saved budget period.')
          setSaving(false); return
        }
        next = stored.map(r => r.id === budget.id ? {
          ...r,
          budget_amount: amt,
          period_start:  formData.period_start,
          period_end:    formData.period_end,
          currency:      formData.currency,
          updated_at:    now,
        } : r)
      } else {
        const overlap = stored.find(r =>
          !(formData.period_end < r.period_start || formData.period_start > r.period_end)
        )
        if (overlap) {
          setError('This period overlaps with an existing saved budget period.')
          setSaving(false); return
        }
        next = [{
          id:            uuid(),
          budget_amount: amt,
          period_start:  formData.period_start,
          period_end:    formData.period_end,
          currency:      formData.currency,
          created_at:    now,
          updated_at:    now,
        }, ...stored]
      }

      saveBudgets(profileId, next)
      setShowForm(false)
      setSuccess('Budget saved.')
      setTimeout(() => setSuccess(null), 2500)
      await bootstrap()
    } catch (err) {
      setError('Failed to save budget.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (id) => {
    const stored = loadBudgets(profileId).filter(r => r.id !== id)
    saveBudgets(profileId, stored)
    setDeletingId(null)
    setSuccess('Budget period deleted.')
    setTimeout(() => setSuccess(null), 2500)
    bootstrap()
  }

  // ── Derived display values ────────────────────────────────────────────
  const spentPct = budget && budget.budget_amount > 0
    ? Math.min(Math.round((budget.spent_amount / budget.budget_amount) * 100), 100)
    : 0
  const remaining    = budget ? budget.budget_amount - budget.spent_amount : 0
  const isOverBudget = remaining < 0
  const barColor     = spentPct > 90 ? 'bg-red-500'
                     : spentPct > 70 ? 'bg-yellow-500'
                                     : 'bg-green-500'
  const currency = budget?.currency || 'KES'
  const fmt = (n) => `${currency} ${Number(n || 0).toLocaleString()}`

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
          <p className="text-sm text-gray-500 mt-1">Track and control your personal service spend</p>
        </div>
        <button
          onClick={() => {
            // Toggle. When opening fresh (no current budget) reset the
            // form to a default current-month window so the inputs aren't
            // stuck on an old period from history.
            if (!showForm && !budget) {
              setFormData({
                budget_amount: '',
                period_start:  monthStart,
                period_end:    monthEnd,
                currency:      'KES',
              })
            }
            setShowForm(s => !s)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {budget ? <><Edit2 className="w-4 h-4" /> Edit Budget</> : <><Plus className="w-4 h-4" /> Set Budget</>}
        </button>
      </div>

      {/* Per-device disclosure. Necessary because budgets only live in
          localStorage; users with multiple devices should know up front. */}
      <p className="text-xs text-gray-400 -mt-3">
        Budget data is stored on this device only.
      </p>

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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Budget Amount (KES)</label>
            <input type="number" min="0" step="500" value={formData.budget_amount}
              onChange={e => setFormData({ ...formData, budget_amount: e.target.value })}
              placeholder="e.g. 20000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
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
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
              isOverBudget ? 'bg-red-100 text-red-700'
              : spentPct > 70 ? 'bg-yellow-100 text-yellow-700'
              : 'bg-green-100 text-green-700'
            }`}>
              {isOverBudget ? 'Over Budget' : spentPct > 70 ? 'High Usage' : 'On Track'}
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
                color: isOverBudget ? 'text-red-600' : 'text-green-600',
                prefix: isOverBudget ? '−' : '' },
            ].map(({ label, value, color, prefix = '' }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-base font-bold mt-0.5 ${color}`}>
                  {prefix}{currency} {Number(value).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
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

      {/* ── Vehicle spend breakdown ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowBreakdown(s => !s)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Car size={18} className="text-blue-600" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">Spend by Vehicle</p>
              <p className="text-xs text-gray-500 mt-0.5">Per-vehicle service costs in a period</p>
            </div>
          </div>
          {showBreakdown ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {showBreakdown && (
          <div className="border-t border-gray-100 p-5 space-y-4">
            {/* Period selector */}
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
            ) : breakdown?.by_vehicle?.length > 0 ? (
              <>
                {/* Total */}
                <div className="bg-blue-50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900 flex items-center gap-2">
                    <TrendingUp size={15} /> Total spend this period
                  </span>
                  <span className="text-base font-bold text-blue-900">
                    {fmt(breakdown.total_spend)}
                  </span>
                </div>

                {/* Per-vehicle table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Vehicle</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Invoices</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Spend</th>
                        {budget && <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">% of Budget</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.by_vehicle.map((v, i) => {
                        const pct = budget?.budget_amount > 0
                          ? Math.round((v.total_spent / budget.budget_amount) * 100)
                          : null
                        return (
                          <tr key={v.vehicle_id || i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3">
                              <p className="font-medium text-gray-900">{v.plate_number}</p>
                              <p className="text-xs text-gray-400">
                                {[v.make, v.model].filter(Boolean).join(' ')}
                              </p>
                            </td>
                            <td className="py-3 text-right text-gray-600 text-xs">{v.invoice_count}</td>
                            <td className="py-3 text-right font-semibold text-gray-900">
                              {fmt(v.total_spent)}
                            </td>
                            {budget && (
                              <td className="py-3 text-right">
                                <span className={`text-xs font-medium ${
                                  pct > 30 ? 'text-red-600' : pct > 15 ? 'text-yellow-600' : 'text-green-600'
                                }`}>
                                  {pct}%
                                </span>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    {breakdown.by_vehicle.length > 1 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200">
                          <td className="py-2.5 font-bold text-gray-900">Total</td>
                          <td className="py-2.5 text-right text-gray-600 text-xs">
                            {breakdown.by_vehicle.reduce((s, v) => s + Number(v.invoice_count || 0), 0)}
                          </td>
                          <td className="py-2.5 text-right font-bold text-gray-900">
                            {fmt(breakdown.total_spend)}
                          </td>
                          {budget && <td />}
                        </tr>
                      </tfoot>
                    )}
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
      {history.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Budget History</h2>
          <div className="space-y-3">
            {history.map((h, i) => {
              const pct    = h.budget_amount > 0
                ? Math.min(Math.round((h.spent_amount / h.budget_amount) * 100), 100)
                : 0
              const isOver = h.spent_amount > h.budget_amount
              const barClr = pct > 90 ? 'bg-red-400'
                           : pct > 70 ? 'bg-yellow-400'
                                      : 'bg-green-400'
              const isCurrent = budget?.id === h.id

              return (
                <div key={h.id || i} className="group">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1 gap-2">
                    <span className="flex items-center gap-2">
                      {new Date(h.period_start).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-semibold text-blue-600 tracking-wide">
                          Current
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`font-medium ${isOver ? 'text-red-600' : 'text-gray-700'}`}>
                        {fmt(h.spent_amount)} / {fmt(h.budget_amount)}
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
                          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
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