// src/components/EstimateApprovalToggle.jsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ToggleLeft, ToggleRight, Loader2, CheckCircle, AlertCircle, FileCheck } from 'lucide-react'

/**
 * Toggle for require_estimate_approval on user_profiles or company_profiles.
 *
 * Props:
 *  - profileId   – the user_profiles.id or company_profiles.id
 *  - tableName   – 'user_profiles' | 'company_profiles'
 *  - idColumn    – column name for the WHERE clause (default: 'id')
 */
export default function EstimateApprovalToggle({
  profileId,
  tableName = 'user_profiles',
  idColumn = 'id',
}) {
  const supabase = createClient()
  const [value, setValue] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    if (!profileId) return
    const load = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('require_estimate_approval')
          .eq(idColumn, profileId)
          .single()
        if (error) throw error
        setValue(data?.require_estimate_approval ?? false)
      } catch (err) {
        console.error('Failed to load estimate approval setting:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [profileId, tableName, idColumn]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    const newValue = !value
    setSaving(true)
    setMsg({ type: '', text: '' })
    try {
      const { error } = await supabase
        .from(tableName)
        .update({ require_estimate_approval: newValue })
        .eq(idColumn, profileId)
      if (error) throw error
      setValue(newValue)
      setMsg({ type: 'success', text: newValue ? 'Estimate approval required' : 'Provider can proceed without your approval' })
      setTimeout(() => setMsg({ type: '', text: '' }), 3000)
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <Loader2 size={16} className="animate-spin text-gray-400" />
        <span className="text-sm text-gray-400">Loading preference…</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
          <FileCheck size={20} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Estimate Approval</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {value
              ? 'You must approve every estimate before the service provider can proceed with work.'
              : 'Service providers can proceed with work on your behalf without waiting for your digital approval. You can change this at any time.'}
          </p>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={toggle}
              disabled={saving}
              className="text-gray-500 disabled:opacity-50"
              aria-label={value ? 'Disable estimate approval requirement' : 'Enable estimate approval requirement'}
            >
              {value
                ? <ToggleRight size={32} className="text-blue-600" />
                : <ToggleLeft size={32} />
              }
            </button>
            <span className="text-sm font-medium text-gray-700">
              {value ? 'Required' : 'Not required'}
            </span>
            {saving && <Loader2 size={14} className="animate-spin text-gray-400" />}
          </div>

          {msg.text && (
            <div className={`mt-3 p-2 rounded-lg flex items-center gap-2 text-xs ${
              msg.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {msg.type === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              {msg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
