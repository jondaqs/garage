'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Trash2, CheckCircle, PlayCircle, SkipForward,
  AlertCircle, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Info, DollarSign, Edit3
} from 'lucide-react'

const STATUS_STYLES = {
  pending:     'bg-gray-100 text-gray-600',
  in_progress: 'bg-orange-100 text-orange-700',
  completed:   'bg-green-100 text-green-700',
  skipped:     'bg-gray-100 text-gray-400 line-through',
  cancelled:   'bg-red-100 text-red-600',
}

export default function ServicesTab({ workOrder, onEstimateChange, onServiceAdded, readOnly = false, onReApprovalNeeded }) {
  // Resolve service_provider_id from either flat field or nested object (provider vs mechanic page)
  const providerSvcId = workOrder.service_provider_id || workOrder.service_provider?.id

  const estimateApproved = workOrder.status?.code === 'in_progress' ||
    ['in_progress','quality_check','rework','completed','closed'].includes(workOrder.status?.code)
  // Also approved if WO status is 'approved' (customer approved estimate)
  const customerApproved = ['approved','in_progress','quality_check','rework','completed','closed'].includes(workOrder.status?.code)
  const supabase = createClient()

  const [services, setServices]         = useState([])
  const [allServices, setAllServices]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [success, setSuccess]           = useState('')
  const [estimate, setEstimate]         = useState(null)
  const [seeding, setSeeding]           = useState(false)
  const [seedDone, setSeedDone]         = useState(false)
  const [showNewServiceForm, setShowNewServiceForm] = useState(false)
  const [newServiceName, setNewServiceName]         = useState('')
  const [newServiceDesc, setNewServiceDesc]         = useState('')
  const [savingNewSvc, setSavingNewSvc]             = useState(false)
  const [toast, setToast]               = useState('')

  // Add service form
  const [showAdd, setShowAdd]           = useState(false)
  const [newService, setNewService]     = useState({
    service_id: '', estimated_cost: '', notes: ''
  })

  // Inline edit state per row
  const [editing, setEditing]           = useState({})   // { [id]: { actual_cost, notes } }
  const [estimating, setEstimating]     = useState({})   // { [id]: { estimated_cost, notes } } for seeded services

  // Work order's own currency — services are always priced in this currency
  // (unlike parts, which can come from inventory in a different currency).
  // We fetch it once on mount; the parent page passes `workOrder` with
  // currency_id but no joined currencies row.
  const [woCurrency, setWoCurrency]     = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadWoCurrency () {
      if (!workOrder.currency_id) { setWoCurrency(null); return }
      const { data } = await supabase
        .from('currencies')
        .select('id, code, symbol, display_name')
        .eq('id', workOrder.currency_id)
        .single()
      if (!cancelled) setWoCurrency(data || null)
    }
    loadWoCurrency()
    return () => { cancelled = true }
  }, [workOrder.currency_id])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const hasBooking = !!workOrder.booking_id
  const isTerminal = ['completed','cancelled','closed'].includes(workOrder.status?.code)

  const loadServices = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('work_order_services')
        .select(`
          id, estimated_cost, actual_cost, notes, started_at, completed_at, sequence_order,
          status:work_order_services_statuses(code, display_name),
          service:services(id, name, description),
          mechanic:mechanics(user:user_profiles_secure!user_id(first_name, last_name))
        `)
        .eq('work_order_id', workOrder.id)
        .order('sequence_order', { ascending: true })

      if (err) throw err
      setServices(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [workOrder.id])

  const [providerServiceIds, setProviderServiceIds] = useState(new Set())

  const loadAllServices = useCallback(async () => {
    // Load all services
    const { data: svcs } = await supabase
      .from('services')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
    setAllServices(svcs || [])

    // Load provider-specific services for highlighting
    if (providerSvcId) {
      const { data: provSvcs } = await supabase
        .from('service_provider_services')
        .select('service_id')
        .eq('service_provider_id', providerSvcId)
        .eq('is_active', true)
      setProviderServiceIds(new Set((provSvcs || []).map(s => s.service_id)))
    }
  }, [providerSvcId])

  const refreshEstimate = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase.rpc('calculate_work_order_estimate', {
        p_work_order_id:    workOrder.id,
        p_provider_user_id: user.id,
      })
      if (data?.success) {
        setEstimate(data)
        onEstimateChange?.(data)
      }
    } catch {}
  }, [workOrder.id])

  useEffect(() => {
    loadServices()
    loadAllServices()
    refreshEstimate()
  }, [loadServices, loadAllServices, refreshEstimate])

  // Auto-seed from booking on first open
  useEffect(() => {
    if (hasBooking && !seedDone && !loading && services.length === 0) {
      handleSeedFromBooking(true)
    }
  }, [hasBooking, loading, services.length, seedDone])

  const handleSeedFromBooking = async (silent = false) => {
    if (!silent) setSeeding(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('seed_services_from_booking', {
        p_work_order_id:    workOrder.id,
        p_provider_user_id: user.id,
      })
      if (rpcErr) throw rpcErr
      setSeedDone(true)
      if (data.imported > 0) {
        setSuccess(`${data.imported} service${data.imported > 1 ? 's' : ''} imported from booking`)
        await loadServices()
        await refreshEstimate()
      }
    } catch (e) {
      if (!silent) setError(e.message)
    } finally {
      setSeeding(false)
    }
  }

  const handleAddService = async () => {
    if (!newService.service_id) { setError('Select a service'); return }
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error: rpcErr } = await supabase.rpc('add_work_order_service', {
        p_work_order_id:    workOrder.id,
        p_service_id:       newService.service_id,
        p_estimated_cost:   newService.estimated_cost ? parseFloat(newService.estimated_cost) : null,
        p_notes:            newService.notes || null,
        p_provider_user_id: user.id,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setNewService({ service_id: '', estimated_cost: '', notes: '' })
      setShowAdd(false)
      onServiceAdded?.()
      await loadServices()
      await refreshEstimate()
      if (customerApproved) {
        setSuccess('Service added. Since the customer already approved the estimate, re-approval is required.')
        onReApprovalNeeded?.()
      } else {
        setSuccess('Service added')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAndAddService = async (force = false) => {
    if (!newServiceName.trim()) return
    setSavingNewSvc(true)
    setError('')
    try {
      const resp = await fetch('/api/services/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:                newServiceName.trim(),
          description:         newServiceDesc.trim() || null,
          service_provider_id: providerSvcId,
          force,
        }),
      })
      const result = await resp.json()

      // Exact duplicate — offer to use existing
      if (resp.status === 409 && result.duplicate) {
        if (window.confirm(`${result.error}\n\nUse the existing service instead?`)) {
          setNewService(s => ({ ...s, service_id: result.existing_id }))
          setNewServiceName('')
          setNewServiceDesc('')
          setShowNewServiceForm(false)
        }
        return
      }

      // Similarity warning — confirm before proceeding
      if (result.warning) {
        if (window.confirm(`${result.message}\n\nClick OK to add it anyway, or Cancel to go back.`)) {
          await handleCreateAndAddService(true)  // retry with force=true
        }
        return
      }

      if (!resp.ok || !result.service_id) throw new Error(result.error || 'Failed to create service')

      setNewService(s => ({ ...s, service_id: result.service_id }))
      setNewServiceName('')
      setNewServiceDesc('')
      setShowNewServiceForm(false)
      setSuccess(`Service "${result.name}" created and selected`)
      await loadAllServices()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingNewSvc(false)
    }
  }

  const handleSaveEstimate = async (wosId) => {
    const data = estimating[wosId]
    if (!data) return
    setSaving(true)
    setError('')
    try {
      const { error: upErr } = await supabase
        .from('work_order_services')
        .update({
          estimated_cost: data.estimated_cost !== '' ? parseFloat(data.estimated_cost) : null,
          notes:          data.notes || null,
        })
        .eq('id', wosId)
      if (upErr) throw upErr
      const orig = services.find(s => s.id === wosId)?.estimated_cost
      const newVal = data.estimated_cost !== '' ? parseFloat(data.estimated_cost) : null
      setEstimating(e => { const n = { ...e }; delete n[wosId]; return n })
      onServiceAdded?.()
      await loadServices()
      await refreshEstimate()
      if (customerApproved && orig !== null && newVal !== null && newVal !== Number(orig)) {
        setSuccess('Estimate updated. Cost changed — customer re-approval required.')
        onReApprovalNeeded?.()
      } else {
        setSuccess('Estimate saved')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async (wosId, newStatus, actualCost = null) => {
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const editData = editing[wosId] || {}
      const { data, error: rpcErr } = await supabase.rpc('update_work_order_service_status', {
        p_wos_id:           wosId,
        p_new_status_code:  newStatus,
        p_provider_user_id: user.id,
        p_actual_cost:      actualCost ?? (editData.actual_cost ? parseFloat(editData.actual_cost) : null),
        p_notes:            editData.notes || null,
      })
      if (rpcErr) throw rpcErr
      if (!data.success) throw new Error(data.error)
      setEditing(e => { const n = { ...e }; delete n[wosId]; return n })
      await loadServices()
      await refreshEstimate()
      // If actual cost was set and differs from estimate, customer needs to re-approve
      const svc = services.find(s => s.id === wosId)
      const finalActual = actualCost ?? (editing[wosId]?.actual_cost ? parseFloat(editing[wosId].actual_cost) : null)
      if (newStatus === 'completed' && finalActual !== null && svc && finalActual !== Number(svc.estimated_cost)) {
        setSuccess('Service completed. Actual cost differs from estimate — customer re-approval required.')
        onReApprovalNeeded?.()
      } else {
        setSuccess('Service updated')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Currency formatter. Defaults to the work order's currency since all
  // service line items are denominated in it; callers can override for
  // edge cases. Falls back to a bare number if no currency is available.
  const fmt = (n, currency = woCurrency) => {
    if (n == null) return '—'
    const num = Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (!currency) return num
    return `${currency.symbol || currency.code} ${num}`
  }

  // Short label for the cost input fields, e.g. "KES" or "(KES)" — used in
  // inline edit forms instead of the old hardcoded "(KES)".
  const currencyLabel = woCurrency
    ? (woCurrency.code || woCurrency.symbol || 'currency')
    : 'currency'

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Alerts */}
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

      {/* Toast — estimate not approved warning */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-gray-900 text-white text-sm rounded-xl shadow-xl animate-fade-in">
          {toast}
        </div>
      )}

      {/* Estimate approval status banner */}
      {!customerApproved && !readOnly && workOrder.status?.code !== 'intake' && workOrder.status?.code !== 'assigned' && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2 text-sm text-amber-800">
          <AlertCircle size={15} className="flex-shrink-0" />
          Service transitions are locked — awaiting customer estimate approval before work can begin.
        </div>
      )}

      {/* Booking seed banner */}
      {hasBooking && services.length === 0 && seedDone && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <Info size={15} />
            No services from the linked booking were found, or they were already imported.
          </div>
          <button onClick={() => handleSeedFromBooking(false)} disabled={seeding}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
            {seeding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Re-import
          </button>
        </div>
      )}

      {hasBooking && services.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-blue-700 flex items-center gap-1">
            <Info size={12} /> Services seeded from booking #{workOrder.booking?.booking_number}
          </p>
          <button onClick={() => handleSeedFromBooking(false)} disabled={seeding}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            {seeding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Sync from booking
          </button>
        </div>
      )}

      {/* Services list */}
      {services.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No services added yet.</p>
          {!isTerminal && !readOnly && (
            <button onClick={() => setShowAdd(true)}
              className="mt-3 text-sm text-green-600 hover:text-green-700 font-medium">
              + Add the first service
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((svc) => {
            const statusCode = svc.status?.code || 'pending'
            const isEditing  = !!editing[svc.id]
            return (
              <div key={svc.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900 text-sm">{svc.service?.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[statusCode] || STATUS_STYLES.pending}`}>
                        {svc.status?.display_name || statusCode}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      {svc.estimated_cost != null
                        ? <span className="text-blue-700 font-medium">Est: {fmt(svc.estimated_cost)}</span>
                        : <span className="text-amber-600 font-medium italic">No estimate set</span>
                      }
                      {svc.actual_cost != null && (
                        <span className="text-green-700 font-medium">Actual: {fmt(svc.actual_cost)}</span>
                      )}
                      {svc.mechanic?.user && (
                        <span>
                          {svc.mechanic.user.first_name} {svc.mechanic.user.last_name}
                        </span>
                      )}
                    </div>
                    {svc.notes && !isEditing && !estimating[svc.id] && (
                      <p className="text-xs text-gray-500 mt-1 italic">{svc.notes}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!isTerminal && !readOnly && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Edit estimate — for pending services without pricing */}
                      {statusCode === 'pending' && !estimating[svc.id] && !isEditing && (
                        <button
                          onClick={() => setEstimating(e => ({
                            ...e,
                            [svc.id]: { estimated_cost: svc.estimated_cost ?? '', notes: svc.notes ?? '' }
                          }))}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                          title="Set estimate cost">
                          <Edit3 size={15} />
                        </button>
                      )}
                      {statusCode === 'pending' && (
                        <button
                          onClick={() => {
                            if (!customerApproved) {
                              showToast('⚠️ Cannot start — customer estimate approval is pending')
                              return
                            }
                            handleUpdateStatus(svc.id, 'in_progress')
                          }}
                          disabled={saving}
                          className={`p-1.5 rounded-lg ${customerApproved ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-300 cursor-not-allowed'}`}
                          title={customerApproved ? 'Start' : 'Awaiting customer approval'}>
                          <PlayCircle size={16} />
                        </button>
                      )}
                      {statusCode === 'in_progress' && (
                        <button onClick={() => setEditing(e => ({
                          ...e,
                          [svc.id]: { actual_cost: String(svc.actual_cost ?? svc.estimated_cost ?? ''), notes: svc.notes || '' }
                        }))}
                          disabled={saving}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Complete">
                          <CheckCircle size={16} />
                        </button>
                      )}
                      {['pending','in_progress'].includes(statusCode) && (
                        <button onClick={() => handleUpdateStatus(svc.id, 'skipped')}
                          disabled={saving}
                          className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg" title="Skip">
                          <SkipForward size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline estimate form — for setting estimated_cost on seeded services */}
                {estimating[svc.id] && (
                  <div className="border-t border-blue-100 bg-blue-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                      <Edit3 size={11} /> Set Service Estimate
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Estimated Cost ({currencyLabel})</label>
                        <input type="number" min="0"
                          value={estimating[svc.id]?.estimated_cost}
                          onChange={e => setEstimating(ed => ({ ...ed, [svc.id]: { ...ed[svc.id], estimated_cost: e.target.value } }))}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Notes</label>
                        <input type="text"
                          value={estimating[svc.id]?.notes}
                          onChange={e => setEstimating(ed => ({ ...ed, [svc.id]: { ...ed[svc.id], notes: e.target.value } }))}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-400" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEstimate(svc.id)} disabled={saving || readOnly}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Save Estimate
                      </button>
                      <button onClick={() => setEstimating(e => { const n = { ...e }; delete n[svc.id]; return n })}
                        className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-xs">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline complete form */}
                {isEditing && (
                  <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-700">Complete service</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Actual Cost ({currencyLabel})</label>
                        <input type="number"
                          value={editing[svc.id]?.actual_cost}
                          onChange={e => setEditing(ed => ({ ...ed, [svc.id]: { ...ed[svc.id], actual_cost: e.target.value } }))}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Notes</label>
                        <input type="text"
                          value={editing[svc.id]?.notes}
                          onChange={e => setEditing(ed => ({ ...ed, [svc.id]: { ...ed[svc.id], notes: e.target.value } }))}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdateStatus(svc.id, 'completed')}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Mark Complete
                      </button>
                      <button onClick={() => setEditing(e => { const n = { ...e }; delete n[svc.id]; return n })}
                        className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-xs">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add service */}
      {!isTerminal && !readOnly && (
        <div>
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors">
              <Plus size={16} /> Add Service
            </button>
          ) : (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
              <p className="text-sm font-medium text-gray-700">Add service</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-xs text-gray-500 block mb-1">Service *</label>
                  <select value={newService.service_id}
                    onChange={e => {
                      if (e.target.value === '__other__') {
                        setShowNewServiceForm(true)
                        setNewService(s => ({ ...s, service_id: '' }))
                      } else {
                        setNewService(s => ({ ...s, service_id: e.target.value }))
                        setShowNewServiceForm(false)
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                    <option value="">Select service...</option>
                    {/* Provider services group */}
                    {allServices.filter(s => providerServiceIds.has(s.id)).length > 0 && (
                      <optgroup label="— This Provider's Services —">
                        {allServices.filter(s => providerServiceIds.has(s.id)).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </optgroup>
                    )}
                    {/* All other services */}
                    {allServices.filter(s => !providerServiceIds.has(s.id)).length > 0 && (
                      <optgroup label="— All Other Services —">
                        {allServices.filter(s => !providerServiceIds.has(s.id)).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </optgroup>
                    )}
                    <option value="__other__">＋ Other (add new service…)</option>
                  </select>
                  {/* Provider services legend */}
                  {providerServiceIds.size > 0 && (
                    <p className="text-[10px] text-green-700 mt-1 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-green-100 border border-green-400 inline-block" />
                      Services listed under "This Provider's Services" are offered by this garage
                    </p>
                  )}
                </div>
                {/* Inline create new service form */}
                {showNewServiceForm && (
                  <div className="sm:col-span-3 bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-green-800">Define new service</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Service Name *</label>
                        <input type="text" value={newServiceName}
                          onChange={e => setNewServiceName(e.target.value)}
                          placeholder="e.g. Brake pad replacement"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-green-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Description</label>
                        <input type="text" value={newServiceDesc}
                          onChange={e => setNewServiceDesc(e.target.value)}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-green-400" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleCreateAndAddService(false)} disabled={savingNewSvc || !newServiceName.trim()}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                        {savingNewSvc ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Create &amp; Select
                      </button>
                      <button onClick={() => { setShowNewServiceForm(false); setNewServiceName(''); setNewServiceDesc('') }}
                        className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-xs">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Estimated Cost ({currencyLabel})</label>
                  <input type="number" value={newService.estimated_cost}
                    onChange={e => setNewService(s => ({ ...s, estimated_cost: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Notes</label>
                  <input type="text" value={newService.notes}
                    onChange={e => setNewService(s => ({ ...s, notes: e.target.value }))}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddService} disabled={saving || !newService.service_id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add
                </button>
                <button onClick={() => { setShowAdd(false); setNewService({ service_id: '', estimated_cost: '', notes: '' }) }}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estimate summary */}
      {estimate && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-semibold text-blue-900 flex items-center gap-2 mb-3">
            <DollarSign size={15} /> Estimate Summary
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Services</span><span>{fmt(estimate.services_total)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Parts (reserved)</span><span>{fmt(estimate.parts_total)}</span>
            </div>
            <div className="flex justify-between text-gray-600 border-t border-blue-200 pt-1.5">
              <span>Subtotal</span><span>{fmt(estimate.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>VAT (16%)</span><span>{fmt(estimate.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-blue-900 text-base border-t border-blue-300 pt-1.5">
              <span>Total</span><span>{fmt(estimate.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}