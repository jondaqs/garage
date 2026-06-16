// src/components/subscription/SaveCustomPlanModal.jsx
'use client'

/**
 * SaveCustomPlanModal
 *
 * Opened from the admin CalculatorTab after a price computation.
 * Lets the admin search for a company or service provider, preview the
 * auto-generated custom plan name/pricing, and save it as a targeted
 * tier + package set via the save_custom_plan RPC.
 *
 * Props:
 *   isOpen           - boolean
 *   onClose          - function
 *   onSaved          - function(result) — called after successful save
 *   supabase         - supabase client instance
 *   subscriberType   - 'company' | 'service_provider'
 *   calculatorResult - the full result object from compute_subscription_price
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Search, Loader2, CheckCircle, AlertCircle, Building2,
  Wrench, Sparkles, Save, Package, DollarSign,
} from 'lucide-react'

const fmt = (n, sym = '$') => `${sym}${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SaveCustomPlanModal({
  isOpen,
  onClose,
  onSaved,
  supabase,
  subscriberType,
  calculatorResult,
}) {
  // Entity search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState(null)
  const searchTimeout = useRef(null)

  // Notes
  const [notes, setNotes] = useState('')

  // Save state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveResult, setSaveResult] = useState(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setSearchResults([])
      setSelectedEntity(null)
      setNotes('')
      setError('')
      setSaveResult(null)
    }
  }, [isOpen])

  // Debounced entity search
  const searchEntities = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const table = subscriberType === 'company' ? 'company_profiles' : 'service_providers'
      const { data, error: err } = await supabase
        .from(table)
        .select('id, name')
        .ilike('name', `%${q}%`)
        .eq('is_active', true)
        .order('name')
        .limit(10)
      if (err) throw err
      setSearchResults(data || [])
    } catch (e) {
      console.error('Entity search error:', e)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [supabase, subscriberType])

  const handleSearchChange = (val) => {
    setSearchQuery(val)
    setSelectedEntity(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => searchEntities(val), 300)
  }

  const handleSelectEntity = (entity) => {
    setSelectedEntity(entity)
    setSearchQuery(entity.name)
    setSearchResults([])
    setError('')
  }

  // Save custom plan
  const handleSave = async () => {
    if (!selectedEntity) {
      setError(`Please select a ${subscriberType === 'company' ? 'company' : 'service provider'}`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const r = calculatorResult
      const pricing = r.pricing || {}
      const { data, error: rpcErr } = await supabase.rpc('save_custom_plan', {
        p_subscriber_type: subscriberType,
        p_target_entity_id: selectedEntity.id,
        p_base_monthly_price: Number(pricing.monthly_total || pricing.base_monthly_price || 0),
        p_currency_code: pricing.currency_code || 'KES',
        p_features: r.tier?.features || [],
        p_vehicle_count: r.metrics?.vehicles || 0,
        p_staff_count: r.metrics?.staff || 0,
        p_monthly_client_count: r.metrics?.monthly_clients || 0,
        p_shop_count: r.metrics?.shops || 0,
        p_max_users_included: null,
        p_max_vehicles_included: r.metrics?.vehicles || null,
        p_max_shops_included: r.metrics?.shops || null,
        p_calculator_snapshot: r,
        p_notes: notes || null,
      })

      if (rpcErr) throw rpcErr
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (!result.success) throw new Error(result.error)

      setSaveResult(result)
      if (onSaved) onSaved(result)
    } catch (e) {
      setError(e.message || 'Failed to save custom plan')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const r = calculatorResult || {}
  const pricing = r.pricing || {}
  const currSym = pricing.currency_symbol || '$'
  const entityLabel = subscriberType === 'company' ? 'Company' : 'Service Provider'
  const EntityIcon = subscriberType === 'company' ? Building2 : Wrench

  // Preview name
  const previewName = selectedEntity
    ? `Custom — ${selectedEntity.name} — #________`
    : `Custom — [select ${entityLabel.toLowerCase()}] — #________`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={saveResult ? onClose : undefined} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" />
            <h2 className="text-base font-bold text-gray-900">Save as Custom Plan</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5">

          {/* ── Success view ── */}
          {saveResult ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={28} className="text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">Custom Plan Created</p>
                <p className="text-sm text-gray-500 mt-1">{saveResult.packages_created} package{saveResult.packages_created !== 1 ? 's' : ''} generated across all billing periods</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Plan name</span>
                  <span className="font-medium text-gray-900 text-right text-xs max-w-[60%] truncate">{saveResult.package_name_prefix}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Assigned to</span>
                  <span className="font-medium text-gray-900">{saveResult.target_entity?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tier code</span>
                  <span className="font-mono text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded">{saveResult.tier_code}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                The {entityLabel.toLowerCase()} can now see this plan in their Browse Plans tab and subscribe to it.
              </p>
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* ── Pricing summary ── */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Pricing Summary</p>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Tier matched</span>
                    <span className="font-medium text-gray-900">{r.tier?.name || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Monthly total</span>
                    <span className="font-mono font-bold text-gray-900">{fmt(pricing.monthly_total, currSym)}/mo</span>
                  </div>
                  {Number(pricing.discount_percentage) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Discount ({pricing.billing_period})</span>
                      <span className="text-green-600 font-medium">{Number(pricing.discount_percentage).toFixed(1)}%</span>
                    </div>
                  )}
                  {r.custom_pricing && Number(r.custom_pricing.total_extras) > 0 && (
                    <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                      <span className="text-gray-500">Includes extras</span>
                      <span className="text-amber-700 font-mono text-xs">+{fmt(r.custom_pricing.total_extras, currSym)}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {r.metrics?.vehicles > 0 && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{r.metrics.vehicles} vehicle{r.metrics.vehicles !== 1 ? 's' : ''}</span>}
                    {r.metrics?.staff > 0 && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{r.metrics.staff} staff</span>}
                    {r.metrics?.monthly_clients > 0 && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{r.metrics.monthly_clients} clients/mo</span>}
                    {r.metrics?.shops > 0 && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{r.metrics.shops} shop{r.metrics.shops !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
              </div>

              {/* ── Target entity selector ── */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Assign to {entityLabel}
                </p>
                <div className="relative">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder={`Search ${entityLabel.toLowerCase()} by name...`}
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {searching && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
                  </div>

                  {/* Search results dropdown */}
                  {searchResults.length > 0 && !selectedEntity && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {searchResults.map((entity) => (
                        <button
                          key={entity.id}
                          onClick={() => handleSelectEntity(entity)}
                          className="w-full text-left px-4 py-2.5 hover:bg-purple-50 flex items-center gap-2.5 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <EntityIcon size={16} className="text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-900 truncate">{entity.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery.length >= 2 && searchResults.length === 0 && !searching && !selectedEntity && (
                    <p className="text-xs text-gray-400 mt-1.5">No {entityLabel.toLowerCase()}s found matching "{searchQuery}"</p>
                  )}
                </div>

                {/* Selected entity badge */}
                {selectedEntity && (
                  <div className="mt-2 flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                    <EntityIcon size={16} className="text-purple-600 shrink-0" />
                    <span className="text-sm font-medium text-purple-900 truncate">{selectedEntity.name}</span>
                    <button
                      onClick={() => { setSelectedEntity(null); setSearchQuery('') }}
                      className="ml-auto p-0.5 rounded hover:bg-purple-200 text-purple-400 hover:text-purple-700 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* ── Name preview ── */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Package Name Preview</p>
                <div className="bg-purple-50 border border-purple-100 rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <Package size={14} className="text-purple-500 shrink-0" />
                  <p className="text-sm text-purple-900 font-medium truncate">{previewName}</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">One package is created per billing period (Monthly, Quarterly, etc.). The unique ID is assigned on save.</p>
              </div>

              {/* ── Notes ── */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Notes <span className="text-gray-400 font-normal">(optional)</span></p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Admin-only notes (e.g. reason for custom pricing, negotiation reference...)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              {/* ── Error ── */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!saveResult && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !selectedEntity}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 size={16} className="animate-spin" /> Saving...</>
              ) : (
                <><Save size={16} /> Save Custom Plan</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}