// src/components/subscription/SubscriptionManager.jsx
'use client'

/**
 * SubscriptionManager
 *
 * Shared component used by individual, company, and provider subscription pages.
 * Handles the full subscription lifecycle: browse packages → subscribe → invoices → payment → receipts.
 *
 * Props:
 *   subscriberType  — 'individual' | 'company' | 'service_provider'
 *   subscriberId    — uuid of user_profiles.id | company_profiles.id | service_providers.id
 *   subscriberName  — display name for context
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import SubscriptionReceiptCard from '@/components/SubscriptionReceiptCard'
import {
  Package, CreditCard, FileText, CheckCircle, AlertCircle, Loader2,
  ArrowRight, Clock, DollarSign, Send, Banknote, Building2,
  BadgeCheck, Sparkles, X, Check, ChevronDown, ChevronUp
} from 'lucide-react'

const PAYMENT_METHODS = [
  { value: 'mpesa',         label: 'M-Pesa',   icon: CreditCard },
  { value: 'cash',          label: 'Cash',      icon: Banknote },
  { value: 'card',          label: 'Card',      icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank',      icon: Building2 },
]

const PERIOD_LABELS = {
  monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: 'Semi-Annual',
  annual: 'Annual', tri_annual: 'Tri-Annual',
}

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800', pending_approval: 'bg-yellow-100 text-yellow-800',
  dormant: 'bg-gray-100 text-gray-600', suspended: 'bg-red-100 text-red-800',
  expired: 'bg-gray-200 text-gray-600', cancelled: 'bg-orange-100 text-orange-800',
  paid: 'bg-green-100 text-green-800', unpaid: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
}

const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmt = (n, sym = '$') => `${sym}${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export default function SubscriptionManager({ subscriberType, subscriberId, subscriberName }) {
  const supabase = createClient()

  // State
  const [view, setView] = useState('overview')  // overview | packages | invoice
  const [subscriptions, setSubscriptions] = useState([])
  const [packages, setPackages] = useState([])
  const [invoices, setInvoices] = useState([])
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('monthly')
  const [expandedInvoice, setExpandedInvoice] = useState(null)

  // Payment form
  const [payingInvoiceId, setPayingInvoiceId] = useState(null)
  const [payMethod, setPayMethod] = useState('mpesa')
  const [payAmount, setPayAmount] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')

  // Trial check
  const [trialInfo, setTrialInfo] = useState(null)

  // ── Load data ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const subField = subscriberType === 'individual' ? 'user_id'
        : subscriberType === 'company' ? 'company_id' : 'service_provider_id'

      // Step 1: Fetch subscriptions, packages, invoices in parallel
      const [
        { data: subs, error: subsErr },
        { data: pkgs },
        { data: invs },
        { data: trial },
      ] = await Promise.all([
        supabase.from('subscription_details').select('*').eq(subField, subscriberId).order('created_at', { ascending: false }),
        supabase.from('subscription_package_listing').select('*')
          .eq('subscription_type_code', subscriberType).order('sort_order'),
        supabase.from('subscription_invoice_details').select('*').eq(subField, subscriberId).order('created_at', { ascending: false }),
        supabase.rpc('check_trial_eligibility', {
          p_subscriber_type: subscriberType, p_subscriber_id: subscriberId,
        }),
      ])

      if (subsErr) console.error('Subscriptions query error:', subsErr)

      setSubscriptions(subs || [])
      setPackages(pkgs || [])
      setInvoices(invs || [])
      if (trial?.[0]) setTrialInfo(trial[0])

      // Step 2: Fetch receipts using subscription IDs (avoids .in([]) error)
      const subIds = (subs || []).map(s => s.id)
      if (subIds.length > 0) {
        const { data: rcts } = await supabase
          .from('subscription_receipt_details')
          .select('*')
          .in('subscription_id', subIds)
          .order('created_at', { ascending: false })
        setReceipts(rcts || [])
      } else {
        setReceipts([])
      }
    } catch (e) {
      console.error('Load error:', e)
    } finally {
      setLoading(false)
    }
  }, [subscriberId, subscriberType])

  useEffect(() => { if (subscriberId) loadAll() }, [loadAll, subscriberId])

  // ── Subscribe to a package ─────────────────────────────────
  const handleSubscribe = async (packageId) => {
    if (!confirm('Subscribe to this package?')) return
    setSubscribing(true); setError(''); setSuccess('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_subscription', {
        p_subscriber_type: subscriberType,
        p_subscriber_id: subscriberId,
        p_package_id: packageId,
        p_auto_renew: false,
      })
      if (rpcErr) throw rpcErr
      setSuccess('Subscription created successfully! Check your invoices below.')
      setView('overview')
      await loadAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubscribing(false)
    }
  }

  // ── Record payment ─────────────────────────────────────────
  const handlePayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) { setError('Enter a valid amount'); return }
    setPaying(true); setError(''); setSuccess('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('record_subscription_payment', {
        p_invoice_id: payingInvoiceId,
        p_amount: parseFloat(payAmount),
        p_paid_via: payMethod,
        p_transaction_id: payRef || null,
        p_notes: payNotes || null,
      })
      if (rpcErr) throw rpcErr
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (!result.success) throw new Error(result.error)
      setSuccess(`Payment recorded! Ref: ${result.payment_ref}${result.change_given > 0 ? ` — Change: ${fmt(result.change_given)}` : ''}`)
      setPayingInvoiceId(null); setPayAmount(''); setPayRef(''); setPayNotes('')
      await loadAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setPaying(false)
    }
  }

  const activeSub = subscriptions.find(s => s.is_currently_active)
  const hasActive = !!activeSub

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="animate-spin text-blue-600" size={28} />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Alerts */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> <p className="flex-1">{error}</p>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-start gap-2">
          <CheckCircle size={15} className="flex-shrink-0 mt-0.5" /> <p className="flex-1">{success}</p>
          <button onClick={() => setSuccess('')}><X size={14} /></button>
        </div>
      )}

      {/* ── ACTIVE SUBSCRIPTION CARD ──────────────────────── */}
      {activeSub && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="bg-gray-900 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard size={18} className="text-blue-400" />
              <div>
                <h2 className="text-white font-bold text-sm">Active Subscription</h2>
                <p className="text-gray-400 text-xs">{activeSub.subscription_number}</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[activeSub.status_code] || 'bg-gray-100'}`}>
              {activeSub.status_name}
            </span>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 font-medium">Package</p>
              <p className="text-sm font-semibold text-gray-900">{activeSub.package_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Period</p>
              <p className="text-sm font-semibold text-gray-900">{activeSub.billing_period_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Expires</p>
              <p className="text-sm font-semibold text-gray-900">{fmtD(activeSub.expiry_date)}</p>
              {activeSub.days_until_expiry <= 7 && activeSub.days_until_expiry >= 0 && (
                <p className="text-xs text-red-500 font-medium">{activeSub.days_until_expiry} days left</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Cost</p>
              <p className="text-sm font-semibold text-gray-900">
                {activeSub.currency_symbol}{Number(activeSub.package_cost).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TRIAL BANNER ─────────────────────────────────── */}
      {trialInfo?.is_eligible && !hasActive && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Sparkles size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">{trialInfo.reason}</p>
            {trialInfo.trial_expires_at && (
              <p className="text-xs text-blue-600 mt-1">Trial expires: {fmtD(trialInfo.trial_expires_at)}</p>
            )}
          </div>
        </div>
      )}

      {/* ── NAV TABS ─────────────────────────────────────── */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'overview', label: 'Overview',  icon: CreditCard },
          { id: 'packages', label: 'Browse Plans', icon: Package },
          { id: 'invoice',  label: 'Invoices & Receipts', icon: FileText },
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
              view === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {view === 'overview' && (
        <div className="space-y-4">
          {subscriptions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Package size={40} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No subscription yet</h3>
              <p className="text-sm text-gray-500 mb-4">Browse our plans and find the right fit for your needs.</p>
              <button onClick={() => setView('packages')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
                Browse Plans <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <>
              {/* Quick stats */}
              {activeSub && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 font-medium">Package</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{activeSub.package_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{activeSub.billing_period_name}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 font-medium">Days remaining</p>
                    <p className={`text-2xl font-bold mt-1 ${activeSub.days_until_expiry <= 7 ? 'text-red-600' : 'text-gray-900'}`}>
                      {Math.max(0, activeSub.days_until_expiry || 0)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Expires {fmtD(activeSub.expiry_date)}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 font-medium">Total invoices</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{invoices.length}</p>
                    {invoices.filter(i => i.effective_status === 'unpaid' || i.effective_status === 'overdue').length > 0 && (
                      <p className="text-xs text-amber-600 font-medium mt-0.5">
                        {invoices.filter(i => i.effective_status === 'unpaid' || i.effective_status === 'overdue').length} unpaid
                      </p>
                    )}
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 font-medium">Total paid</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">
                      {activeSub.currency_symbol}{invoices.reduce((sum, i) => sum + Number(i.total_paid || 0), 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Unpaid invoices alert */}
              {invoices.filter(i => i.effective_status === 'unpaid' || i.effective_status === 'overdue').length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-amber-600" />
                      <p className="text-sm font-semibold text-amber-800">
                        {invoices.filter(i => i.effective_status === 'unpaid' || i.effective_status === 'overdue').length} unpaid invoice{invoices.filter(i => i.effective_status !== 'paid').length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <button onClick={() => setView('invoice')}
                      className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1">
                      View invoices <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('invoice')}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Invoices & Receipts</p>
                    <p className="text-xs text-gray-500">View payment history and make payments</p>
                  </div>
                </button>
                <button onClick={() => setView('packages')}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:bg-gray-50 transition-colors text-left flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Package size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{hasActive ? 'Change Plan' : 'Browse Plans'}</p>
                    <p className="text-xs text-gray-500">{hasActive ? 'Upgrade or switch your package' : 'Find the right plan for you'}</p>
                  </div>
                </button>
              </div>

              {/* Past subscriptions */}
              {subscriptions.filter(s => s.id !== activeSub?.id).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Previous subscriptions</p>
                  {subscriptions.filter(s => s.id !== activeSub?.id).map(s => (
                    <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{s.package_name}</p>
                        <p className="text-xs text-gray-500">{s.subscription_number} · {fmtD(s.start_date)} – {fmtD(s.expiry_date)}</p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status_code] || 'bg-gray-100'}`}>
                        {s.status_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {!hasActive && subscriptions.length > 0 && (
            <button onClick={() => setView('packages')}
              className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 font-medium flex items-center justify-center gap-2">
              <Package size={15} /> Browse Plans & Subscribe
            </button>
          )}
        </div>
      )}

      {/* ═══ PACKAGES ═══ */}
      {view === 'packages' && (
        <div className="space-y-4">
          {/* Period selector */}
          <div className="flex justify-center gap-2 flex-wrap">
            {Object.entries(PERIOD_LABELS).map(([code, label]) => (
              <button key={code} onClick={() => setSelectedPeriod(code)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectedPeriod === code ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.filter(p => p.billing_period_code === selectedPeriod).map(p => {
              const features = (() => { try { return typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []) } catch { return [] } })()
              const isFree = Number(p.cost) === 0
              const isBasicPlus = (p.name || '').toLowerCase().includes('basic plus')
              const isRecommended = isBasicPlus || (!isFree && !isBasicPlus && packages.filter(pk => pk.billing_period_code === selectedPeriod).indexOf(p) === 1)
              return (
                <div key={p.id} className={`rounded-xl border p-5 flex flex-col shadow-sm hover:shadow-md transition-all ${
                  isRecommended ? 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-200' : isFree ? 'border-gray-200 bg-gray-50/50' : 'border-gray-200 bg-white'
                }`}>
                  {isRecommended && (
                    <span className="self-start inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 mb-3">
                      <Sparkles size={10} /> RECOMMENDED
                    </span>
                  )}
                  <h3 className="text-base font-bold text-gray-900 mb-1">{p.name}</h3>
                  <p className="text-xs text-gray-500 mb-4">{p.description}</p>

                  <div className="mb-4">
                    {isFree ? (
                      <div>
                        <span className="text-2xl font-black text-green-600">Free</span>
                        <p className="text-xs text-gray-400 mt-0.5">No credit card required</p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-2xl font-black text-gray-900">{p.currency_symbol}{Number(p.cost).toLocaleString()}</span>
                        <span className="text-sm text-gray-400 ml-1">/{p.billing_period_name?.toLowerCase()}</span>
                        <p className="text-xs text-gray-400 mt-0.5">
                          ≈ {p.currency_symbol}{Number(p.monthly_equivalent_cost).toFixed(2)}/mo
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="flex gap-2 flex-wrap mb-3">
                    {p.max_users && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.max_users} users</span>}
                    {p.max_vehicles && <span className={`text-[10px] px-2 py-0.5 rounded ${isFree ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.max_vehicles} vehicle{p.max_vehicles > 1 ? 's' : ''}</span>}
                    {p.max_shops && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.max_shops} shops</span>}
                  </div>

                  {/* Features */}
                  <ul className="flex-1 space-y-1.5 mb-4">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <Check size={12} className={`mt-0.5 flex-shrink-0 ${isFree ? 'text-green-500' : isBasicPlus ? 'text-blue-500' : 'text-green-500'}`} /> {f}
                      </li>
                    ))}
                  </ul>

                  <button onClick={() => handleSubscribe(p.id)} disabled={subscribing}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${
                      isFree ? 'bg-green-600 text-white hover:bg-green-700'
                      : isRecommended ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}>
                    {subscribing ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    {isFree ? 'Start Free' : isBasicPlus ? 'Unlock Basic Plus' : 'Subscribe'}
                  </button>
                </div>
              )
            })}
          </div>
          {packages.filter(p => p.billing_period_code === selectedPeriod).length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No packages available for this period. Try another billing cycle.</p>
          )}
        </div>
      )}

      {/* ═══ INVOICES & RECEIPTS ═══ */}
      {view === 'invoice' && (
        <div className="space-y-4">
          {invoices.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <FileText size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No invoices yet. Subscribe to a plan to receive your first invoice.</p>
            </div>
          ) : (
            invoices.map(inv => {
              const isExpanded = expandedInvoice === inv.id
              const invReceipts = receipts.filter(r => r.subscription_invoice_id === inv.id)
              const isPaid = inv.invoice_status_code === 'paid'
              const isPayingThis = payingInvoiceId === inv.id

              return (
                <div key={inv.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  {/* Invoice header */}
                  <button onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isPaid ? 'bg-green-100' : 'bg-yellow-100'}`}>
                        <FileText size={16} className={isPaid ? 'text-green-600' : 'text-yellow-600'} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{inv.invoice_ref_no}</p>
                        <p className="text-xs text-gray-500">Due: {fmtD(inv.due_date)} · {inv.subscription_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{fmt(inv.total_amount, inv.currency_symbol)}</p>
                        {!isPaid && inv.balance_due > 0 && (
                          <p className="text-xs text-red-500">Balance: {fmt(inv.balance_due, inv.currency_symbol)}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.effective_status] || 'bg-gray-100'}`}>
                        {inv.effective_status}
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                      {/* Invoice details grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Amount Due</p>
                          <p className="font-semibold">{fmt(inv.amount_due, inv.currency_symbol)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Tax</p>
                          <p className="font-semibold">{fmt(inv.tax_amount, inv.currency_symbol)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total Paid</p>
                          <p className="font-semibold text-green-700">{fmt(inv.total_paid, inv.currency_symbol)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Period</p>
                          <p className="font-semibold">{fmtD(inv.billing_period_start)} – {fmtD(inv.billing_period_end)}</p>
                        </div>
                      </div>

                      {/* Receipts */}
                      {invReceipts.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Receipts</p>
                          {invReceipts.map(r => (
                            <SubscriptionReceiptCard
                              key={r.id}
                              receipt={r}
                              canConfirm={false}
                              onConfirmed={loadAll}
                            />
                          ))}
                        </div>
                      )}

                      {/* Record payment */}
                      {!isPaid && (
                        <div>
                          {!isPayingThis ? (
                            <button onClick={() => { setPayingInvoiceId(inv.id); setPayAmount(inv.balance_due?.toString() || inv.total_amount?.toString()) }}
                              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-900 hover:text-gray-900 font-medium transition-colors">
                              <DollarSign size={15} /> Record Payment
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-gray-200 overflow-hidden">
                              <div className="bg-gray-900 px-5 py-3 flex items-center gap-2">
                                <DollarSign size={14} className="text-amber-400" />
                                <span className="text-white font-semibold text-sm">Record Payment</span>
                              </div>
                              <div className="p-5 space-y-4 bg-white">
                                <div className="grid grid-cols-4 gap-2">
                                  {PAYMENT_METHODS.map(m => (
                                    <button key={m.value} onClick={() => setPayMethod(m.value)}
                                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                        payMethod === m.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                                      }`}>
                                      <m.icon size={15} /> {m.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Amount ({inv.currency_code})</label>
                                    <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inp} />
                                  </div>
                                  <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Transaction Ref</label>
                                    <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                                      placeholder="e.g. M-Pesa QXZ12345" className={inp} />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Notes (optional)</label>
                                  <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className={inp} />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={handlePayment} disabled={paying}
                                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
                                    {paying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                                    Confirm Payment
                                  </button>
                                  <button onClick={() => setPayingInvoiceId(null)}
                                    className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}