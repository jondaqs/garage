'use client'
import { useState, useEffect } from 'react'
import { DollarSign, Plus, Edit2, AlertCircle, CheckCircle } from 'lucide-react'

export default function BudgetPage() {
  const [budget, setBudget] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const today = new Date()
  const [formData, setFormData] = useState({
    budget_amount: '',
    period_start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
    period_end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
    currency: 'KES',
  })

  useEffect(() => {
    fetchBudget()
  }, [])

  const fetchBudget = async () => {
    try {
      const res = await fetch('/api/company/budget')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load budget')

      setBudget(data.budget || null)
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
      console.error('Budget fetch error:', err)
      setError('Failed to load budget data')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.budget_amount || parseFloat(formData.budget_amount) <= 0) {
      setError('Please enter a valid budget amount')
      return
    }
    setSaving(true)
    setError(null)

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
      console.error('Save error:', err)
      setError('Failed to save budget: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const spentPct = budget
    ? Math.min(Math.round((budget.spent_amount / budget.budget_amount) * 100), 100)
    : 0
  const remaining = budget ? budget.budget_amount - budget.spent_amount : 0
  const isOverBudget = remaining < 0
  const barColor = spentPct > 90 ? 'bg-red-500' : spentPct > 70 ? 'bg-yellow-500' : 'bg-green-500'

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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

      {/* Feedback */}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
              <input type="date" value={formData.period_end}
                onChange={e => setFormData({ ...formData, period_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Budget Amount (KES)</label>
            <input type="number" min="0" step="1000" value={formData.budget_amount}
              onChange={e => setFormData({ ...formData, budget_amount: e.target.value })}
              placeholder="e.g. 500000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
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

      {/* Current budget card */}
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
            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${isOverBudget ? 'bg-red-100 text-red-700' : spentPct > 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
              {isOverBudget ? 'Over Budget' : spentPct > 70 ? 'High Usage' : 'On Track'}
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Spent</span>
              <span className="font-semibold text-gray-900">{spentPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className={`h-3 rounded-full transition-all ${barColor}`} style={{ width: `${spentPct}%` }} />
            </div>
          </div>

          {/* Figures */}
          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
            {[
              { label: 'Budget', value: budget.budget_amount, color: 'text-gray-900' },
              { label: 'Spent', value: budget.spent_amount, color: 'text-red-600' },
              { label: 'Remaining', value: Math.abs(remaining), color: isOverBudget ? 'text-red-600' : 'text-green-600', prefix: isOverBudget ? '-' : '' },
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
    </div>
  )
}