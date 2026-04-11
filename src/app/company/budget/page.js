'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DollarSign, Plus, Edit2, AlertCircle, CheckCircle,
  Car, ChevronDown, ChevronUp, Calendar, TrendingUp
} from 'lucide-react'

export default function BudgetPage() {
  const supabase = createClient()

  const [budget, setBudget]       = useState(null)
  const [history, setHistory]     = useState([])
  const [fleetSpend, setFleetSpend] = useState(null)
  const [isAdmin, setIsAdmin]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [fleetLoading, setFleetLoading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [showFleet, setShowFleet] = useState(false)
  const [error, setError]         = useState(null)
  const [success, setSuccess]     = useState(null)

  const today = new Date()
  const [formData, setFormData] = useState({
    budget_amount: '',
    period_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
    period_end:   new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
    currency: 'KES',
  })

  // Period selector for fleet breakdown
  const [fleetPeriodStart, setFleetPeriodStart] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  )
  const [fleetPeriodEnd, setFleetPeriodEnd] = useState(
    new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]
  )

  useEffect(() => { fetchBudget() }, [])

  const fetchBudget = async () => {
    try {
      const res  = await fetch('/api/company/budget')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load budget')
      setBudget(data.budget || null)
      setHistory(data.history || [])
      setIsAdmin(data.isAdmin ?? true)
      if (data.budget) {
        setFormData({
          budget_amount: data.budget.budget_amount,
          period_start:  data.budget.period_start,
          period_end:    data.budget.period_end,
          currency:      data.budget.currency || 'KES',
        })
      }
    } catch (err) {
      setError('Failed to load budget data')
    } finally {
      setLoading(false)
    }
  }

  const fetchFleetSpend = useCallback(async () => {
    setFleetLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      // Resolve company
      let companyId = null
      const { data: owned } = await supabase
        .from('company_profiles').select('id').eq('owner_user_id', profile.id).maybeSingle()
      if (owned) {
        companyId = owned.id
      } else {
        const { data: mem } = await supabase
          .from('company_users').select('company_id, is_admin')
          .eq('user_id', profile.id).eq('is_active', true).maybeSingle()
        if (mem?.is_admin) companyId = mem.company_id
      }
      if (!companyId) return

      const { data: result } = await supabase.rpc('get_fleet_spend_summary', {
        p_company_id:      companyId,
        p_requesting_user: user.id,
        p_period_start:    fleetPeriodStart,
        p_period_end:      fleetPeriodEnd,
      })
      if (result?.success) setFleetSpend(result)
    } catch {}
    finally { setFleetLoading(false) }
  }, [fleetPeriodStart, fleetPeriodEnd])

  useEffect(() => {
    if (showFleet) fetchFleetSpend()
  }, [showFleet, fetchFleetSpend])

  const handleSave = async () => {
    if (!formData.budget_amount || parseFloat(formData.budget_amount) <= 0) {
      setError('Please enter a valid budget amount'); return
    }
    setSaving(true); setError(null)
    try {
      const method  = budget ? 'PATCH' : 'POST'
      const payload = budget
        ? { id: budget.id, ...formData, budget_amount: parseFloat(formData.budget_amount) }
        : { ...formData, budget_amount: parseFloat(formData.budget_amount) }
      const res  = await fetch('/api/company/budget', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save budget')
      setSuccess('Budget saved successfully')
      setShowForm(false)
      fetchBudget()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Failed to save budget: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const spentPct    = budget
    ? Math.min(Math.round((budget.spent_amount / budget.budget_amount) * 100), 100)
    : 0
  const remaining   = budget ? budget.budget_amount - budget.spent_amount : 0
  const isOverBudget = remaining < 0
  const barColor    = spentPct > 90 ? 'bg-red-500' : spentPct > 70 ? 'bg-yellow-500' : 'bg-green-500'
  const fmt = (n) => `KES ${Number(n || 0).toLocaleString()}`

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
          <h1 className="text-2xl font-bold text-gray-900">Budget Management</h1>
          <p className="text-sm text-gray-500 mt-1">Track and control your company's service spend</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            {budget ? <><Edit2 className="w-4 h-4" /> Edit Budget</> : <><Plus className="w-4 h-4" /> Set Budget</>}
          </button>
        )}
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

      {/* Budget form */}
      {showForm && isAdmin && (
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
            <input type="number" min="0" step="1000" value={formData.budget_amount}
              onChange={e => setFormData({ ...formData, budget_amount: e.target.value })}
              placeholder="e.g. 500000"
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

      {/* Current period budget card */}
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
              { label: 'Budget',    value: budget.budget_amount, color: 'text-gray-900'                          },
              { label: 'Spent',     value: budget.spent_amount,  color: 'text-red-600'                           },
              { label: 'Remaining', value: Math.abs(remaining),  color: isOverBudget ? 'text-red-600' : 'text-green-600',
                prefix: isOverBudget ? '−' : '' },
            ].map(({ label, value, color, prefix = '' }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-base font-bold mt-0.5 ${color}`}>
                  {prefix}KES {Number(value).toLocaleString()}
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
            {isAdmin ? 'Click "Set Budget" to define a spend limit.' : 'Contact your company admin to set a budget.'}
          </p>
        </div>
      )}

      {/* ── Fleet vehicle breakdown ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowFleet(s => !s)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Car size={18} className="text-blue-600" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">Fleet Spend Breakdown</p>
              <p className="text-xs text-gray-500 mt-0.5">Per-vehicle service costs</p>
            </div>
          </div>
          {showFleet ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {showFleet && (
          <div className="border-t border-gray-100 p-5 space-y-4">
            {/* Period selector */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-xs text-gray-500">Period:</span>
              </div>
              <input type="date" value={fleetPeriodStart}
                onChange={e => setFleetPeriodStart(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={fleetPeriodEnd}
                onChange={e => setFleetPeriodEnd(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500" />
              <button onClick={fetchFleetSpend} disabled={fleetLoading}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                {fleetLoading ? 'Loading…' : 'Apply'}
              </button>
            </div>

            {fleetLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : fleetSpend?.by_vehicle?.length > 0 ? (
              <>
                {/* Total */}
                <div className="bg-blue-50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900 flex items-center gap-2">
                    <TrendingUp size={15} /> Total fleet spend this period
                  </span>
                  <span className="text-base font-bold text-blue-900">
                    {fmt(fleetSpend.total_spend)}
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
                      {fleetSpend.by_vehicle.map((v, i) => {
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
                    {fleetSpend.by_vehicle.length > 1 && (
                      <tfoot>
                        <tr className="border-t-2 border-gray-200">
                          <td className="py-2.5 font-bold text-gray-900">Total</td>
                          <td className="py-2.5 text-right text-gray-600 text-xs">
                            {fleetSpend.by_vehicle.reduce((s, v) => s + Number(v.invoice_count || 0), 0)}
                          </td>
                          <td className="py-2.5 text-right font-bold text-gray-900">
                            {fmt(fleetSpend.total_spend)}
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
                <p className="text-sm">No fleet spend recorded for this period.</p>
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
              const pct     = h.budget_amount > 0
                ? Math.min(Math.round((h.spent_amount / h.budget_amount) * 100), 100)
                : 0
              const isOver  = h.spent_amount > h.budget_amount
              const barClr  = pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-yellow-400' : 'bg-green-400'
              return (
                <div key={h.id || i}>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>
                      {new Date(h.period_start).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}
                    </span>
                    <span className={`font-medium ${isOver ? 'text-red-600' : 'text-gray-700'}`}>
                      {fmt(h.spent_amount)} / {fmt(h.budget_amount)}
                    </span>
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