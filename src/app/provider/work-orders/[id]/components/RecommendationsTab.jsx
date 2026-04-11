'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, CheckCircle, AlertCircle, Loader2,
  Wrench, Calendar, Gauge, Bell, X
} from 'lucide-react'

const PRIORITY_STYLES = {
  low:    'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export default function RecommendationsTab({ workOrder }) {
  const supabase = createClient()

  const [recs, setRecs]           = useState([])
  const [services, setServices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showForm, setShowForm]   = useState(false)

  const [form, setForm] = useState({
    service_id:           '',
    note:                 '',
    recommended_mileage:  '',
    recommended_date:     '',
    priority:             'normal',
  })

  const isTerminal = ['cancelled'].includes(workOrder.status?.code)

  const loadRecs = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('maintenance_recommendations')
        .select(`
          id, note, recommended_mileage, recommended_date,
          priority, is_acknowledged, created_at,
          service:services(id, name),
          mechanic:mechanics(user:user_profiles(first_name, last_name))
        `)
        .eq('work_order_id', workOrder.id)
        .order('created_at', { ascending: false })
      if (err) throw err
      setRecs(data || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [workOrder.id])

  const loadServices = useCallback(async () => {
    const { data } = await supabase.from('services').select('id, name').order('name')
    setServices(data || [])
  }, [])

  useEffect(() => {
    loadRecs()
    loadServices()
  }, [loadRecs, loadServices])

  const handleAdd = async () => {
    if (!form.note?.trim() && !form.service_id) {
      setError('Add a note or select a service')
      return
    }
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('add_maintenance_recommendation', {
        p_work_order_id:       workOrder.id,
        p_provider_user_id:    user.id,
        p_service_id:          form.service_id   || null,
        p_note:                form.note.trim()   || null,
        p_recommended_mileage: form.recommended_mileage ? parseInt(form.recommended_mileage) : null,
        p_recommended_date:    form.recommended_date     || null,
        p_priority:            form.priority,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setSuccess('Recommendation added. Owner notified.')
      setShowForm(false)
      setForm({ service_id: '', note: '', recommended_mileage: '', recommended_date: '', priority: 'normal' })
      await loadRecs()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-red-700">{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-sm">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-green-700">{success}</span>
        </div>
      )}

      {/* Recommendations list */}
      {recs.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Wrench size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No recommendations added yet.</p>
          {!isTerminal && (
            <button onClick={() => setShowForm(true)}
              className="mt-3 text-sm text-green-600 hover:text-green-700 font-medium">
              + Add first recommendation
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map(rec => (
            <div key={rec.id}
              className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {rec.service && (
                  <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Wrench size={13} className="text-gray-400" />
                    {rec.service.name}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[rec.priority]}`}>
                  {rec.priority}
                </span>
                {rec.is_acknowledged && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Acknowledged
                  </span>
                )}
              </div>

              {rec.note && (
                <p className="text-sm text-gray-700">{rec.note}</p>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                {rec.recommended_mileage && (
                  <span className="flex items-center gap-1">
                    <Gauge size={12} /> Due at {rec.recommended_mileage.toLocaleString()} km
                  </span>
                )}
                {rec.recommended_date && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    Due {new Date(rec.recommended_date).toLocaleDateString('en-KE', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </span>
                )}
                {rec.mechanic?.user && (
                  <span>
                    By {rec.mechanic.user.first_name} {rec.mechanic.user.last_name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {!isTerminal && (
        !showForm ? (
          <button onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors">
            <Plus size={16} /> Add Recommendation
          </button>
        ) : (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">New recommendation</p>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Service (optional)</label>
                <select value={form.service_id}
                  onChange={e => setForm(f => ({ ...f, service_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                  <option value="">Select service...</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Note *</label>
                <textarea value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Replace front brake pads — 30% remaining..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Due at mileage (km)</label>
                <input type="number" value={form.recommended_mileage}
                  onChange={e => setForm(f => ({ ...f, recommended_mileage: e.target.value }))}
                  placeholder="e.g. 100000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Due by date</label>
                <input type="date" value={form.recommended_date}
                  onChange={e => setForm(f => ({ ...f, recommended_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Priority</label>
                <select value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                Save & Notify Owner
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )
      )}
    </div>
  )
}