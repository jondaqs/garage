// src/app/admin/settings/page.js
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, Plus, Save, Trash2, X, CheckCircle, AlertCircle,
  Loader2, ToggleLeft, ToggleRight, Store, Wrench, DollarSign,
  Calendar, ClipboardList, ChevronDown, ChevronRight, CreditCard, Smartphone,
  Upload, Key, RefreshCw, Wifi, Eye, EyeOff, Copy, Shield,
  MessageSquare, Send, Phone,
} from 'lucide-react'

const TABS = [
  { id: 'provider_types', label: 'Provider Types',     icon: Store },
  { id: 'services',       label: 'Services Catalog',   icon: Wrench },
  { id: 'currencies',     label: 'Currencies',         icon: DollarSign },
  { id: 'booking_types',  label: 'Booking Types',      icon: Calendar },
  { id: 'statuses',       label: 'Status Codes',       icon: ClipboardList },
  { id: 'payment_accounts', label: 'Payment Accounts', icon: CreditCard },
  { id: 'mpesa_setup',    label: 'M-Pesa Setup',       icon: Smartphone },
  { id: 'sms_setup',      label: 'SMS Setup',           icon: MessageSquare },
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

      <div className="overflow-x-auto rounded-xl border border-gray-200">
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
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage platform lookup data and configuration</p>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit min-w-full">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                <Icon size={14} /> <span className="hidden sm:inline">{t.label}</span>
              </button>
            )
          })}
        </div>
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

      {/* ── SMS Setup ── */}
      {tab === 'sms_setup' && (
        <SmsSetupEditor />
      )}
    </div>
  )
}

function MpesaSetupEditor() {
  const [environment, setEnvironment] = useState('sandbox')
  const [envStatus, setEnvStatus]     = useState({})
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [msg, setMsg]                 = useState({ type: '', text: '' })
  const [updatedAt, setUpdatedAt]     = useState(null)

  // UI-only fields — prefilled from env, editable for testing, NOT saved to DB
  const [consumerKey, setConsumerKey]       = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [shortcode, setShortcode]           = useState('')
  const [passkey, setPasskey]               = useState('')
  const [initiatorName, setInitiatorName]   = useState('')

  // Cert status + upload
  const [sandboxCertUploaded, setSandboxCertUploaded]     = useState(false)
  const [productionCertUploaded, setProductionCertUploaded] = useState(false)
  const [pendingCerts, setPendingCerts] = useState({ sandbox_cert: null, production_cert: null })

  // Generate
  const [showSecrets, setShowSecrets]         = useState({})
  const [generating, setGenerating]           = useState('')
  const [generatedSecret, setGeneratedSecret] = useState('')
  const [generatedCredential, setGeneratedCredential] = useState('')
  const [initiatorPassword, setInitiatorPassword]     = useState('')
  const [testing, setTesting]                         = useState(false)

  useEffect(() => {
    fetch('/api/admin/mpesa-config')
      .then(r => r.json())
      .then(data => {
        if (data.environment) setEnvironment(data.environment)
        if (data.env)         setEnvStatus(data.env)
        if (data.config) {
          setConsumerKey(data.config.consumer_key || '')
          setShortcode(data.config.shortcode || '')
          setInitiatorName(data.config.initiator_name || '')
        }
        setSandboxCertUploaded(data.sandbox_cert_uploaded || false)
        setProductionCertUploaded(data.production_cert_uploaded || false)
        if (data.updated_at) setUpdatedAt(data.updated_at)
      })
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (key) => setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }))
  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 5000) }

  const save = async () => {
    setSaving(true); setMsg({ type: '', text: '' })
    try {
      const config = { environment }
      // Include pending certs if uploaded
      if (pendingCerts.sandbox_cert) config.sandbox_cert = pendingCerts.sandbox_cert
      if (pendingCerts.production_cert) config.production_cert = pendingCerts.production_cert

      const res = await fetch('/api/admin/mpesa-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', config }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (pendingCerts.sandbox_cert) setSandboxCertUploaded(true)
      if (pendingCerts.production_cert) setProductionCertUploaded(true)
      setPendingCerts({ sandbox_cert: null, production_cert: null })
      flash('success', data.message)
    } catch (e) { flash('error', e.message) }
    finally { setSaving(false) }
  }

  const testConnection = async () => {
    setTesting(true); setMsg({ type: '', text: '' })
    try {
      const res = await fetch('/api/admin/mpesa-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_connection',
          overrides: { consumer_key: consumerKey, consumer_secret: consumerSecret, environment },
        }),
      })
      const data = await res.json()
      flash(data.success ? 'success' : 'error', data.message || data.error)
    } catch (e) { flash('error', e.message) }
    finally { setTesting(false) }
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
      setGeneratedSecret(data.callback_secret)
      flash('success', data.message)
    } catch (e) { flash('error', e.message) }
    finally { setGenerating('') }
  }

  const generateCredential = async () => {
    if (!initiatorPassword.trim()) { flash('error', 'Enter the initiator password'); return }
    setGenerating('credential')
    try {
      const res = await fetch('/api/admin/mpesa-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_credential',
          password: initiatorPassword,
          environment,
          cert: pendingCerts[environment === 'production' ? 'production_cert' : 'sandbox_cert'] || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGeneratedCredential(data.security_credential)
      setInitiatorPassword('')
      flash('success', data.message)
    } catch (e) { flash('error', e.message) }
    finally { setGenerating('') }
  }

  const handleCertUpload = (env) => (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      setPendingCerts(prev => ({ ...prev, [env === 'sandbox' ? 'sandbox_cert' : 'production_cert']: evt.target.result }))
      flash('success', `${env} certificate loaded. Click Save to persist.`)
    }
    reader.readAsText(file)
  }

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text)
    flash('success', `${label} copied to clipboard`)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

  const EnvBadge = ({ envKey }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
      envStatus[envKey] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {envStatus[envKey] ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
      {envKey}: {envStatus[envKey] ? (typeof envStatus[envKey] === 'string' ? envStatus[envKey] : 'Set') : 'Missing'}
    </span>
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

      {/* Environment — saved to DB */}
      <Section title="Environment" description="This and certificates below are the only settings saved to the database. All credentials must be in Vercel env vars.">
        <div className="flex gap-3">
          {['sandbox', 'production'].map(env => (
            <button key={env} onClick={() => setEnvironment(env)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                environment === env
                  ? env === 'production' ? 'bg-red-600 text-white border-red-600' : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}>
              {env === 'sandbox' ? '🧪 Sandbox' : '🔴 Production'}
            </button>
          ))}
        </div>
        {environment === 'production' && (
          <p className="text-xs text-red-600 mt-2 font-medium">Production mode — real money will be processed.</p>
        )}
      </Section>

      {/* Env var status + credential fields (prefilled, not saved) */}
      <Section title="Daraja API Credentials" description="Prefilled from Vercel env vars. You can override for testing — changes are not saved to the database.">
        <div className="flex flex-wrap gap-2 mb-3">
          <EnvBadge envKey="MPESA_CONSUMER_KEY" />
          <EnvBadge envKey="MPESA_CONSUMER_SECRET" />
          <EnvBadge envKey="MPESA_SHORTCODE" />
          <EnvBadge envKey="MPESA_PASSKEY" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Consumer Key</label>
            <input className={inp} value={consumerKey} onChange={e => setConsumerKey(e.target.value)} placeholder="From Safaricom Developer Portal" />
            <p className="text-[10px] text-gray-400 mt-1">Env: MPESA_CONSUMER_KEY</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Consumer Secret</label>
            <div className="flex gap-1">
              <input type={showSecrets.cs ? 'text' : 'password'} className={inp + ' flex-1'}
                value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} placeholder="For testing only — not saved" />
              <button onClick={() => toggle('cs')} className="px-2 text-gray-400 hover:text-gray-600">
                {showSecrets.cs ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Env: MPESA_CONSUMER_SECRET</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Shortcode (Paybill Number)</label>
            <input className={inp} value={shortcode} onChange={e => setShortcode(e.target.value)} placeholder="e.g. 174379" />
            <p className="text-[10px] text-gray-400 mt-1">Env: MPESA_SHORTCODE</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Passkey (for STK Push)</label>
            <div className="flex gap-1">
              <input type={showSecrets.pk ? 'text' : 'password'} className={inp + ' flex-1'}
                value={passkey} onChange={e => setPasskey(e.target.value)} placeholder="For testing only — not saved" />
              <button onClick={() => toggle('pk')} className="px-2 text-gray-400 hover:text-gray-600">
                {showSecrets.pk ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Env: MPESA_PASSKEY</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button onClick={testConnection} disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
            Test Connection
          </button>
          <p className="text-[10px] text-gray-400">Tests OAuth token generation against {environment} API</p>
        </div>
      </Section>

      {/* Callback Secret — generate only, never saved to DB */}
      <Section title="Callback Secret" description="Generate a random secret for signing STK Push callback URLs. Copy to Vercel env vars.">
        <div className="flex flex-wrap gap-2 mb-3">
          <EnvBadge envKey="MPESA_CALLBACK_SECRET" />
        </div>
        <div className="flex items-end gap-3">
          <button onClick={generateSecret} disabled={generating === 'secret'}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex-shrink-0">
            {generating === 'secret' ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
            Generate New Secret
          </button>
        </div>
        {generatedSecret && (
          <div className="mt-3 bg-gray-900 rounded-lg p-3 flex items-center gap-2">
            <code className="text-xs font-mono text-green-400 flex-1 break-all">{generatedSecret}</code>
            <button onClick={() => copyToClipboard(generatedSecret, 'Callback secret')}
              className="px-2 py-1 text-gray-400 hover:text-white flex-shrink-0"><Copy size={14} /></button>
          </div>
        )}
        <p className="text-[10px] text-amber-600 mt-2">Copy this value to Vercel env vars as MPESA_CALLBACK_SECRET, then redeploy.</p>
      </Section>

      {/* Certificates — saved to DB (public keys, not secrets) */}
      <Section title="API Certificates" description="Safaricom public key certificates for encrypting the security credential. These are saved to the database (they are public keys, not secrets).">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">🧪 Sandbox Certificate</span>
              {pendingCerts.sandbox_cert ? (
                <span className="text-xs text-blue-600 font-medium flex items-center gap-1"><AlertCircle size={12} /> Loaded (unsaved)</span>
              ) : sandboxCertUploaded ? (
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
              {pendingCerts.production_cert ? (
                <span className="text-xs text-blue-600 font-medium flex items-center gap-1"><AlertCircle size={12} /> Loaded (unsaved)</span>
              ) : productionCertUploaded ? (
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

      {/* Security Credential — generate only */}
      <Section title="Security Credential" description="Encrypts the initiator password with Safaricom's certificate. Copy result to Vercel env vars.">
        <div className="flex flex-wrap gap-2 mb-3">
          <EnvBadge envKey="MPESA_INITIATOR_NAME" />
          <EnvBadge envKey="MPESA_SECURITY_CREDENTIAL" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Initiator Name</label>
            <input className={inp} value={initiatorName} onChange={e => setInitiatorName(e.target.value)} placeholder="e.g. testapi" />
            <p className="text-[10px] text-gray-400 mt-1">Env: MPESA_INITIATOR_NAME</p>
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
            <p className="text-[10px] text-gray-400 mt-1">Used to generate the credential — never stored anywhere.</p>
          </div>
        </div>
        <div className="mt-3">
          <button onClick={generateCredential} disabled={generating === 'credential' || !initiatorPassword}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {generating === 'credential' ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            Generate Credential
          </button>
        </div>
        {generatedCredential && (
          <div className="mt-3 bg-gray-900 rounded-lg p-3 flex items-center gap-2">
            <code className="text-xs font-mono text-green-400 flex-1 break-all">{generatedCredential.substring(0, 60)}...</code>
            <button onClick={() => copyToClipboard(generatedCredential, 'Security credential')}
              className="px-2 py-1 text-gray-400 hover:text-white flex-shrink-0"><Copy size={14} /></button>
          </div>
        )}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3">
          <p className="text-xs text-blue-700">
            <strong>How it works:</strong> Your initiator password is encrypted using the {environment} certificate
            and converted to base64. The password is never stored. Copy the generated credential to Vercel as MPESA_SECURITY_CREDENTIAL.
          </p>
        </div>
      </Section>

      {/* Env vars reference */}
      <Section title="Required Environment Variables" description="Set these in Vercel → Settings → Environment Variables. Redeploy after any change.">
        <div className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-green-400 space-y-1 overflow-x-auto">
          <p>MPESA_ENV=<span className="text-gray-500">{environment}</span></p>
          <p>MPESA_CONSUMER_KEY=<span className="text-gray-500">{consumerKey || 'your_consumer_key'}</span></p>
          <p>MPESA_CONSUMER_SECRET=<span className="text-gray-500">your_consumer_secret</span></p>
          <p>MPESA_SHORTCODE=<span className="text-gray-500">{shortcode || '174379'}</span></p>
          <p>MPESA_PASSKEY=<span className="text-gray-500">your_passkey</span></p>
          <p>MPESA_CALLBACK_SECRET=<span className="text-gray-500">{generatedSecret || 'your_callback_secret'}</span></p>
          {initiatorName && <p>MPESA_INITIATOR_NAME=<span className="text-gray-500">{initiatorName}</span></p>}
          {generatedCredential && <p>MPESA_SECURITY_CREDENTIAL=<span className="text-gray-500">{generatedCredential.substring(0, 30)}...</span></p>}
        </div>
      </Section>

      {/* Save — only environment + certs */}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Environment & Certificates
        </button>
      </div>
    </div>
  )
}

function SmsSetupEditor() {
  const [activeProvider, setActiveProvider] = useState('none')
  const [envStatus, setEnvStatus]          = useState({})
  const [loading, setLoading]              = useState(true)
  const [saving, setSaving]                = useState(false)
  const [msg, setMsg]                      = useState({ type: '', text: '' })
  const [updatedAt, setUpdatedAt]          = useState(null)

  // UI-only fields — prefilled from env, editable for testing, never saved to DB
  const [at, setAt]       = useState({ username: '', sender_id: '', sandbox: false })
  const [celcom, setCelcom] = useState({ partner_id: '', sender_id: '' })

  // Test SMS
  const [testPhone, setTestPhone]   = useState('')
  const [testing, setTesting]       = useState(false)
  const [testSteps, setTestSteps]   = useState([])

  // Balance
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceInfo, setBalanceInfo]       = useState(null)

  useEffect(() => {
    fetch('/api/admin/sms-config')
      .then(r => r.json())
      .then(data => {
        if (data.active_provider) setActiveProvider(data.active_provider)
        if (data.africastalking)  setAt(prev => ({ ...prev, ...data.africastalking }))
        if (data.celcom)          setCelcom(prev => ({ ...prev, ...data.celcom }))
        if (data.env)             setEnvStatus(data.env)
        if (data.updated_at)      setUpdatedAt(data.updated_at)
      })
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false))
  }, [])

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 5000) }

  const save = async () => {
    setSaving(true); setMsg({ type: '', text: '' })
    try {
      const res = await fetch('/api/admin/sms-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', active_provider: activeProvider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      flash('success', data.message)
    } catch (e) { flash('error', e.message) }
    finally { setSaving(false) }
  }

  const sendTest = async () => {
    if (!testPhone.trim()) { flash('error', 'Enter a phone number'); return }
    setTesting(true); setTestSteps([]); setMsg({ type: '', text: '' })
    try {
      // Send current UI field values as overrides — not saved, just used for this test
      const overrides = activeProvider === 'africastalking'
        ? { username: at.username, sender_id: at.sender_id, sandbox: at.sandbox }
        : { partner_id: celcom.partner_id, sender_id: celcom.sender_id }

      const res = await fetch('/api/admin/sms-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_sms', phone: testPhone.trim(), provider: activeProvider, overrides }),
      })
      const data = await res.json()
      setTestSteps(data.steps || [])
      flash(data.success ? 'success' : 'error', data.success ? 'Test SMS sent successfully!' : (data.error || 'Test failed — see steps below'))
    } catch (e) { flash('error', e.message) }
    finally { setTesting(false) }
  }

  const checkBalance = async () => {
    setBalanceLoading(true); setBalanceInfo(null)
    try {
      const res = await fetch('/api/admin/sms-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_balance', partner_id: celcom.partner_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBalanceInfo(data.balance)
    } catch (e) { flash('error', e.message) }
    finally { setBalanceLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

  const EnvBadge = ({ envKey }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
      envStatus[envKey] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {envStatus[envKey] ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
      {envKey}: {envStatus[envKey] ? 'Set' : 'Missing'}
    </span>
  )

  return (
    <div className="space-y-6">
      {msg.text && (
        <div className={`p-3 rounded-lg flex items-start gap-2 text-sm ${
          msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
          <p>{msg.text}</p>
        </div>
      )}

      {updatedAt && (
        <p className="text-[10px] text-gray-400">Last updated: {new Date(updatedAt).toLocaleString('en-KE')}</p>
      )}

      {/* ── Active Provider (this is what gets saved) ── */}
      <Section title="Active SMS Provider" description="This is the only setting saved to the database. All credentials must be set in Vercel environment variables.">
        <div className="flex gap-3 flex-wrap">
          {[
            { id: 'africastalking', label: "Africa's Talking", cost: '~KES 0.80/SMS', activeClass: 'bg-blue-50 border-blue-500 text-blue-700' },
            { id: 'celcom',         label: 'Celcom Africa',    cost: '~KES 0.25/SMS', activeClass: 'bg-emerald-50 border-emerald-500 text-emerald-700' },
            { id: 'none',           label: 'Disabled',         cost: 'No SMS sent',   activeClass: 'bg-gray-100 border-gray-400 text-gray-700' },
          ].map(p => (
            <button key={p.id} onClick={() => setActiveProvider(p.id)}
              className={`flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-medium border-2 transition-all text-left ${
                activeProvider === p.id ? p.activeClass : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
              }`}>
              <div className="font-semibold">{p.label}</div>
              <div className="text-[10px] mt-0.5 opacity-75">{p.cost}</div>
            </button>
          ))}
        </div>
        {activeProvider === 'none' && (
          <p className="text-xs text-amber-600 mt-2 font-medium">SMS is disabled — no notifications will be sent via SMS.</p>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Provider Choice
          </button>
        </div>
      </Section>

      {/* ── Africa's Talking ── */}
      {activeProvider === 'africastalking' && (
        <Section title="Africa's Talking" description="Fields below are prefilled from Vercel env vars. You can override them here for testing — changes are not saved.">
          <div className="flex flex-wrap gap-2 mb-3">
            <EnvBadge envKey="AT_API_KEY" />
            <EnvBadge envKey="AT_USERNAME" />
          </div>
          {!envStatus.AT_API_KEY && (
            <p className="text-xs text-red-600 mb-3">Set <code className="bg-gray-100 px-1 rounded text-[11px]">AT_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Username</label>
              <input className={inp} value={at.username} onChange={e => setAt(p => ({ ...p, username: e.target.value }))}
                placeholder="e.g. your_app_name (from AT dashboard)" />
              <p className="text-[10px] text-gray-400 mt-1">Env: AT_USERNAME</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Sender ID (optional)</label>
              <input className={inp} value={at.sender_id} onChange={e => setAt(p => ({ ...p, sender_id: e.target.value }))}
                placeholder="e.g. MOTIIFIX (requires AT approval)" />
              <p className="text-[10px] text-gray-400 mt-1">Env: AT_SENDER_ID · Leave blank to use default</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Mode</label>
              <div className="flex gap-2 mt-1">
                {[false, true].map(sb => (
                  <button key={String(sb)} onClick={() => setAt(p => ({ ...p, sandbox: sb }))}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      at.sandbox === sb
                        ? sb ? 'bg-blue-600 text-white border-blue-600' : 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}>
                    {sb ? '🧪 Sandbox' : '🔴 Production'}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Env: AT_SANDBOX={at.sandbox ? 'true' : 'false'}</p>
              {!at.sandbox && (
                <p className="text-[10px] text-red-600 mt-0.5 font-medium">Production — real SMS will be sent and charged.</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Celcom Africa ── */}
      {activeProvider === 'celcom' && (
        <Section title="Celcom Africa" description="Fields below are prefilled from Vercel env vars. You can override them here for testing — changes are not saved.">
          <div className="flex flex-wrap gap-2 mb-3">
            <EnvBadge envKey="CELCOM_API_KEY" />
            <EnvBadge envKey="CELCOM_PARTNER_ID" />
          </div>
          {!envStatus.CELCOM_API_KEY && (
            <p className="text-xs text-red-600 mb-3">Set <code className="bg-gray-100 px-1 rounded text-[11px]">CELCOM_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Partner ID</label>
              <input className={inp} value={celcom.partner_id} onChange={e => setCelcom(p => ({ ...p, partner_id: e.target.value }))}
                placeholder="Your Celcom partner ID" />
              <p className="text-[10px] text-gray-400 mt-1">Env: CELCOM_PARTNER_ID</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Sender ID / Shortcode</label>
              <input className={inp} value={celcom.sender_id} onChange={e => setCelcom(p => ({ ...p, sender_id: e.target.value }))}
                placeholder="e.g. MOTIIFIX or leave blank" />
              <p className="text-[10px] text-gray-400 mt-1">Env: CELCOM_SENDER_ID · ~KES 6,500/network to register</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button onClick={checkBalance} disabled={balanceLoading || !envStatus.CELCOM_API_KEY}
              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50 border border-gray-200">
              {balanceLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Check Balance
            </button>
            {balanceInfo && (
              <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">{JSON.stringify(balanceInfo)}</span>
            )}
          </div>
        </Section>
      )}

      {/* ── Required Env Vars ── */}
      {activeProvider !== 'none' && (
        <Section title="Required Environment Variables" description="Set these in Vercel → Settings → Environment Variables. Redeploy after any change.">
          <div className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-green-400 space-y-1 overflow-x-auto">
            {activeProvider === 'africastalking' && (
              <>
                <p>AT_API_KEY=<span className="text-gray-500">your_api_key_here</span></p>
                <p>AT_USERNAME=<span className="text-gray-500">{at.username || 'your_app_name'}</span></p>
                <p>AT_SANDBOX=<span className="text-gray-500">{at.sandbox ? 'true' : 'false'}</span></p>
                {at.sender_id && <p>AT_SENDER_ID=<span className="text-gray-500">{at.sender_id}</span></p>}
              </>
            )}
            {activeProvider === 'celcom' && (
              <>
                <p>CELCOM_API_KEY=<span className="text-gray-500">your_api_key_here</span></p>
                <p>CELCOM_PARTNER_ID=<span className="text-gray-500">{celcom.partner_id || 'your_partner_id'}</span></p>
                {celcom.sender_id && <p>CELCOM_SENDER_ID=<span className="text-gray-500">{celcom.sender_id}</span></p>}
              </>
            )}
          </div>
        </Section>
      )}

      {/* ── Test SMS ── */}
      {activeProvider !== 'none' && (
        <Section title="Test SMS" description="Sends a test using the field values above (overrides env vars for this test only — not saved).">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Phone Number</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className={inp + ' pl-8'} value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  placeholder="e.g. 0712345678" onKeyDown={e => e.key === 'Enter' && sendTest()} />
              </div>
            </div>
            <button onClick={sendTest} disabled={testing || !testPhone.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send Test
            </button>
          </div>

          {testSteps.length > 0 && (
            <div className="mt-4 space-y-1">
              {testSteps.map((s, i) => (
                <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                  s.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {s.ok ? <CheckCircle size={14} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                  <div>
                    <span className="font-semibold">{s.step}:</span>{' '}
                    <span className="break-all">{s.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
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
                <input className={inp} value={data.mpesa?.business_name || ''} onChange={e => update('mpesa', 'business_name', e.target.value)} placeholder="e.g. Carfix-Connect Ltd" />
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
                  <input className={inp} value={data.bank?.account_name || ''} onChange={e => update('bank', 'account_name', e.target.value)} placeholder="e.g. Carfix-Connect Ltd" />
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}