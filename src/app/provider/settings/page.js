'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, User, Store, Lock, CheckCircle, AlertCircle,
  Loader2, Save, Eye, EyeOff, Clock, Info, Wrench
} from 'lucide-react'

const TABS = [
  { id: 'business', label: 'Business Profile', icon: Store  },
  { id: 'services', label: 'Services Offered',  icon: Wrench },
  { id: 'personal', label: 'My Profile',         icon: User  },
  { id: 'security', label: 'Security',            icon: Lock  },
]

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
const lbl = 'block text-xs font-medium text-gray-600 mb-1'

export default function ProviderSettingsPage() {
  const supabase = createClient()

  const [tab,        setTab]       = useState('business')
  const [loading,    setLoading]   = useState(true)
  const [saving,     setSaving]    = useState(false)
  const [error,      setError]     = useState('')
  const [success,    setSuccess]   = useState('')
  const [status,     setStatus]    = useState(null)
  const [providerId, setProviderId] = useState(null)

  // Reference data
  const [providerTypes,    setProviderTypes]    = useState([])
  const [allServices,      setAllServices]      = useState([])
  const [selectedServices, setSelectedServices] = useState(new Set())
  const [servicesSaving,   setServicesSaving]   = useState(false)

  const [business, setBusiness] = useState({
    name: '', email: '', phone: '', description: '',
    website: '', provider_type_id: '',
  })

  const [personal, setPersonal] = useState({
    first_name: '', last_name: '', phone: '', bio: '',
  })

  const [pw, setPw]             = useState({ current: '', newPw: '', confirm: '' })
  const [showPw, setShowPw]     = useState(false)
  const [pwError, setPwError]   = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile  } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, phone, bio')
        .eq('auth_user_id', user.id).single()

      if (profile) {
        setPersonal({
          first_name: profile.first_name || '',
          last_name:  profile.last_name  || '',
          phone:      profile.phone      || '',
          bio:        profile.bio        || '',
        })
      }

      // Load provider
      const { data: sp } = await supabase
        .from('service_providers')
        .select('id, name, email, phone, description, website, provider_type_id, status')
        .eq('owner_user_id', profile.id).single()

      if (sp) {
        setProviderId(sp.id)
        setStatus(sp.status)
        setBusiness({
          name:             sp.name             || '',
          email:            sp.email            || '',
          phone:            sp.phone            || '',
          description:      sp.description      || '',
          website:          sp.website          || '',
          provider_type_id: sp.provider_type_id || '',
        })

        // Load selected services for this provider
        const { data: sps } = await supabase
          .from('service_provider_services')
          .select('service_id')
          .eq('service_provider_id', sp.id)
        setSelectedServices(new Set((sps || []).map(s => s.service_id)))
      }

      // Load reference data
      const [{ data: types }, { data: services }] = await Promise.all([
        supabase.from('service_provider_types').select('id, code, display_name').order('display_name'),
        supabase.from('services').select('id, name, description').order('name'),
      ])
      setProviderTypes(types || [])
      setAllServices(services || [])

    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  // ── Save business profile ─────────────────────────────────────────────────
  const saveBusiness = async () => {
    if (!business.name.trim()) { setError('Business name is required'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const res  = await fetch('/api/provider/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ providerId, ...business }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save')
      setStatus('pending_verification')
      setSuccess(data.message)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  // ── Save services offered ────────────────────────────────────────────────
  const saveServices = async () => {
    setServicesSaving(true); setError(''); setSuccess('')
    try {
      // Delete all existing then insert selected (simpler than diffing)
      const { error: delErr } = await supabase
        .from('service_provider_services')
        .delete()
        .eq('service_provider_id', providerId)
      if (delErr) throw delErr

      if (selectedServices.size > 0) {
        const rows = [...selectedServices].map(serviceId => ({
          service_provider_id: providerId,
          service_id:          serviceId,
        }))
        const { error: insErr } = await supabase
          .from('service_provider_services')
          .insert(rows)
        if (insErr) throw insErr
      }

      setSuccess('Services updated successfully.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) { setError(err.message) }
    finally { setServicesSaving(false) }
  }

  const toggleService = (id) => {
    setSelectedServices(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Save personal profile ────────────────────────────────────────────────
  const savePersonal = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: err } = await supabase
        .from('user_profiles')
        .update({
          first_name: personal.first_name.trim() || null,
          last_name:  personal.last_name.trim()  || null,
          phone:      personal.phone.trim()      || null,
          bio:        personal.bio.trim()        || null,
          updated_at: new Date().toISOString(),
        })
        .eq('auth_user_id', user.id)
      if (err) throw err
      setSuccess('Personal profile updated.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  // ── Change password ───────────────────────────────────────────────────────
  const savePassword = async () => {
    setPwError('')
    if (!pw.current)             { setPwError('Enter your current password'); return }
    if (pw.newPw.length < 8)     { setPwError('New password must be at least 8 characters'); return }
    if (pw.newPw !== pw.confirm) { setPwError('New passwords do not match'); return }
    setPwSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: pw.current,
      })
      if (signInErr) throw new Error('Current password is incorrect')
      const { error: updErr } = await supabase.auth.updateUser({ password: pw.newPw })
      if (updErr) throw updErr
      setPw({ current: '', newPw: '', confirm: '' })
      setSuccess('Password changed successfully.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) { setPwError(err.message) }
    finally { setPwSaving(false) }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  const isPending = status === 'pending_verification'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={24} className="text-green-600" /> Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your business and account settings</p>
      </div>

      {/* Pending verification banner */}
      {isPending && (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-xl flex items-start gap-3">
          <Clock className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-yellow-900 text-sm">Pending Re-verification</p>
            <p className="text-yellow-700 text-xs mt-1">
              Your updated business details are under review by our team.
              You can continue operating while the review is in progress.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2 text-sm">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id}
              onClick={() => { setTab(t.id); setError(''); setSuccess('') }}
              className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {/* ── Business Profile ── */}
      {tab === 'business' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between">
            <h2 className="text-base font-semibold text-gray-900">Business Profile</h2>
            {isPending && (
              <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium flex items-center gap-1">
                <Clock size={11} /> Pending review
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            Saving changes will submit your profile for re-verification. Admin will be notified
            and you will receive an email confirmation.
          </div>

          <div>
            <label className={lbl}>Business Name *</label>
            <input type="text" value={business.name}
              onChange={e => setBusiness(b => ({ ...b, name: e.target.value }))}
              className={inp} placeholder="e.g. Nairobi Auto Services" />
          </div>

          <div>
            <label className={lbl}>Provider Type</label>
            <select value={business.provider_type_id}
              onChange={e => setBusiness(b => ({ ...b, provider_type_id: e.target.value }))}
              className={inp}>
              <option value="">Select type...</option>
              {providerTypes.map(t => (
                <option key={t.id} value={t.id}>{t.display_name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              The category of automotive services you primarily offer.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Business Email</label>
              <input type="email" value={business.email}
                onChange={e => setBusiness(b => ({ ...b, email: e.target.value }))}
                className={inp} placeholder="info@yourgarage.co.ke" />
            </div>
            <div>
              <label className={lbl}>Business Phone</label>
              <input type="tel" value={business.phone}
                onChange={e => setBusiness(b => ({ ...b, phone: e.target.value }))}
                className={inp} placeholder="0712 345 678" />
            </div>
          </div>

          <div>
            <label className={lbl}>Website</label>
            <input type="url" value={business.website}
              onChange={e => setBusiness(b => ({ ...b, website: e.target.value }))}
              className={inp} placeholder="https://yourgarage.co.ke" />
          </div>

          <div>
            <label className={lbl}>Description</label>
            <textarea value={business.description} rows={3}
              onChange={e => setBusiness(b => ({ ...b, description: e.target.value }))}
              className={inp + ' resize-none'}
              placeholder="Tell customers about your garage, specialisations and experience..." />
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Shop locations are managed under <strong>My Shops</strong>.
            </p>
            <button onClick={saveBusiness} disabled={saving || !business.name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save &amp; Submit for Review
            </button>
          </div>
        </div>
      )}

      {/* ── Services Offered ── */}
      {tab === 'services' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Services Offered</h2>
          <p className="text-sm text-gray-500">
            Select all services your garage provides. This helps customers find you when
            searching for specific services.
          </p>

          {allServices.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Wrench size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No services available in the system yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allServices.map(svc => {
                const checked = selectedServices.has(svc.id)
                return (
                  <label key={svc.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'bg-green-50 border-green-300'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(svc.id)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 mt-0.5 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${checked ? 'text-green-800' : 'text-gray-900'}`}>
                        {svc.name}
                      </p>
                      {svc.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{svc.description}</p>
                      )}
                    </div>
                    {checked && (
                      <CheckCircle className="text-green-500 flex-shrink-0 ml-auto" size={16} />
                    )}
                  </label>
                )
              })}
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {selectedServices.size} service{selectedServices.size !== 1 ? 's' : ''} selected
            </p>
            <button onClick={saveServices} disabled={servicesSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {servicesSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Services
            </button>
          </div>
        </div>
      )}

      {/* ── Personal Profile ── */}
      {tab === 'personal' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">My Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>First Name</label>
              <input type="text" value={personal.first_name}
                onChange={e => setPersonal(p => ({ ...p, first_name: e.target.value }))}
                className={inp} placeholder="John" />
            </div>
            <div>
              <label className={lbl}>Last Name</label>
              <input type="text" value={personal.last_name}
                onChange={e => setPersonal(p => ({ ...p, last_name: e.target.value }))}
                className={inp} placeholder="Doe" />
            </div>
          </div>
          <div>
            <label className={lbl}>Phone Number</label>
            <input type="tel" value={personal.phone}
              onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))}
              className={inp} placeholder="0712 345 678" />
          </div>
          <div>
            <label className={lbl}>Bio</label>
            <textarea value={personal.bio} rows={2}
              onChange={e => setPersonal(p => ({ ...p, bio: e.target.value }))}
              className={inp + ' resize-none'} placeholder="Brief note about yourself..." />
          </div>
          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button onClick={savePersonal} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── Security ── */}
      {tab === 'security' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
          {pwError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{pwError}</div>
          )}
          <div>
            <label className={lbl}>Current Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={pw.current}
                onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                className={inp + ' pr-9'} placeholder="••••••••" />
              <button onClick={() => setShowPw(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>New Password</label>
              <input type={showPw ? 'text' : 'password'} value={pw.newPw}
                onChange={e => setPw(p => ({ ...p, newPw: e.target.value }))}
                className={inp} placeholder="Min 8 characters" />
            </div>
            <div>
              <label className={lbl}>Confirm Password</label>
              <input type={showPw ? 'text' : 'password'} value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                className={inp} placeholder="Repeat new password" />
            </div>
          </div>
          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button onClick={savePassword} disabled={pwSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 text-sm font-medium">
              {pwSaving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              Change Password
            </button>
          </div>
        </div>
      )}
    </div>
  )
}