'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, Building2, User, CheckCircle, AlertCircle,
  Loader2, Save, Eye, EyeOff, Lock, Shield
} from 'lucide-react'

const TABS = [
  { id: 'company',  label: 'Company Profile', icon: Building2 },
  { id: 'personal', label: 'My Profile',       icon: User      },
  { id: 'security', label: 'Security',          icon: Lock      },
]

const INDUSTRIES = [
  'Transportation & Logistics', 'Construction', 'Mining', 'Agriculture',
  'Government', 'Healthcare', 'Retail & Distribution', 'Manufacturing',
  'Tourism & Hospitality', 'NGO / Non-Profit', 'Other',
]

const COMPANY_SIZES = [
  '1–10 employees', '11–50 employees', '51–200 employees',
  '201–500 employees', '500+ employees',
]

const WORKING_DAYS = [
  { value: 'monday',    label: 'Mon' },
  { value: 'tuesday',   label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday',  label: 'Thu' },
  { value: 'friday',    label: 'Fri' },
  { value: 'saturday',  label: 'Sat' },
  { value: 'sunday',    label: 'Sun' },
]

const inp      = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500'
const inpLabel = 'block text-xs font-medium text-gray-600 mb-1'

export default function CompanySettingsPage() {
  const supabase = createClient()

  const [tab,     setTab]     = useState('company')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const [companyId, setCompanyId] = useState(null)

  // Company profile
  const [company, setCompany] = useState({
    name: '', bio: '', website: '', phone: '',
    industry: '', company_size: '', physical_address: '',
    city: '', country: 'Kenya',
    years_in_operation: '', opening_time: '08:00', closing_time: '18:00',
    working_days: ['monday','tuesday','wednesday','thursday','friday'],
    registration_number: '', tax_id: '',
    status: '',
  })

  // Personal profile
  const [personal, setPersonal] = useState({
    first_name: '', last_name: '', phone: '', bio: '',
  })

  // Password
  const [pw, setPw]           = useState({ current: '', newPw: '', confirm: '' })
  const [showPw, setShowPw]   = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Resolve profile
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

      // Is owner?
      const { data: owned } = await supabase
        .from('company_profiles')
        .select('*')
        .eq('owner_user_id', profile.id)
        .maybeSingle()

      if (owned) {
        setIsOwner(true)
        setCompanyId(owned.id)
        setCompany({
          name:                owned.name                || '',
          bio:                 owned.bio                 || '',
          website:             owned.website             || '',
          phone:               owned.phone               || '',
          industry:            owned.industry            || '',
          company_size:        owned.company_size        || '',
          physical_address:    owned.physical_address    || '',
          city:                owned.city                || '',
          country:             owned.country             || 'Kenya',
          years_in_operation:  owned.years_in_operation?.toString() || '',
          opening_time:        owned.opening_time        || '08:00',
          closing_time:        owned.closing_time        || '18:00',
          working_days:        owned.working_days        || ['monday','tuesday','wednesday','thursday','friday'],
          registration_number: owned.registration_number || '',
          tax_id:              owned.tax_id              || '',
          status:              owned.status              || '',
        })
      } else {
        // Admin member — get company read-only
        const { data: mem } = await supabase
          .from('company_users')
          .select('company_id, company:company_profiles(*)')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle()

        if (mem?.company) {
          setCompanyId(mem.company_id)
          const co = mem.company
          setCompany({
            name:                co.name                || '',
            bio:                 co.bio                 || '',
            website:             co.website             || '',
            phone:               co.phone               || '',
            industry:            co.industry            || '',
            company_size:        co.company_size        || '',
            physical_address:    co.physical_address    || '',
            city:                co.city                || '',
            country:             co.country             || 'Kenya',
            years_in_operation:  co.years_in_operation?.toString() || '',
            opening_time:        co.opening_time        || '08:00',
            closing_time:        co.closing_time        || '18:00',
            working_days:        co.working_days        || [],
            registration_number: co.registration_number || '',
            tax_id:              co.tax_id              || '',
            status:              co.status              || '',
          })
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Save company profile ──────────────────────────────────────────────────
  const saveCompany = async () => {
    if (!company.name.trim()) { setError('Company name is required'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      // Use the SECURITY DEFINER RPC — bypasses the restrictive RLS on company_profiles
      const { data: result, error: rpcErr } = await supabase.rpc(
        'owner_update_company_details',
        {
          p_company_id:         companyId,
          p_name:               company.name.trim(),
          p_registration_number:company.registration_number || null,
          p_tax_id:             company.tax_id              || null,
          p_industry:           company.industry            || null,
          p_company_size:       company.company_size        || null,
          p_bio:                company.bio.trim()          || null,
          p_website:            company.website.trim()      || null,
          p_phone:              company.phone.trim()        || null,
          p_physical_address:   company.physical_address    || null,
          p_city:               company.city                || null,
          p_country:            company.country             || 'Kenya',
          p_years_in_operation: company.years_in_operation
            ? parseInt(company.years_in_operation) : null,
          p_opening_time:       company.opening_time        || null,
          p_closing_time:       company.closing_time        || null,
          p_working_days:       company.working_days        || [],
          // Keep current status — don't bump to pending_verification on a simple settings update
          p_status:             company.status              || 'active',
        }
      )
      if (rpcErr) throw rpcErr
      if (!result?.success) throw new Error(result?.error || 'Failed to save')
      setSuccess('Company profile updated successfully.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
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
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Change password ───────────────────────────────────────────────────────
  const savePassword = async () => {
    setPwError('')
    if (!pw.current)               { setPwError('Enter your current password'); return }
    if (pw.newPw.length < 8)       { setPwError('New password must be at least 8 characters'); return }
    if (pw.newPw !== pw.confirm)   { setPwError('New passwords do not match'); return }
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
    } catch (err) {
      setPwError(err.message)
    } finally {
      setPwSaving(false)
    }
  }

  const toggleDay = (day) => {
    setCompany(c => ({
      ...c,
      working_days: c.working_days.includes(day)
        ? c.working_days.filter(d => d !== day)
        : [...c.working_days, day],
    }))
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={24} className="text-blue-600" /> Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your company and account settings
        </p>
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
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {/* ── COMPANY PROFILE TAB ──────────────────────────────────────────── */}
      {tab === 'company' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">

          {/* Read-only notice for non-owners */}
          {!isOwner && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <Shield size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-blue-700">
                Only the company owner can edit company details. You are viewing in read-only mode.
              </p>
            </div>
          )}

          <h2 className="text-base font-semibold text-gray-900">Company Profile</h2>

          {/* Basic info */}
          <div>
            <label className={inpLabel}>Company Name *</label>
            <input type="text" value={company.name} disabled={!isOwner}
              onChange={e => setCompany(c => ({ ...c, name: e.target.value }))}
              className={inp} placeholder="e.g. Savannah Logistics Ltd" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={inpLabel}>Phone</label>
              <input type="tel" value={company.phone} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, phone: e.target.value }))}
                className={inp} placeholder="0712 345 678" />
            </div>
            <div>
              <label className={inpLabel}>Website</label>
              <input type="url" value={company.website} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, website: e.target.value }))}
                className={inp} placeholder="https://yourcompany.co.ke" />
            </div>
          </div>

          <div>
            <label className={inpLabel}>About the Company</label>
            <textarea value={company.bio} disabled={!isOwner} rows={3}
              onChange={e => setCompany(c => ({ ...c, bio: e.target.value }))}
              className={inp + ' resize-none'}
              placeholder="Brief description of your company and fleet..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={inpLabel}>Industry</label>
              <select value={company.industry} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, industry: e.target.value }))}
                className={inp}>
                <option value="">Select industry...</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className={inpLabel}>Company Size</label>
              <select value={company.company_size} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, company_size: e.target.value }))}
                className={inp}>
                <option value="">Select size...</option>
                {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={inpLabel}>Registration Number</label>
              <input type="text" value={company.registration_number} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, registration_number: e.target.value }))}
                className={inp} placeholder="e.g. CPR/2018/123456" />
            </div>
            <div>
              <label className={inpLabel}>KRA PIN / Tax ID</label>
              <input type="text" value={company.tax_id} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, tax_id: e.target.value }))}
                className={inp} placeholder="e.g. P051234567X" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={inpLabel}>Years in Operation</label>
              <input type="number" min="0" value={company.years_in_operation} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, years_in_operation: e.target.value }))}
                className={inp} placeholder="e.g. 5" />
            </div>
            <div>
              <label className={inpLabel}>City / Town</label>
              <input type="text" value={company.city} disabled={!isOwner}
                onChange={e => setCompany(c => ({ ...c, city: e.target.value }))}
                className={inp} placeholder="e.g. Nairobi" />
            </div>
          </div>

          <div>
            <label className={inpLabel}>Physical Address</label>
            <input type="text" value={company.physical_address} disabled={!isOwner}
              onChange={e => setCompany(c => ({ ...c, physical_address: e.target.value }))}
              className={inp} placeholder="e.g. Mombasa Road, Industrial Area" />
          </div>

          {/* Operating hours */}
          <div>
            <label className={inpLabel}>Operating Hours</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-400 block mb-1">Opens</span>
                <input type="time" value={company.opening_time} disabled={!isOwner}
                  onChange={e => setCompany(c => ({ ...c, opening_time: e.target.value }))}
                  className={inp} />
              </div>
              <div>
                <span className="text-xs text-gray-400 block mb-1">Closes</span>
                <input type="time" value={company.closing_time} disabled={!isOwner}
                  onChange={e => setCompany(c => ({ ...c, closing_time: e.target.value }))}
                  className={inp} />
              </div>
            </div>
          </div>

          {/* Working days */}
          <div>
            <label className={inpLabel}>Working Days</label>
            <div className="flex flex-wrap gap-2">
              {WORKING_DAYS.map(d => {
                const active = company.working_days.includes(d.value)
                return (
                  <button key={d.value}
                    disabled={!isOwner}
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                    } disabled:cursor-default disabled:opacity-70`}>
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          {isOwner && (
            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button onClick={saveCompany} disabled={saving || !company.name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Changes
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PERSONAL PROFILE TAB ─────────────────────────────────────────── */}
      {tab === 'personal' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">My Profile</h2>
          <p className="text-xs text-gray-500">
            Your personal account details — visible to your company admin.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={inpLabel}>First Name</label>
              <input type="text" value={personal.first_name}
                onChange={e => setPersonal(p => ({ ...p, first_name: e.target.value }))}
                className={inp} placeholder="Jane" />
            </div>
            <div>
              <label className={inpLabel}>Last Name</label>
              <input type="text" value={personal.last_name}
                onChange={e => setPersonal(p => ({ ...p, last_name: e.target.value }))}
                className={inp} placeholder="Doe" />
            </div>
          </div>

          <div>
            <label className={inpLabel}>Phone Number</label>
            <input type="tel" value={personal.phone}
              onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))}
              className={inp} placeholder="0712 345 678" />
          </div>

          <div>
            <label className={inpLabel}>Bio</label>
            <textarea value={personal.bio} rows={2}
              onChange={e => setPersonal(p => ({ ...p, bio: e.target.value }))}
              className={inp + ' resize-none'}
              placeholder="Brief note about your role..." />
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <button onClick={savePersonal} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* ── SECURITY TAB ─────────────────────────────────────────────────── */}
      {tab === 'security' && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>

          {pwError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {pwError}
            </div>
          )}

          <div>
            <label className={inpLabel}>Current Password</label>
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
              <label className={inpLabel}>New Password</label>
              <input type={showPw ? 'text' : 'password'} value={pw.newPw}
                onChange={e => setPw(p => ({ ...p, newPw: e.target.value }))}
                className={inp} placeholder="Min 8 characters" />
            </div>
            <div>
              <label className={inpLabel}>Confirm New Password</label>
              <input type={showPw ? 'text' : 'password'} value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                className={inp} placeholder="Repeat new password" />
            </div>
          </div>

          {pw.newPw && pw.confirm && pw.newPw !== pw.confirm && (
            <p className="text-xs text-red-600">Passwords do not match</p>
          )}
          {pw.newPw && pw.newPw.length > 0 && pw.newPw.length < 8 && (
            <p className="text-xs text-red-600">Password must be at least 8 characters</p>
          )}

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