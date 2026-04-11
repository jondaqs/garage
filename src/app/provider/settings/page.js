'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, User, Store, Bell, CheckCircle,
  AlertCircle, Loader2, Save, Eye, EyeOff
} from 'lucide-react'

const TABS = [
  { id: 'business', label: 'Business Profile', icon: Store  },
  { id: 'personal', label: 'Personal Profile', icon: User   },
  { id: 'notifications', label: 'Notifications',  icon: Bell   },
]

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
const label = 'block text-xs font-medium text-gray-600 mb-1'

export default function ProviderSettingsPage() {
  const supabase = createClient()

  const [tab, setTab]         = useState('business')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  // Business profile
  const [business, setBusiness] = useState({
    name: '', email: '', phone: '', description: '',
  })

  // Personal profile
  const [personal, setPersonal] = useState({
    first_name: '', last_name: '', phone: '', bio: '',
  })

  // Password change
  const [pwForm, setPwForm]       = useState({ current: '', newPw: '', confirm: '' })
  const [showPw, setShowPw]       = useState(false)
  const [pwError, setPwError]     = useState('')
  const [pwSaving, setPwSaving]   = useState(false)

  // Notification prefs (stored in localStorage — no DB table needed)
  const [notifPrefs, setNotifPrefs] = useState({
    new_booking:          true,
    estimate_approved:    true,
    estimate_rejected:    true,
    payment_received:     true,
    new_review:           true,
    low_stock:            true,
  })

  useEffect(() => {
    loadSettings()
    // Load saved notif prefs
    try {
      const saved = localStorage.getItem('provider_notif_prefs')
      if (saved) setNotifPrefs(JSON.parse(saved))
    } catch {}
  }, [])

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, phone, bio')
        .eq('auth_user_id', user.id)
        .single()

      if (profile) {
        setPersonal({
          first_name: profile.first_name || '',
          last_name:  profile.last_name  || '',
          phone:      profile.phone      || '',
          bio:        profile.bio        || '',
        })
      }

      const { data: sp } = await supabase
        .from('service_providers')
        .select('id, name, email, phone, description')
        .eq('owner_user_id', profile.id)
        .single()

      if (sp) {
        setBusiness({
          name:        sp.name        || '',
          email:       sp.email       || '',
          phone:       sp.phone       || '',
          description: sp.description || '',
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const saveBusiness = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile }  = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

      const { error: err } = await supabase
        .from('service_providers')
        .update({
          name:        business.name.trim(),
          email:       business.email.trim()       || null,
          phone:       business.phone.trim()       || null,
          description: business.description.trim() || null,
        })
        .eq('owner_user_id', profile.id)

      if (err) throw err
      setSuccess('Business profile updated.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

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
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const savePassword = async () => {
    setPwError('')
    if (!pwForm.current)              { setPwError('Enter your current password'); return }
    if (pwForm.newPw.length < 8)      { setPwError('New password must be at least 8 characters'); return }
    if (pwForm.newPw !== pwForm.confirm){ setPwError('New passwords do not match'); return }

    setPwSaving(true)
    try {
      // Re-authenticate then update
      const { data: { user } } = await supabase.auth.getUser()
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email:    user.email,
        password: pwForm.current,
      })
      if (signInErr) throw new Error('Current password is incorrect')

      const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.newPw })
      if (updateErr) throw updateErr

      setPwForm({ current: '', newPw: '', confirm: '' })
      setSuccess('Password changed successfully.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) { setPwError(err.message) }
    finally { setPwSaving(false) }
  }

  const saveNotifPrefs = () => {
    try {
      localStorage.setItem('provider_notif_prefs', JSON.stringify(notifPrefs))
      setSuccess('Notification preferences saved.')
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Could not save preferences') }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-green-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={24} className="text-green-600" /> Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your business and account settings</p>
      </div>

      {/* Feedback */}
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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id}
              onClick={() => { setTab(t.id); setError(''); setSuccess('') }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Business Profile ── */}
      {tab === 'business' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Business Profile</h2>
          <p className="text-xs text-gray-500">
            This information is shown to customers when they book or view your services.
          </p>

          <div>
            <label className={label}>Business Name *</label>
            <input type="text" value={business.name}
              onChange={e => setBusiness(b => ({ ...b, name: e.target.value }))}
              className={inp} placeholder="e.g. Nairobi Auto Services" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Business Email</label>
              <input type="email" value={business.email}
                onChange={e => setBusiness(b => ({ ...b, email: e.target.value }))}
                className={inp} placeholder="info@yourgarage.co.ke" />
            </div>
            <div>
              <label className={label}>Business Phone</label>
              <input type="tel" value={business.phone}
                onChange={e => setBusiness(b => ({ ...b, phone: e.target.value }))}
                className={inp} placeholder="0712 345 678" />
            </div>
          </div>

          <div>
            <label className={label}>Description</label>
            <textarea value={business.description}
              onChange={e => setBusiness(b => ({ ...b, description: e.target.value }))}
              rows={3} placeholder="Tell customers about your garage and services..."
              className={inp + ' resize-none'} />
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-gray-100">
            <p className="text-xs text-gray-400">
              To edit shop locations, go to <strong>My Shops</strong> in the sidebar.
            </p>
            <button onClick={saveBusiness} disabled={saving || !business.name.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── Personal Profile ── */}
      {tab === 'personal' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Personal Profile</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>First Name</label>
                <input type="text" value={personal.first_name}
                  onChange={e => setPersonal(p => ({ ...p, first_name: e.target.value }))}
                  className={inp} placeholder="John" />
              </div>
              <div>
                <label className={label}>Last Name</label>
                <input type="text" value={personal.last_name}
                  onChange={e => setPersonal(p => ({ ...p, last_name: e.target.value }))}
                  className={inp} placeholder="Doe" />
              </div>
            </div>

            <div>
              <label className={label}>Phone Number</label>
              <input type="tel" value={personal.phone}
                onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))}
                className={inp} placeholder="0712 345 678" />
            </div>

            <div>
              <label className={label}>Bio</label>
              <textarea value={personal.bio}
                onChange={e => setPersonal(p => ({ ...p, bio: e.target.value }))}
                rows={2} placeholder="Brief description about yourself..."
                className={inp + ' resize-none'} />
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <button onClick={savePersonal} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Changes
              </button>
            </div>
          </div>

          {/* Change password */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Change Password</h2>

            {pwError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {pwError}
              </div>
            )}

            <div>
              <label className={label}>Current Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={pwForm.current}
                  onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                  className={inp + ' pr-9'} placeholder="••••••••" />
                <button onClick={() => setShowPw(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>New Password</label>
                <input type={showPw ? 'text' : 'password'} value={pwForm.newPw}
                  onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
                  className={inp} placeholder="Min 8 characters" />
              </div>
              <div>
                <label className={label}>Confirm New Password</label>
                <input type={showPw ? 'text' : 'password'} value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  className={inp} placeholder="Repeat new password" />
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-end">
              <button onClick={savePassword} disabled={pwSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 text-sm font-medium">
                {pwSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notifications ── */}
      {tab === 'notifications' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Notification Preferences</h2>
            <p className="text-xs text-gray-500 mt-1">
              Choose which in-app notifications you want to receive. The bell icon in the header
              will show all unread notifications regardless of these settings.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { key: 'new_booking',       label: 'New Booking',               desc: 'When a customer creates a new booking'     },
              { key: 'estimate_approved', label: 'Estimate Approved',         desc: 'When a customer approves your estimate'    },
              { key: 'estimate_rejected', label: 'Estimate Rejected',         desc: 'When a customer rejects your estimate'     },
              { key: 'payment_received',  label: 'Payment Received',          desc: 'When a payment is recorded on an invoice'  },
              { key: 'new_review',        label: 'New Review',                desc: 'When a customer leaves a review'           },
              { key: 'low_stock',         label: 'Low Inventory Alerts',      desc: 'When spare parts are running low'          },
            ].map(item => (
              <label key={item.key}
                className="flex items-start justify-between gap-4 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <input type="checkbox"
                    checked={notifPrefs[item.key] ?? true}
                    onChange={e => setNotifPrefs(p => ({ ...p, [item.key]: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                </div>
              </label>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-100 flex justify-end">
            <button onClick={saveNotifPrefs}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <Save size={14} /> Save Preferences
            </button>
          </div>
        </div>
      )}
    </div>
  )
}