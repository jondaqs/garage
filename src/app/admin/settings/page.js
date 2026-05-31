// src/app/admin/settings/page.js
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, Plus, Save, Trash2, X, CheckCircle, AlertCircle,
  Loader2, ToggleLeft, ToggleRight, Store, Wrench, DollarSign,
  Calendar, ClipboardList, ChevronDown, ChevronRight,
} from 'lucide-react'

const TABS = [
  { id: 'provider_types', label: 'Provider Types',     icon: Store },
  { id: 'services',       label: 'Services Catalog',   icon: Wrench },
  { id: 'currencies',     label: 'Currencies',         icon: DollarSign },
  { id: 'booking_types',  label: 'Booking Types',      icon: Calendar },
  { id: 'statuses',       label: 'Status Codes',       icon: ClipboardList },
]

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

// ── Generic inline-editable lookup table ────────────────────────────────────
function LookupTable({ supabase, tableName, columns, sortField = 'sort_order', defaults = {}, readOnly = false }) {
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(null)
  const [editId,   setEditId]   = useState(null)
  const [editData, setEditData] = useState({})
  const [addMode,  setAddMode]  = useState(false)
  const [newData,  setNewData]  = useState({})
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  useEffect(() => { load() }, [tableName])

  const load = async () => {
    setLoading(true)
    const { data, error: e } = await supabase
      .from(tableName).select('*').order(sortField, { ascending: true, nullsFirst: false })
    if (e) { setError(e.message); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }

  const startEdit = (row) => {
    setEditId(row.id)
    const d = {}
    columns.forEach(c => { d[c.key] = row[c.key] ?? '' })
    setEditData(d)
    setAddMode(false)
    setError('')
  }

  const cancelEdit = () => { setEditId(null); setEditData({}); setError('') }

  const saveEdit = async () => {
    setSaving(editId)
    setError('')
    try {
      const update = {}
      columns.filter(c => c.editable !== false).forEach(c => {
        let val = editData[c.key]
        if (c.type === 'boolean') val = val === true || val === 'true'
        if (c.type === 'number')  val = val === '' ? null : Number(val)
        update[c.key] = val === '' ? null : val
      })
      const { error: e } = await supabase.from(tableName).update(update).eq('id', editId)
      if (e) throw e
      setEditId(null)
      setSuccess('Updated')
      setTimeout(() => setSuccess(''), 2500)
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(null) }
  }

  const startAdd = () => {
    const d = {}
    columns.forEach(c => { d[c.key] = defaults[c.key] ?? (c.type === 'boolean' ? true : '') })
    setNewData(d)
    setAddMode(true)
    setEditId(null)
    setError('')
  }

  const saveNew = async () => {
    setSaving('new')
    setError('')
    try {
      const insert = {}
      columns.filter(c => c.editable !== false).forEach(c => {
        let val = newData[c.key]
        if (c.type === 'boolean') val = val === true || val === 'true'
        if (c.type === 'number')  val = val === '' ? null : Number(val)
        insert[c.key] = val === '' ? null : val
      })
      const { error: e } = await supabase.from(tableName).insert(insert)
      if (e) throw e
      setAddMode(false)
      setNewData({})
      setSuccess('Added')
      setTimeout(() => setSuccess(''), 2500)
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(null) }
  }

  const toggleActive = async (row, field = 'is_active') => {
    setSaving(row.id)
    try {
      const { error: e } = await supabase
        .from(tableName).update({ [field]: !row[field] }).eq('id', row.id)
      if (e) throw e
      await load()
    } catch (e) { setError(e.message) }
    finally { setSaving(null) }
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="animate-spin text-blue-600" size={24} />
    </div>
  )

  return (
    <div>
      {error && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-3 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle size={15} className="text-green-500" />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map(c => (
                <th key={c.key} className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {c.label}
                </th>
              ))}
              {!readOnly && <th className="text-right py-2.5 px-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => {
              const isEditing = editId === row.id
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  {columns.map(c => (
                    <td key={c.key} className="py-2 px-3">
                      {isEditing && c.editable !== false ? (
                        c.type === 'boolean' ? (
                          <button onClick={() => setEditData(d => ({ ...d, [c.key]: !d[c.key] }))}
                            className="text-gray-600">
                            {editData[c.key] ? <ToggleRight size={22} className="text-green-600" /> : <ToggleLeft size={22} className="text-gray-400" />}
                          </button>
                        ) : c.type === 'select' ? (
                          <select value={editData[c.key] || ''} onChange={e => setEditData(d => ({ ...d, [c.key]: e.target.value }))}
                            className={inp + ' py-1.5'}>
                            {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={c.type === 'number' ? 'number' : 'text'} value={editData[c.key] || ''}
                            onChange={e => setEditData(d => ({ ...d, [c.key]: e.target.value }))}
                            className={inp + ' py-1.5'} />
                        )
                      ) : (
                        c.type === 'boolean' ? (
                          !readOnly ? (
                            <button onClick={() => toggleActive(row, c.key)}
                              disabled={saving === row.id} className="disabled:opacity-50">
                              {row[c.key] ? <ToggleRight size={22} className="text-green-600" /> : <ToggleLeft size={22} className="text-gray-400" />}
                            </button>
                          ) : (
                            row[c.key]
                              ? <span className="text-green-600 text-xs font-medium">Yes</span>
                              : <span className="text-gray-400 text-xs">No</span>
                          )
                        ) : (
                          <span className="text-gray-900">{row[c.key] ?? <span className="text-gray-300">—</span>}</span>
                        )
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={saveEdit} disabled={saving === row.id}
                            className="p-1.5 text-green-700 hover:bg-green-50 rounded disabled:opacity-50">
                            {saving === row.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          </button>
                          <button onClick={cancelEdit} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(row)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Edit
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}

            {/* Add new row */}
            {addMode && (
              <tr className="bg-blue-50/50">
                {columns.map(c => (
                  <td key={c.key} className="py-2 px-3">
                    {c.editable === false ? (
                      <span className="text-gray-300 text-xs italic">auto</span>
                    ) : c.type === 'boolean' ? (
                      <button onClick={() => setNewData(d => ({ ...d, [c.key]: !d[c.key] }))}>
                        {newData[c.key] ? <ToggleRight size={22} className="text-green-600" /> : <ToggleLeft size={22} className="text-gray-400" />}
                      </button>
                    ) : c.type === 'select' ? (
                      <select value={newData[c.key] || ''} onChange={e => setNewData(d => ({ ...d, [c.key]: e.target.value }))}
                        className={inp + ' py-1.5'}>
                        {c.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={c.type === 'number' ? 'number' : 'text'} value={newData[c.key] || ''}
                        onChange={e => setNewData(d => ({ ...d, [c.key]: e.target.value }))}
                        placeholder={c.placeholder || c.label}
                        className={inp + ' py-1.5'} />
                    )}
                  </td>
                ))}
                <td className="py-2 px-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={saveNew} disabled={saving === 'new'}
                      className="p-1.5 text-green-700 hover:bg-green-50 rounded disabled:opacity-50">
                      {saving === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    <button onClick={() => { setAddMode(false); setError('') }}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                      <X size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && !addMode && (
        <button onClick={startAdd}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium">
          <Plus size={14} /> Add new
        </button>
      )}

      <p className="text-[11px] text-gray-400 mt-3">{rows.length} record{rows.length === 1 ? '' : 's'}</p>
    </div>
  )
}


// ── Main settings page ──────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState('provider_types')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage platform lookup data and configuration</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap mb-6">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-fit ${
                tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Provider Types ── */}
      {tab === 'provider_types' && (
        <Section title="Service Provider Types" description="Categories of service providers on the platform (e.g. Garage, Car Wash, Tyre Shop).">
          <LookupTable
            supabase={supabase}
            tableName="service_provider_types"
            sortField="sort_order"
            defaults={{ is_active: true }}
            columns={[
              { key: 'code',         label: 'Code',         placeholder: 'e.g. garage' },
              { key: 'display_name', label: 'Display Name', placeholder: 'e.g. Garage / Workshop' },
              { key: 'description',  label: 'Description',  placeholder: 'Brief description' },
              { key: 'sort_order',   label: 'Order',        type: 'number', placeholder: '1' },
              { key: 'is_active',    label: 'Active',       type: 'boolean' },
            ]}
          />
        </Section>
      )}

      {/* ── Services Catalog ── */}
      {tab === 'services' && (
        <Section title="Services Catalog" description="Master list of services and spare part categories that providers can offer.">
          <LookupTable
            supabase={supabase}
            tableName="services"
            sortField="created_at"
            defaults={{ is_active: true, service_type: 'service' }}
            columns={[
              { key: 'code',         label: 'Code',     placeholder: 'e.g. oil_change' },
              { key: 'display_name', label: 'Name',     placeholder: 'e.g. Oil Change' },
              { key: 'category',     label: 'Category', placeholder: 'e.g. Maintenance' },
              { key: 'service_type', label: 'Type',     type: 'select', options: ['service', 'spare_part'] },
              { key: 'is_active',    label: 'Active',   type: 'boolean' },
            ]}
          />
        </Section>
      )}

      {/* ── Currencies ── */}
      {tab === 'currencies' && (
        <Section title="Currencies" description="Currencies available for provider pricing and invoicing.">
          <LookupTable
            supabase={supabase}
            tableName="currencies"
            sortField="sort_order"
            defaults={{ is_active: true, decimal_digits: 2 }}
            columns={[
              { key: 'code',           label: 'Code',     placeholder: 'e.g. KES' },
              { key: 'display_name',   label: 'Name',     placeholder: 'e.g. Kenyan Shilling' },
              { key: 'symbol',         label: 'Symbol',   placeholder: 'e.g. KSh' },
              { key: 'country',        label: 'Country',  placeholder: 'e.g. Kenya' },
              { key: 'decimal_digits', label: 'Decimals', type: 'number' },
              { key: 'sort_order',     label: 'Order',    type: 'number' },
              { key: 'is_active',      label: 'Active',   type: 'boolean' },
            ]}
          />
        </Section>
      )}

      {/* ── Booking Types ── */}
      {tab === 'booking_types' && (
        <Section title="Booking Types" description="Types of bookings customers can make (e.g. Walk-in, Scheduled, Emergency).">
          <LookupTable
            supabase={supabase}
            tableName="booking_types"
            sortField="created_at"
            defaults={{}}
            columns={[
              { key: 'code',                        label: 'Code',         placeholder: 'e.g. scheduled' },
              { key: 'display_name',                label: 'Display Name', placeholder: 'e.g. Scheduled Appointment' },
              { key: 'description',                 label: 'Description',  placeholder: 'Brief description' },
              { key: 'estimated_duration_minutes',  label: 'Est. Duration (min)', type: 'number', placeholder: '60' },
            ]}
          />
        </Section>
      )}

      {/* ── Status Codes (read-only reference) ── */}
      {tab === 'statuses' && (
        <div className="space-y-6">
          <Section title="Booking Statuses" description="Status codes for the booking lifecycle. These are system-managed — editing may break workflows.">
            <LookupTable
              supabase={supabase}
              tableName="booking_statuses"
              sortField="sort_order"
              readOnly
              columns={[
                { key: 'code',         label: 'Code',    editable: false },
                { key: 'display_name', label: 'Label',   editable: false },
                { key: 'description',  label: 'Description', editable: false },
                { key: 'sort_order',   label: 'Order',   editable: false },
                { key: 'color_code',   label: 'Color',   editable: false },
                { key: 'is_active',    label: 'Active',  type: 'boolean', editable: false },
              ]}
            />
          </Section>

          <Section title="Work Order Statuses" description="Status codes for the work order lifecycle. These are system-managed — editing may break workflows.">
            <LookupTable
              supabase={supabase}
              tableName="work_order_statuses"
              sortField="sort_order"
              readOnly
              columns={[
                { key: 'code',         label: 'Code',       editable: false },
                { key: 'display_name', label: 'Label',      editable: false },
                { key: 'sort_order',   label: 'Order',      editable: false },
                { key: 'is_terminal',  label: 'Terminal',   type: 'boolean', editable: false },
              ]}
            />
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, description, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}