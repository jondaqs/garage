// src/app/admin/settings/page.js
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, Plus, Save, Trash2, X, CheckCircle, AlertCircle,
  Loader2, ToggleLeft, ToggleRight, Store, Wrench, DollarSign,
  Calendar, ClipboardList, ChevronDown, ChevronRight, CreditCard, Smartphone,
  Upload, Key, RefreshCw, Wifi, Eye, EyeOff, Copy, Shield,
} from 'lucide-react'

const TABS = [
  { id: 'provider_types', label: 'Provider Types',     icon: Store },
  { id: 'services',       label: 'Services Catalog',   icon: Wrench },
  { id: 'currencies',     label: 'Currencies',         icon: DollarSign },
  { id: 'booking_types',  label: 'Booking Types',      icon: Calendar },
  { id: 'statuses',       label: 'Status Codes',       icon: ClipboardList },
  { id: 'payment_accounts', label: 'Payment Accounts', icon: CreditCard },
  { id: 'mpesa_setup',    label: 'M-Pesa Setup',       icon: Smartphone },
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

      {/* ── Payment Accounts ── */}
      {tab === 'payment_accounts' && (
        <PaymentAccountsEditor supabase={supabase} />
      )}

      {/* ── M-Pesa Setup ── */}
      {tab === 'mpesa_setup' && (
        <MpesaSetupEditor />
      )}
    </div>
  )
}

function MpesaSetupEditor() {
  const [config, setConfig] = useState({
    environment: 'sandbox', consumer_key: '', consumer_secret: '',
    shortcode: '', passkey: '', initiator_name: '',
    callback_secret: '', security_credential: '',
    sandbox_cert: '', production_cert: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [showSecrets, setShowSecrets] = useState({})
  const [initiatorPassword, setInitiatorPassword] = useState('')
  const [generating, setGenerating] = useState('')
  const [testing, setTesting] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    fetch('/api/admin/mpesa-config')
      .then(r => r.json())
      .then(data => {
        if (data.config) setConfig(prev => ({ ...prev, ...data.config }))
        if (data.updated_at) setUpdatedAt(data.updated_at)
      })
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false))
  }, [])

  const update = (key, val) => setConfig(prev => ({ ...prev, [key]: val }))
  const toggle = (key) => setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }))

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text)
    setMsg({ type: 'success', text: `${label} copied to clipboard` })
    setTimeout(() => setMsg({ type: '', text: '' }), 2000)
  }

  const save = async () => {
    setSaving(true); setMsg({ type: '', text: '' })
    try {
      const res = await fetch('/api/admin/mpesa-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', config }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ type: 'success', text: data.message })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setSaving(false) }
  }

  const generateSecret = async () => {
    setGenerating('secret')
    try {
      const res = await fetch('/api/admin/mpesa-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_secret' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update('callback_secret', data.callback_secret)
      setMsg({ type: 'success', text: data.message })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setGenerating('') }
  }

  const generateCredential = async () => {
    if (!initiatorPassword.trim()) { setMsg({ type: 'error', text: 'Enter the initiator password' }); return }
    setGenerating('credential')
    try {
      const res = await fetch('/api/admin/mpesa-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_credential',
          password: initiatorPassword,
          initiator_name: config.initiator_name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update('security_credential', data.security_credential)
      setInitiatorPassword('')
      setMsg({ type: 'success', text: data.message })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setGenerating('') }
  }

  const testConnection = async () => {
    setTesting(true); setMsg({ type: '', text: '' })
    try {
      const res = await fetch('/api/admin/mpesa-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_connection' }),
      })
      const data = await res.json()
      setMsg({ type: data.success ? 'success' : 'error', text: data.message || data.error })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setTesting(false) }
  }

  const handleCertUpload = (env) => (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      update(env === 'sandbox' ? 'sandbox_cert' : 'production_cert', text)
      setMsg({ type: 'success', text: `${env} certificate loaded. Click Save to persist.` })
    }
    reader.readAsText(file)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

  const SecretField = ({ label, field, placeholder }) => (
    <div>
      <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
      <div className="flex gap-1">
        <input type={showSecrets[field] ? 'text' : 'password'} className={inp + ' flex-1'}
          value={config[field] || ''} onChange={e => update(field, e.target.value)} placeholder={placeholder} />
        <button onClick={() => toggle(field)} className="px-2 text-gray-400 hover:text-gray-600"
          title={showSecrets[field] ? 'Hide' : 'Show'}>
          {showSecrets[field] ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {config[field] && !config[field].startsWith('••••') && (
          <button onClick={() => copyToClipboard(config[field], label)} className="px-2 text-gray-400 hover:text-gray-600" title="Copy">
            <Copy size={16} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {msg.text && (
        <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.type === 'success' ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
          <p>{msg.text}</p>
        </div>
      )}

      {updatedAt && (
        <p className="text-[10px] text-gray-400">Last updated: {new Date(updatedAt).toLocaleString('en-KE')}</p>
      )}

      {/* Environment */}
      <Section title="Environment" description="Select sandbox for testing or production for live payments.">
        <div className="flex gap-3">
          {['sandbox', 'production'].map(env => (
            <button key={env} onClick={() => update('environment', env)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                config.environment === env
                  ? env === 'production' ? 'bg-red-600 text-white border-red-600' : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}>
              {env === 'sandbox' ? '🧪 Sandbox' : '🔴 Production'}
            </button>
          ))}
        </div>
        {config.environment === 'production' && (
          <p className="text-xs text-red-600 mt-2 font-medium">⚠ Production mode — real money will be processed.</p>
        )}
      </Section>

      {/* API Credentials */}
      <Section title="Daraja API Credentials" description="From your Safaricom Developer Portal app.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Consumer Key</label>
            <input className={inp} value={config.consumer_key || ''} onChange={e => update('consumer_key', e.target.value)} placeholder="e.g. Gx7Kq..." />
          </div>
          <SecretField label="Consumer Secret" field="consumer_secret" placeholder="e.g. Ab3Cd..." />
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Shortcode (Paybill Number)</label>
            <input className={inp} value={config.shortcode || ''} onChange={e => update('shortcode', e.target.value)} placeholder="e.g. 174379" />
          </div>
          <SecretField label="Passkey (for STK Push)" field="passkey" placeholder="Lipa Na M-Pesa passkey" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={testConnection} disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
            Test Connection
          </button>
          <p className="text-[10px] text-gray-400">Tests OAuth token generation against {config.environment} API</p>
        </div>
      </Section>

      {/* Callback Secret */}
      <Section title="Callback Secret" description="Random secret used to sign STK Push callback URLs. Prevents spoofed callbacks.">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <SecretField label="MPESA_CALLBACK_SECRET" field="callback_secret" placeholder="Click Generate to create" />
          </div>
          <button onClick={generateSecret} disabled={generating === 'secret'}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex-shrink-0">
            {generating === 'secret' ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
            Generate
          </button>
        </div>
        <p className="text-[10px] text-amber-600 mt-2">After generating, copy this value to your Vercel environment variables as MPESA_CALLBACK_SECRET.</p>
      </Section>

      {/* Certificates */}
      <Section title="API Certificates" description="Public key certificates from Safaricom for encrypting the security credential.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">🧪 Sandbox Certificate</span>
              {config.sandbox_cert && config.sandbox_cert !== 'Uploaded' ? (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Loaded</span>
              ) : config.sandbox_cert === 'Uploaded' ? (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Saved</span>
              ) : (
                <span className="text-xs text-gray-400">Not uploaded</span>
              )}
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
              <Upload size={14} /> Upload SandboxCertificate.cer
              <input type="file" accept=".cer,.pem,.crt" className="hidden" onChange={handleCertUpload('sandbox')} />
            </label>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">🔴 Production Certificate</span>
              {config.production_cert && config.production_cert !== 'Uploaded' ? (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Loaded</span>
              ) : config.production_cert === 'Uploaded' ? (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Saved</span>
              ) : (
                <span className="text-xs text-gray-400">Not uploaded</span>
              )}
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
              <Upload size={14} /> Upload ProductionCertificate.cer
              <input type="file" accept=".cer,.pem,.crt" className="hidden" onChange={handleCertUpload('production')} />
            </label>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Download from{' '}
          <a href="https://developer.safaricom.co.ke" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
            developer.safaricom.co.ke/certificates
          </a>
        </p>
      </Section>

      {/* Security Credential */}
      <Section title="Security Credential" description="Encrypts the initiator password with Safaricom's certificate. Required for Transaction Status Query and Reversals.">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Initiator Name</label>
              <input className={inp} value={config.initiator_name || ''} onChange={e => update('initiator_name', e.target.value)} placeholder="e.g. testapi" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Initiator Password</label>
              <div className="flex gap-1">
                <input type={showSecrets.init_pass ? 'text' : 'password'} className={inp + ' flex-1'}
                  value={initiatorPassword} onChange={e => setInitiatorPassword(e.target.value)}
                  placeholder="Enter password to encrypt" />
                <button onClick={() => toggle('init_pass')} className="px-2 text-gray-400 hover:text-gray-600">
                  {showSecrets.init_pass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Password is used to generate the credential, never stored.</p>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <SecretField label="Generated Security Credential" field="security_credential" placeholder="Click Generate after entering password" />
            </div>
            <button onClick={generateCredential} disabled={generating === 'credential' || !initiatorPassword}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex-shrink-0">
              {generating === 'credential' ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              Generate Credential
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              <strong>How it works:</strong> Your initiator password is encrypted using the {config.environment} certificate
              and converted to base64. The password is NOT stored — only the encrypted credential is saved.
              Add the credential to Vercel as MPESA_SECURITY_CREDENTIAL.
            </p>
          </div>
        </div>
      </Section>

      {/* Env vars reminder */}
      <Section title="Environment Variables" description="Copy these values to your Vercel project settings.">
        <div className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-green-400 space-y-1 overflow-x-auto">
          <p>MPESA_ENV={config.environment}</p>
          <p>MPESA_CONSUMER_KEY={config.consumer_key || '...'}</p>
          <p>MPESA_CONSUMER_SECRET={config.consumer_secret?.startsWith('••••') ? '...' : config.consumer_secret || '...'}</p>
          <p>MPESA_SHORTCODE={config.shortcode || '...'}</p>
          <p>MPESA_PASSKEY={config.passkey?.startsWith('••••') ? '...' : config.passkey || '...'}</p>
          <p>MPESA_CALLBACK_SECRET={config.callback_secret?.startsWith('••••') ? '...' : config.callback_secret || '...'}</p>
          {config.initiator_name && <p>MPESA_INITIATOR_NAME={config.initiator_name}</p>}
          {config.security_credential && !config.security_credential.startsWith('••••') && (
            <p>MPESA_SECURITY_CREDENTIAL={config.security_credential.substring(0, 30)}...</p>
          )}
        </div>
      </Section>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save M-Pesa Configuration
        </button>
      </div>
    </div>
  )
}

function PaymentAccountsEditor({ supabase }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState({ type: '', text: '' })

  useEffect(() => {
    const load = async () => {
      const { data: row } = await supabase
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'payment_accounts')
        .single()
      setData(row?.setting_value || {
        mpesa: { enabled: true, paybill_number: '', account_number: '', business_name: '', instructions: '' },
        mpesa_stk: { enabled: true, instructions: '' },
        bank:  { enabled: true, show_details: false, instructions: 'Bank transfer details will be shared individually.' },
        card:  { enabled: false, service_fee_pct: 3.5, instructions: '' },
        cash:  { enabled: true, instructions: 'Cash payments can be made at our offices.' },
      })
      setLoading(false)
    }
    load()
  }, [supabase])

  const update = (method, field, value) => {
    setData(prev => ({ ...prev, [method]: { ...prev[method], [field]: value } }))
  }

  const save = async () => {
    setSaving(true); setMsg({ type: '', text: '' })
    try {
      const { error } = await supabase
        .from('platform_settings')
        .update({ setting_value: data, updated_at: new Date().toISOString() })
        .eq('setting_key', 'payment_accounts')
      if (error) throw error
      setMsg({ type: 'success', text: 'Payment accounts saved.' })
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

  return (
    <div className="space-y-6">
      {msg.text && (
        <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* M-Pesa */}
      <Section title="M-Pesa (Manual Paybill)" description="Paybill details shown to users when recording a manual M-Pesa payment. Requires admin confirmation.">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => update('mpesa', 'enabled', !data.mpesa?.enabled)}
              className="text-gray-500">{data.mpesa?.enabled ? <ToggleRight size={28} className="text-green-600" /> : <ToggleLeft size={28} />}
            </button>
            <span className="text-sm font-medium text-gray-700">{data.mpesa?.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {data.mpesa?.enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Business Name</label>
                <input className={inp} value={data.mpesa?.business_name || ''} onChange={e => update('mpesa', 'business_name', e.target.value)} placeholder="e.g. GariCare Ltd" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Paybill Number</label>
                <input className={inp} value={data.mpesa?.paybill_number || ''} onChange={e => update('mpesa', 'paybill_number', e.target.value)} placeholder="e.g. 123456" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Account Number</label>
                <input className={inp} value={data.mpesa?.account_number || ''} onChange={e => update('mpesa', 'account_number', e.target.value)} placeholder="e.g. GC-INV-001" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Instructions to User</label>
                <input className={inp} value={data.mpesa?.instructions || ''} onChange={e => update('mpesa', 'instructions', e.target.value)} placeholder="Send payment to the Paybill..." />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* M-Pesa STK Push */}
      <Section title="M-Pesa STK Push (Instant)" description="Sends a payment prompt directly to the user's phone. Payment is verified automatically by Safaricom — no admin confirmation needed. Requires M-Pesa Setup to be configured.">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => update('mpesa_stk', 'enabled', !data.mpesa_stk?.enabled)}
              className="text-gray-500">{data.mpesa_stk?.enabled ? <ToggleRight size={28} className="text-green-600" /> : <ToggleLeft size={28} />}
            </button>
            <span className="text-sm font-medium text-gray-700">{data.mpesa_stk?.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {data.mpesa_stk?.enabled && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-xs text-green-700 space-y-1">
                <p className="font-semibold">How it works:</p>
                <p>When a user clicks &ldquo;Pay with M-Pesa&rdquo;, an STK push is sent to their phone. They enter their PIN, and the payment is confirmed automatically. No receipt confirmation is needed.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Instructions (optional)</label>
                <input className={inp} value={data.mpesa_stk?.instructions || ''} onChange={e => update('mpesa_stk', 'instructions', e.target.value)} placeholder="Enter your Safaricom number to receive the payment prompt..." />
              </div>
              <p className="text-[10px] text-amber-600">Ensure M-Pesa Setup (API credentials, shortcode, passkey) is configured in the M-Pesa Setup tab for STK Push to work.</p>
            </div>
          )}
        </div>
      </Section>

      {/* Bank */}
      <Section title="Bank Transfer" description="Bank account details for direct bank transfers.">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => update('bank', 'enabled', !data.bank?.enabled)}
              className="text-gray-500">{data.bank?.enabled ? <ToggleRight size={28} className="text-green-600" /> : <ToggleLeft size={28} />}
            </button>
            <span className="text-sm font-medium text-gray-700">{data.bank?.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {data.bank?.enabled && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <button onClick={() => update('bank', 'show_details', !data.bank?.show_details)}
                  className="text-gray-500">{data.bank?.show_details ? <ToggleRight size={28} className="text-blue-600" /> : <ToggleLeft size={28} />}
                </button>
                <span className="text-sm text-gray-600">{data.bank?.show_details ? 'Show bank details to users' : 'Hide bank details — share individually'}</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Bank Name</label>
                  <input className={inp} value={data.bank?.bank_name || ''} onChange={e => update('bank', 'bank_name', e.target.value)} placeholder="e.g. Equity Bank" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Account Name</label>
                  <input className={inp} value={data.bank?.account_name || ''} onChange={e => update('bank', 'account_name', e.target.value)} placeholder="e.g. GariCare Ltd" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Account Number</label>
                  <input className={inp} value={data.bank?.account_number || ''} onChange={e => update('bank', 'account_number', e.target.value)} placeholder="e.g. 0123456789" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Branch</label>
                  <input className={inp} value={data.bank?.branch || ''} onChange={e => update('bank', 'branch', e.target.value)} placeholder="e.g. Westlands Branch" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Swift Code</label>
                  <input className={inp} value={data.bank?.swift_code || ''} onChange={e => update('bank', 'swift_code', e.target.value)} placeholder="e.g. EABORKE1XXX" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Instructions to User</label>
                <input className={inp} value={data.bank?.instructions || ''} onChange={e => update('bank', 'instructions', e.target.value)}
                  placeholder={data.bank?.show_details ? 'Transfer to the account above and use invoice number as reference.' : 'Bank transfer details will be shared individually...'} />
              </div>
              {!data.bank?.show_details && (
                <p className="text-[10px] text-amber-600">Bank details are stored but hidden from users. Only the instructions message is shown. Toggle above to display them.</p>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Cash */}
      <Section title="Cash" description="Instructions for cash payments.">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => update('cash', 'enabled', !data.cash?.enabled)}
              className="text-gray-500">{data.cash?.enabled ? <ToggleRight size={28} className="text-green-600" /> : <ToggleLeft size={28} />}
            </button>
            <span className="text-sm font-medium text-gray-700">{data.cash?.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {data.cash?.enabled && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Instructions</label>
              <input className={inp} value={data.cash?.instructions || ''} onChange={e => update('cash', 'instructions', e.target.value)} placeholder="Cash payments can be made at..." />
            </div>
          )}
        </div>
      </Section>

      {/* Card / Apple Pay (Paystack) */}
      <Section title="Card / Apple Pay (Paystack)" description="Card payment gateway powered by Paystack. Accepts Visa, Mastercard, Apple Pay, and M-Pesa GlobalPay virtual cards. API keys are configured via environment variables.">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => update('card', 'enabled', !data.card?.enabled)}
              className="text-gray-500">{data.card?.enabled ? <ToggleRight size={28} className="text-green-600" /> : <ToggleLeft size={28} />}
            </button>
            <span className="text-sm font-medium text-gray-700">{data.card?.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
          {data.card?.enabled && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Paystack integration:</p>
                <p>Card payments are processed through Paystack (by Stripe). API keys must be set as environment variables: <code className="bg-blue-100 px-1 rounded text-[10px]">PAYSTACK_SECRET_KEY</code> and <code className="bg-blue-100 px-1 rounded text-[10px]">NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY</code>.</p>
                <p>Set the webhook URL in your Paystack dashboard to: <code className="bg-blue-100 px-1 rounded text-[10px]">{'{your-domain}'}/api/payments/paystack/webhook</code></p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Service Fee (%)</label>
                  <input type="number" step="0.1" min="0" max="20" className={inp}
                    value={data.card?.service_fee_pct ?? 3.5}
                    onChange={e => update('card', 'service_fee_pct', parseFloat(e.target.value) || 0)}
                    placeholder="3.5" />
                  <p className="text-[10px] text-gray-400 mt-1">Added on top of the invoice amount. Set to at least 2.9% to cover Paystack fees (2.9% local, 3.8% international). Shown to the user before payment.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Instructions (optional)</label>
                  <input className={inp} value={data.card?.instructions || ''} onChange={e => update('card', 'instructions', e.target.value)}
                    placeholder="Pay securely with Visa, Mastercard, or Apple Pay..." />
                </div>
              </div>
              <p className="text-[10px] text-amber-600">Supported methods: Visa, Mastercard, Amex, Apple Pay, M-Pesa GlobalPay virtual Visa card.</p>
            </div>
          )}
        </div>
      </Section>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Payment Settings
        </button>
      </div>
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