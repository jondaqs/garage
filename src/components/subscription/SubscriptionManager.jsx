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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SubscriptionReceiptCard from '@/components/SubscriptionReceiptCard'
import {
  Package, CreditCard, FileText, CheckCircle, AlertCircle, Loader2,
  ArrowRight, Clock, DollarSign, Send, Banknote, Building2,
  BadgeCheck, Sparkles, X, Check, ChevronDown, ChevronUp, Download, Receipt, MessageSquarePlus, Globe, Smartphone,
  Car, Users
} from 'lucide-react'
import { buildSubscriptionInvoiceHtml } from '@/lib/subscription/buildSubscriptionInvoiceHtml'
import { buildSubscriptionReceiptHtml } from '@/lib/subscription/buildSubscriptionReceiptHtml'
import { downloadHtmlAsPdf } from '@/lib/subscription/downloadHtmlAsPdf'
import SubscriptionTermsModal from '@/components/subscription/SubscriptionTermsModal'
import SubscriptionTicketModal from '@/components/subscription/SubscriptionTicketModal'
import { detectCurrencyFromBrowser, matchCurrencyInList } from '@/lib/currency/detectCurrency'

const PAYMENT_METHODS = [
  { value: 'mpesa',         label: 'M-Pesa',   icon: CreditCard,  accountKey: 'mpesa' },
  { value: 'cash',          label: 'Cash',      icon: Banknote,    accountKey: 'cash' },
  { value: 'card',          label: 'Card',      icon: CreditCard,  accountKey: 'card' },
  { value: 'bank_transfer', label: 'Bank',      icon: Building2,   accountKey: 'bank' },
]

const PERIOD_LABELS = {
  monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: 'Semi-Annual',
  annual: 'Annual', tri_annual: 'Tri-Annual',
}

/** Compact utilization card for the active subscription section */
function UtilizationCard({ icon, label, current, max, colorClass = 'blue' }) {
  const isUnlimited = max == null
  const pct = isUnlimited ? 0 : max > 0 ? Math.min((current / max) * 100, 100) : 0
  const isOver = !isUnlimited && current > max
  const isNear = !isUnlimited && !isOver && pct >= 80

  const colors = {
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   bar: 'bg-blue-500',   text: 'text-blue-700',   over: 'text-red-600' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', bar: 'bg-purple-500', text: 'text-purple-700', over: 'text-red-600' },
    green:  { bg: 'bg-green-50',  border: 'border-green-100',  bar: 'bg-green-500',  text: 'text-green-700',  over: 'text-red-600' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  bar: 'bg-amber-500',  text: 'text-amber-700',  over: 'text-red-600' },
  }
  const c = colors[colorClass] || colors.blue

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-3 space-y-1.5`}>
      <div className="flex items-center gap-1.5">
        <span className={c.text}>{icon}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${c.text}`}>{label}</span>
      </div>
      <p className={`text-lg font-bold ${isOver ? c.over : c.text}`}>
        {current}
        <span className="text-xs font-normal text-gray-400">
          {isUnlimited ? ' / ∞' : ` / ${max}`}
        </span>
      </p>
      {!isUnlimited && (
        <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : isNear ? 'bg-amber-400' : c.bar}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {isOver && (
        <p className="text-[9px] text-red-500 font-medium">Exceeded — upgrade your plan</p>
      )}
      {isNear && (
        <p className="text-[9px] text-amber-600 font-medium">Approaching limit</p>
      )}
    </div>
  )
}

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-800', pending_approval: 'bg-yellow-100 text-yellow-800',
  dormant: 'bg-gray-100 text-gray-600', suspended: 'bg-red-100 text-red-800',
  expired: 'bg-gray-200 text-gray-600', cancelled: 'bg-orange-100 text-orange-800',
  paid: 'bg-green-100 text-green-800', unpaid: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
}

const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmt = (n, sym = '') => `${sym}${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

export default function SubscriptionManager({ subscriberType, subscriberId, subscriberName }) {
  const supabase = createClient()
  const searchParams = useSearchParams()

  // Deep-link: ?view=invoices&invoice=UUID
  const initialView = searchParams?.get('view') || 'overview'
  const deepLinkedInvoice = searchParams?.get('invoice') || null
  const deepLinkScrolled = useRef(false)

  // State (must be declared BEFORE any useEffect that references them)
  const [view, setView] = useState(initialView)
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
  const [expandedInvoice, setExpandedInvoice] = useState(deepLinkedInvoice)

  // Payment form
  const [payingInvoiceId, setPayingInvoiceId] = useState(null)
  const [payMethod, setPayMethod] = useState('mpesa')
  const [payAmount, setPayAmount] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paymentAccounts, setPaymentAccounts] = useState(null)

  // M-Pesa STK Push
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [stkState, setStkState] = useState('idle') // idle | initiating | waiting | success | failed | timeout
  const [stkError, setStkError] = useState('')
  const [stkCheckoutId, setStkCheckoutId] = useState(null)
  const [stkReceipt, setStkReceipt] = useState(null)
  const stkPollRef = useRef(null) // ref for polling interval cleanup

  // Card payment (Paystack)
  const [cardState, setCardState] = useState('idle') // idle | initiating | success | failed
  const [cardError, setCardError] = useState('')
  const [cardReceipt, setCardReceipt] = useState(null)

  // Trial check
  const [trialInfo, setTrialInfo] = useState(null)
  const [metrics, setMetrics] = useState(null) // { vehicle_count, staff_count, monthly_client_count, shop_count }

  // Subscription page path per subscriber type (used for invoice CTA URLs)
  const subscriptionPath = subscriberType === 'individual' ? '/dashboard/subscription'
    : subscriberType === 'company' ? '/company/subscription'
    : subscriberType === 'service_provider' ? '/provider/subscription'
    : '/dashboard/subscription'

  // Subscriber profile (for invoice/receipt "Bill To")
  const [subscriberProfile, setSubscriberProfile] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const [freeTier, setFreeTier] = useState(null) // Free tier data from DB
  const [providerShops, setProviderShops] = useState([]) // Provider's active shops
  const [selectedShopCount, setSelectedShopCount] = useState(1)
  const [shopAddon, setShopAddon] = useState(null) // Shop addon pricing from compute_shop_addon
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [tickets, setTickets] = useState([])

  // Currency conversion for Browse Plans
  const [availableCurrencies, setAvailableCurrencies] = useState([])
  const [displayCurrency, setDisplayCurrency] = useState('USD')
  const [displaySymbol, setDisplaySymbol] = useState('$')
  const [convRate, setConvRate] = useState(1)
  const [rateLoading, setRateLoading] = useState(true)
  const [currencyReady, setCurrencyReady] = useState(false)

  // Terms & Conditions modal
  const [termsModal, setTermsModal] = useState(null) // { packageId, packageName, packageCost, isUpgrade, upgradeCredit, currentPlan }

  // Auto-scroll to deep-linked invoice after data loads
  useEffect(() => {
    if (deepLinkedInvoice && !loading && !deepLinkScrolled.current) {
      deepLinkScrolled.current = true
      setTimeout(() => {
        const el = document.getElementById(`invoice-${deepLinkedInvoice}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.style.transition = 'box-shadow 0.3s ease'
          el.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.4)'
          setTimeout(() => { el.style.boxShadow = '' }, 2000)
        }
      }, 300)
    }
  }, [deepLinkedInvoice, loading])

  // ── Load data ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const subField = subscriberType === 'individual' ? 'user_id'
        : subscriberType === 'company' ? 'company_id' : 'service_provider_id'

      const [
        { data: subs, error: subsErr },
        { data: pkgs },
        { data: invs },
        { data: trial },
        { data: profile },
      ] = await Promise.all([
        supabase.from('subscription_details').select('*').eq(subField, subscriberId).order('created_at', { ascending: false }),
        supabase.from('subscription_package_listing').select('*')
          .eq('subscription_type_code', subscriberType).order('sort_order'),
        supabase.from('subscription_invoice_details').select('*').eq(subField, subscriberId).order('created_at', { ascending: false }),
        supabase.rpc('check_trial_eligibility', {
          p_subscriber_type: subscriberType, p_subscriber_id: subscriberId,
        }),
        subscriberType === 'individual'
          ? supabase.from('user_profiles_secure').select('first_name, last_name, email, phone').eq('id', subscriberId).maybeSingle()
          : subscriberType === 'company'
            ? supabase.from('company_profiles_secure').select('name, email, phone').eq('id', subscriberId).maybeSingle()
            : supabase.from('service_providers_secure').select('name, email, phone').eq('id', subscriberId).maybeSingle(),
      ])

      if (subsErr) throw subsErr

      setSubscriptions(subs || [])
      setPackages(pkgs || [])
      setInvoices(invs || [])
      if (trial?.[0]) setTrialInfo(trial[0])

      // Fetch subscription tickets (company/provider only)
      if (subscriberType !== 'individual') {
        const ticketField = subscriberType === 'company' ? 'company_id' : 'service_provider_id'
        const { data: tix } = await supabase
          .from('subscription_tickets')
          .select('*')
          .eq(ticketField, subscriberId)
          .order('created_at', { ascending: false })
        setTickets(tix || [])
      }

      // Fetch currencies and determine user's preferred currency
      const { data: currData } = await supabase
        .from('currencies').select('id, code, symbol, display_name, country')
        .eq('is_active', true).order('code')
      setAvailableCurrencies(currData || [])

      // Currency detection chain:
      // 1. Provider: currency_id field (direct)
      // 2. User profile: country → currencies.country → code
      // 3. Company profile: country → currencies.country → code
      // 4. Browser timezone detection
      // 5. Default USD
      let resolved = false

      if (subscriberType === 'service_provider' && subscriberId) {
        const { data: sp } = await supabase
          .from('service_providers').select('currency_id, currencies(code, symbol)')
          .eq('id', subscriberId).maybeSingle()
        if (sp?.currencies?.code) {
          setDisplayCurrency(sp.currencies.code)
          setDisplaySymbol(sp.currencies.symbol || sp.currencies.code)
          resolved = true
        }
      }

      // Check user_profiles.country (for individual or any user)
      if (!resolved) {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser) {
          const { data: userProfile } = await supabase
            .from('user_profiles_secure').select('country')
            .eq('auth_user_id', authUser.id).maybeSingle()
          if (userProfile?.country) {
            const match = (currData || []).find(c => c.country === userProfile.country)
            if (match) {
              setDisplayCurrency(match.code)
              setDisplaySymbol(match.symbol || match.code)
              resolved = true
            }
          }
        }
      }

      // Check company_profiles.country (for company context)
      if (!resolved && subscriberType === 'company' && subscriberId) {
        const { data: comp } = await supabase
          .from('company_profiles').select('country')
          .eq('id', subscriberId).maybeSingle()
        if (comp?.country) {
          const match = (currData || []).find(c => c.country === comp.country)
          if (match) {
            setDisplayCurrency(match.code)
            setDisplaySymbol(match.symbol || match.code)
            resolved = true
          }
        }
      }

      // Fallback: browser timezone detection
      if (!resolved) {
        const { currencyCode: detected } = detectCurrencyFromBrowser()
        const match = matchCurrencyInList(detected, currData || [])
        if (match) { setDisplayCurrency(match.code); setDisplaySymbol(match.symbol || match.code) }
      }

      if (profile) {
        const p = profile
        setSubscriberProfile({
          name: p.first_name ? `${p.first_name} ${p.last_name || ''}`.trim() : (p.name || null),
          email: p.email || null,
          phone: p.phone || null,
        })
      }

      // Fetch free tier data for the standalone free card
      if (subscriberType === 'individual') {
        const { data: freeData } = await supabase
          .from('subscription_pricing_overview')
          .select('tier_name, description, features, max_vehicles_included, free_vehicle_count')
          .eq('subscription_type', 'individual')
          .eq('base_monthly_price', 0)
          .eq('is_active', true)
          .maybeSingle()
        setFreeTier(freeData)
      }

      // Fetch provider's shops for multi-shop selection
      if (subscriberType === 'service_provider') {
        const { data: shops } = await supabase
          .from('shops')
          .select('id, name, is_active, is_suspended')
          .eq('service_provider_id', subscriberId)
          .eq('is_active', true)
          .eq('is_suspended', false)
          .order('name')
        setProviderShops(shops || [])
        // Default shop count: use active subscription's shop_count if available, else actual shop count
        const activeSub = (subs || []).find(s => s.is_currently_active)
        const subShopCount = Math.max(Number(activeSub?.shop_count || 0), 1)
        const actualShopCount = Math.max(shops?.length || 0, 1)
        const shopCount = subShopCount > 1 ? subShopCount : actualShopCount
        setSelectedShopCount(shopCount)
        // Compute shop addon pricing
        const { data: addonData } = await supabase.rpc('compute_shop_addon', { p_shop_count: shopCount })
        if (addonData?.[0]) setShopAddon(addonData[0])
        else if (addonData) setShopAddon(addonData)
      }

      // Fetch utilization metrics for all subscriber types
      const { data: metricsData } = await supabase.rpc('count_subscriber_metrics', {
        p_subscriber_type: subscriberType,
        p_subscriber_id: subscriberId,
      })
      if (metricsData?.[0]) setMetrics(metricsData[0])
      else if (metricsData) setMetrics(metricsData)

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

  // Fetch payment account details (public setting)
  useEffect(() => {
    supabase.from('platform_settings')
      .select('setting_value')
      .eq('setting_key', 'payment_accounts')
      .single()
      .then(({ data }) => { if (data) setPaymentAccounts(data.setting_value) })
  }, [supabase])

  // Auto-select the first enabled payment method
  useEffect(() => {
    if (!paymentAccounts) return
    const enabledMethods = PAYMENT_METHODS.filter(m => paymentAccounts[m.accountKey]?.enabled !== false)
    if (enabledMethods.length > 0 && !enabledMethods.find(m => m.value === payMethod)) {
      setPayMethod(enabledMethods[0].value)
    }
  }, [paymentAccounts])

  // Fetch exchange rate when display currency changes
  useEffect(() => {
    if (displayCurrency === 'USD') { setConvRate(1); setDisplaySymbol('$'); setRateLoading(false); setCurrencyReady(true); return }
    const fetchRate = async () => {
      setRateLoading(true)
      try {
        const resp = await fetch(`/api/pricing/exchange-rate?currency_code=${displayCurrency}`)
        if (!resp.ok) throw new Error('Rate unavailable')
        const data = await resp.json()
        setConvRate(data.margined_rate || 1)
        setDisplaySymbol(data.currency_symbol || displayCurrency)
      } catch (e) {
        console.error('Currency rate error:', e)
        setConvRate(1); setDisplaySymbol('$'); setDisplayCurrency('USD')
      } finally { setRateLoading(false); setCurrencyReady(true) }
    }
    fetchRate()
  }, [displayCurrency])

  // Convert a price for display (always rounds UP — never show less than actual cost)
  const cv = (amount) => {
    if (convRate === 1 || !amount) return Number(amount || 0)
    return Math.ceil(Number(amount) * convRate)
  }
  const fmtC = (amount) => `${displaySymbol}${cv(amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  // Format an invoice/receipt amount — show in display currency when different
  const fmtInv = (amount, invSymbol, invCode) => {
    const sym = invSymbol || displaySymbol || ''
    if (invCode === displayCurrency || convRate === 1) return fmt(amount, sym)
    return fmtC(amount)
  }
  // Whether the invoice currency differs from display currency
  const invConverted = (invCode) => invCode && invCode !== displayCurrency && convRate !== 1

  // ── Subscribe to a package ─────────────────────────────────
  const handleSubscribe = async (packageId) => {
    const pkg = packages.find(p => p.id === packageId)
    if (!pkg) return

    // Check for duplicate: same package AND same shop count (0/null treated as 1 = default free shop)
    const duplicate = subscriptions.find(s =>
      s.is_currently_active && s.package_id === packageId && !s.is_expired
      && (subscriberType !== 'service_provider' || Math.max(Number(s.shop_count || 0), 1) === selectedShopCount)
    )
    if (duplicate) {
      setError(`You already have an active subscription to ${pkg.name}${subscriberType === 'service_provider' ? ` with ${selectedShopCount} shop(s)` : ''}. It expires on ${fmtD(duplicate.expiry_date)}.`)
      setTimeout(() => setError(''), 5000)
      // Scroll to toast so user sees it
      setTimeout(() => {
        const el = document.getElementById('subscription-toast')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }

    // Check for active paid subscription (upgrade scenario)
    const activePaid = subscriptions.find(s => s.is_currently_active && Number(s.package_cost) > 0)
    let upgradeCredit = ''
    if (activePaid) {
      const totalDays = Math.max(Math.round((new Date(activePaid.expiry_date) - new Date(activePaid.start_date)) / 86400000), 1)
      const remaining = Math.max(Math.round((new Date(activePaid.expiry_date) - new Date()) / 86400000), 0)
      const credit = Math.min(((activePaid.package_cost / totalDays) * remaining).toFixed(2), pkg.cost)
      upgradeCredit = fmt(credit)
    }

    // Show T&C modal instead of browser confirm
    setTermsModal({
      packageId,
      packageName: pkg.name,
      packageCost: `${displaySymbol}${cv(pkg.cost).toLocaleString()}`,
      isUpgrade: !!activePaid,
      upgradeCredit,
      currentPlan: activePaid?.package_name || '',
    })
  }

  const executeSubscribe = async () => {
    if (!termsModal) return
    const { packageId } = termsModal
    setSubscribing(true); setError(''); setSuccess('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_subscription', {
        p_subscriber_type: subscriberType,
        p_subscriber_id: subscriberId,
        p_package_id: packageId,
        p_auto_renew: false,
        p_shop_count: subscriberType === 'service_provider' ? selectedShopCount : 0,
      })
      if (rpcErr) throw rpcErr
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (result?.success === false) throw new Error(result.error)

      const subId = result?.subscription_id || data
      let msg = ''
      if (result?.upgraded_from === null && result?.upgrade_notes?.includes('Shop upgrade')) {
        // Shop-only upgrade
        msg = result.net_amount > 0
          ? `Shop count updated! ${result.upgrade_notes} Invoice of ${fmt(result.net_amount, displaySymbol)} created for the additional shop(s).`
          : 'Shop count updated! No additional charge.'
      } else if (result?.upgrade_credit > 0 && result?.net_amount > 0) {
        msg = `Upgrade initiated! A credit of ${fmt(result.upgrade_credit, displaySymbol)} from your previous plan (${result.upgraded_from}) has been applied. ` +
          `Net amount due: ${fmt(result.net_amount, displaySymbol)}. Your current plan stays active until payment is confirmed.`
      } else if (result?.upgrade_credit > 0 && result?.net_amount === 0) {
        msg = `Upgraded successfully! The credit from your previous plan (${result.upgraded_from}) fully covers the new package — no payment needed!`
      } else if (result?.net_amount > 0) {
        msg = 'Subscription created! Please pay the invoice below to activate your plan.'
      } else {
        msg = 'Subscription activated successfully!'
      }
      setSuccess(msg)
      setView('invoices')
      setTermsModal(null)
      await loadAll()
      // Scroll to success toast
      setTimeout(() => {
        const el = document.getElementById('subscription-toast')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
      if (subId) {
        try {
          await fetch('/api/subscription/send-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription_id: subId }),
          })
        } catch (e) { console.warn('Invoice notification failed (non-fatal):', e.message) }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSubscribing(false)
    }
  }

  // ── Record payment ─────────────────────────────────────────
  const handlePayment = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) { setError('Enter a valid amount'); return }
    if (!payRef.trim()) { setError('Transaction reference is required'); return }
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
      // Send receipt notification (email + SMS) — non-blocking
      try {
        await fetch('/api/subscription/payment-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_id: payingInvoiceId,
            receipt_id: result.receipt_id,
            receipt_number: result.receipt_number,
            amount_paid: result.amount_paid,
            payment_method: payMethod,
            transaction_ref: payRef || null,
          }),
        })
      } catch (e) { console.warn('Receipt notification failed (non-fatal):', e.message) }
    } catch (e) {
      setError(e.message)
    } finally {
      setPaying(false)
    }
  }

  // ── M-Pesa STK Push handler ─────────────────────────────────
  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (stkPollRef.current) {
        clearInterval(stkPollRef.current)
        stkPollRef.current = null
      }
    }
  }, [])

  const handleMpesaPay = async (invoiceId, amount) => {
    if (!mpesaPhone.trim()) { setError('Enter your M-Pesa phone number'); return }
    setStkState('initiating'); setStkError(''); setError('')

    // Clear any previous polling interval
    if (stkPollRef.current) {
      clearInterval(stkPollRef.current)
      stkPollRef.current = null
    }

    try {
      const res = await fetch('/api/payments/mpesa/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, phoneNumber: mpesaPhone.trim(), amount }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initiate M-Pesa payment')
      }

      setStkCheckoutId(data.checkoutRequestId)
      setStkState('waiting')

      // Poll for result every 3 seconds, max 120 seconds
      // Uses ref-tracked variable to avoid stale closure on stkState
      let elapsed = 0
      let resolved = false
      const pollId = setInterval(async () => {
        if (resolved) return
        elapsed += 3000
        try {
          const statusRes = await fetch('/api/payments/mpesa/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkoutRequestId: data.checkoutRequestId }),
          })
          const status = await statusRes.json()

          if (status.status === 'verified') {
            resolved = true
            clearInterval(pollId)
            stkPollRef.current = null
            setStkState('success')
            setStkReceipt(status.mpesaReceipt)
            setSuccess(status.mpesaReceipt
              ? `Payment confirmed! Receipt: ${status.mpesaReceipt}`
              : 'Payment confirmed! Your subscription is now active.')
            setPayingInvoiceId(null); setMpesaPhone('')
            await loadAll()
          } else if (status.status === 'failed') {
            resolved = true
            clearInterval(pollId)
            stkPollRef.current = null
            setStkState('failed')
            setStkError(status.resultDesc || 'Payment was not completed')
          }
          // 'callback_received' = payment received, still processing → keep polling
          // 'pending' = waiting for user or callback → keep polling
        } catch { /* polling error — keep trying */ }

        if (!resolved && elapsed >= 120000) {
          resolved = true
          clearInterval(pollId)
          stkPollRef.current = null
          setStkState('timeout')
          setStkError('Payment confirmation timed out. If you completed the payment, it will be processed shortly — check back in a moment.')
        }
      }, 3000)

      stkPollRef.current = pollId
    } catch (e) {
      setStkState('failed')
      setStkError(e.message)
    }
  }

  const resetStkState = () => {
    if (stkPollRef.current) {
      clearInterval(stkPollRef.current)
      stkPollRef.current = null
    }
    setStkState('idle'); setStkError(''); setStkCheckoutId(null); setStkReceipt(null)
  }

  // ── Card Payment handler (Paystack) ────────────────────────────
  const resetCardState = () => {
    setCardState('idle'); setCardError(''); setCardReceipt(null)
  }

  const handleCardPay = async (invoiceId) => {
    const email = subscriberProfile?.email
    if (!email) { setError('Email address is required for card payments'); return }

    setCardState('initiating'); setCardError(''); setError('')

    try {
      // 1. Initialize Paystack transaction via our backend
      const res = await fetch('/api/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, email }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initialize card payment')
      }

      // 2. Load Paystack inline popup script if not loaded
      await loadPaystackScript()

      // 3. Open Paystack popup
      const popup = new window.PaystackPop()
      popup.newTransaction({
        key: data.publicKey,
        email,
        amount: data.amountKes * 100, // kobo
        currency: 'KES',
        ref: data.reference,
        onSuccess: async (transaction) => {
          // 4. Verify with our backend
          try {
            const verifyRes = await fetch('/api/payments/paystack/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference: transaction.reference || data.reference }),
            })
            const verifyData = await verifyRes.json()
            if (verifyRes.ok && verifyData.success) {
              setCardState('success')
              setCardReceipt(verifyData.receiptNumber || verifyData.paymentRef)
              const cardInfo = verifyData.cardLast4 ? ` (****${verifyData.cardLast4})` : ''
              setSuccess(`Payment confirmed!${cardInfo} Ref: ${verifyData.paymentRef || verifyData.reference}`)
              setPayingInvoiceId(null)
              await loadAll()
            } else {
              throw new Error(verifyData.error || 'Payment verification failed')
            }
          } catch (verifyErr) {
            setCardState('failed')
            setCardError(verifyErr.message)
          }
        },
        onCancel: () => {
          setCardState('idle')
        },
        onError: (err) => {
          setCardState('failed')
          setCardError(err?.message || 'Payment failed. Please try again.')
        },
      })
    } catch (e) {
      setCardState('failed')
      setCardError(e.message)
    }
  }

  // Load Paystack inline.js script dynamically
  const loadPaystackScript = () => {
    return new Promise((resolve, reject) => {
      if (window.PaystackPop) { resolve(); return }
      const s = document.createElement('script')
      s.src = 'https://js.paystack.co/v2/inline.js'
      s.onload = resolve
      s.onerror = () => reject(new Error('Failed to load payment gateway'))
      document.head.appendChild(s)
    })
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
        <div id="subscription-toast" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> <p className="flex-1">{error}</p>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div id="subscription-toast" className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-start gap-2">
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
                {fmtInv(Number(activeSub.package_cost) + Number(activeSub.shop_addon_amount || 0), activeSub.currency_symbol, activeSub.currency_code)}
              </p>
              {Number(activeSub.shop_addon_amount) > 0 && (
                <p className="text-[10px] text-blue-600">
                  Base: {fmtInv(activeSub.package_cost, activeSub.currency_symbol, activeSub.currency_code)} + Shops: {fmtInv(activeSub.shop_addon_amount, activeSub.currency_symbol, activeSub.currency_code)}
                </p>
              )}
            </div>
            {Number(activeSub.shop_count) > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium">Shops</p>
                <p className="text-sm font-semibold text-gray-900">{activeSub.shop_count} shop{activeSub.shop_count > 1 ? 's' : ''}</p>
                <p className="text-[10px] text-gray-400">1 free + {Math.max(0, activeSub.shop_count - 1)} paid</p>
              </div>
            )}
          </div>

          {/* ── Utilization breakdown ──────────────────────── */}
          {metrics && (
            <div className="px-6 pb-5 space-y-3">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Plan Utilization</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

                {/* Vehicles — individual & company */}
                {(subscriberType === 'individual' || subscriberType === 'company') && (
                  <UtilizationCard
                    icon={<Car size={14} />}
                    label="Vehicles"
                    current={metrics.vehicle_count || 0}
                    max={activeSub.max_vehicles}
                    colorClass="blue"
                  />
                )}

                {/* Staff — company & provider */}
                {(subscriberType === 'company' || subscriberType === 'service_provider') && (
                  <UtilizationCard
                    icon={<Users size={14} />}
                    label="Staff"
                    current={metrics.staff_count || 0}
                    max={activeSub.max_users}
                    colorClass="purple"
                  />
                )}

                {/* Work orders/month — provider */}
                {subscriberType === 'service_provider' && (
                  <UtilizationCard
                    icon={<FileText size={14} />}
                    label="Work Orders / mo"
                    current={metrics.monthly_client_count || 0}
                    max={activeSub.max_clients}
                    colorClass="green"
                  />
                )}

                {/* Shops — provider */}
                {subscriberType === 'service_provider' && (
                  <UtilizationCard
                    icon={<Building2 size={14} />}
                    label="Shops"
                    current={providerShops.length}
                    max={Math.max(Number(activeSub?.shop_count || 0), 1)}
                    colorClass="amber"
                  />
                )}
              </div>
            </div>
          )}

          {/* Shop list for providers */}
          {subscriberType === 'service_provider' && (
            <div className="px-6 pb-5">
              <p className="text-xs text-gray-500 font-medium mb-2">
                Subscribed Shops
                <span className="text-gray-400 ml-1">
                  ({providerShops.length} active of {Math.max(Number(activeSub?.shop_count || 0), 1)} capacity)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {/* Actual shops */}
                {providerShops.map((shop, i) => {
                  const capacity = Math.max(Number(activeSub?.shop_count || 0), 1)
                  const isCovered = i < capacity
                  return (
                    <span key={shop.id}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${
                        isCovered ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-red-50 border-red-200 text-red-600'
                      }`}>
                      <Building2 size={11} />
                      {shop.name}
                      {i === 0 && <span className="text-[9px] font-bold text-green-600">(free)</span>}
                      {!isCovered && <span className="text-[9px]">(not covered)</span>}
                    </span>
                  )
                })}
                {/* Available empty slots */}
                {Array.from({ length: Math.max(0, Math.max(Number(activeSub?.shop_count || 0), 1) - providerShops.length) }).map((_, i) => (
                  <span key={`slot-${i}`}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400">
                    <Building2 size={11} />
                    Available slot
                  </span>
                ))}
              </div>
              {providerShops.length > Math.max(Number(activeSub?.shop_count || 0), 1) && (
                <p className="text-[10px] text-amber-600 mt-2">
                  ⚠ You have {providerShops.length - Math.max(Number(activeSub?.shop_count || 0), 1)} shop(s) not covered by your current plan.
                  Consider upgrading your shop count.
                </p>
              )}
              {providerShops.length < Math.max(Number(activeSub?.shop_count || 0), 1) && (
                <p className="text-[10px] text-blue-500 mt-2">
                  You can add {Math.max(Number(activeSub?.shop_count || 0), 1) - providerShops.length} more shop(s) within your current plan.
                </p>
              )}
            </div>
          )}
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
          { id: 'invoices',  label: 'Invoices',  icon: FileText },
          { id: 'receipts',  label: 'Receipts',  icon: Receipt },
          ...(subscriberType !== 'individual' ? [{ id: 'tickets', label: 'Tickets', icon: MessageSquarePlus }] : []),
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
                      {fmtInv(invoices.reduce((sum, i) => sum + Number(i.total_paid || 0), 0), activeSub.currency_symbol, activeSub.currency_code)}
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
                    <button onClick={() => setView('invoices')}
                      className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1">
                      View invoices <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setView('invoices')}
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

          {/* ── Free tier card for individual (from DB, not hardcoded) ── */}
          {subscriberType === 'individual' && (
            <div className="rounded-2xl border border-green-200 bg-green-50/40 p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-bold text-gray-900">{freeTier?.tier_name || 'Free'}</span>
                    <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">FOREVER FREE</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{freeTier?.description || 'Basic vehicle tracking for your first car — no payment needed.'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {((() => { try { return typeof freeTier?.features === 'string' ? JSON.parse(freeTier.features) : (freeTier?.features || ['1 vehicle included', 'View service history', 'Basic notifications', 'Find nearby garages']) } catch { return ['1 vehicle included', 'View service history', 'Basic notifications', 'Find nearby garages'] } })()).map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-100/60 px-2 py-0.5 rounded-full">
                        <Check size={10} /> {f}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-green-600">Free</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{freeTier?.max_vehicles_included || freeTier?.free_vehicle_count || 1} vehicle{(freeTier?.max_vehicles_included || 1) > 1 ? 's' : ''} · no expiry</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Trial banner for Basic Plus ── */}
          {subscriberType === 'individual' && trialInfo?.is_eligible && trialInfo?.trial_months > 0 && !hasActive && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Sparkles size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {trialInfo.trial_months}-month Basic Plus trial included!
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {trialInfo.reason}
                  {trialInfo.trial_expires_at && ` · Expires ${fmtD(trialInfo.trial_expires_at)}`}
                </p>
              </div>
            </div>
          )}

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

          {/* Currency selector */}
          {availableCurrencies.length > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Globe size={14} className="text-gray-400" />
              <select value={displayCurrency} onChange={e => setDisplayCurrency(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                {availableCurrencies.map(c => (
                  <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.display_name}</option>
                ))}
              </select>
              {rateLoading && <Loader2 size={12} className="animate-spin text-gray-400" />}
            </div>
          )}

          {/* ── Shop selector for service providers ── */}
          {subscriberType === 'service_provider' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={16} className="text-blue-600" />
                <p className="text-sm font-semibold text-gray-900">Shop Capacity</p>
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">1st shop free</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Your first shop is included free with any plan. Additional shops are charged per-shop monthly.
                Select how many shops your subscription should cover — you can add shops up to this limit later.
              </p>

              {/* Shop count stepper */}
              <div className="flex items-center gap-4 mb-3">
                {(() => {
                  const activeSub = subscriptions.find(s => s.is_currently_active)
                  const minShops = Math.max(Number(activeSub?.shop_count || 0), 1)
                  const atMin = selectedShopCount <= minShops
                  return (
                    <>
                      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                        <button onClick={() => {
                          const n = Math.max(minShops, selectedShopCount - 1)
                          setSelectedShopCount(n)
                          supabase.rpc('compute_shop_addon', { p_shop_count: n }).then(({ data }) => {
                            if (data?.[0]) setShopAddon(data[0])
                            else if (data) setShopAddon(data)
                          })
                        }} disabled={atMin}
                          className="px-3 py-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors text-sm font-bold">−</button>
                        <span className="px-4 py-2 text-sm font-bold text-gray-900 border-x border-gray-200 min-w-[48px] text-center">
                          {selectedShopCount}
                        </span>
                        <button onClick={() => {
                          const n = selectedShopCount + 1
                          setSelectedShopCount(n)
                          supabase.rpc('compute_shop_addon', { p_shop_count: n }).then(({ data }) => {
                            if (data?.[0]) setShopAddon(data[0])
                            else if (data) setShopAddon(data)
                          })
                        }}
                          className="px-3 py-2 text-gray-500 hover:bg-gray-100 transition-colors text-sm font-bold">+</button>
                      </div>
                      <div className="text-xs text-gray-500">
                        <span>shop{selectedShopCount > 1 ? 's' : ''} in your plan</span>
                        {providerShops.length > 0 && (
                          <span className="text-gray-400"> · {providerShops.length} currently active</span>
                        )}
                        {activeSub && minShops > 1 && (
                          <span className="text-amber-500 block text-[10px]">Min {minShops} shops (cannot reduce until plan expires)</span>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Current shops */}
              {providerShops.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {providerShops.map((shop, i) => (
                    <span key={shop.id}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-blue-50 border-blue-200 text-blue-700 font-medium">
                      <Building2 size={11} />
                      {shop.name}
                      {i === 0 && <span className="text-[9px] font-bold text-green-600">(free)</span>}
                    </span>
                  ))}
                  {selectedShopCount > providerShops.length && (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400">
                      +{selectedShopCount - providerShops.length} future shop{selectedShopCount - providerShops.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              {/* Addon pricing summary */}
              {shopAddon && selectedShopCount > 1 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs">
                  <div className="flex justify-between text-blue-700">
                    <span>Shop addon ({shopAddon.billable_shops} extra × {shopAddon.is_flat_rate ? 'flat rate' : fmt(shopAddon.per_shop_price, displaySymbol) + '/mo each'})</span>
                    <span className="font-bold">+{fmt(shopAddon.shop_monthly_addon, displaySymbol)}/mo</span>
                  </div>
                  <p className="text-blue-500 mt-1">This addon is added to each plan&apos;s base price below.</p>
                </div>
              )}
            </div>
          )}

          {!currencyReady ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.filter(p => p.billing_period_code === selectedPeriod && Number(p.cost) > 0).map(p => {
              const features = (() => { try { return typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []) } catch { return [] } })()
              const isBasicPlus = (p.name || '').toLowerCase().includes('basic plus')
              const isRecommended = isBasicPlus
              const isCustomPlan = p.is_custom === true
              const hasActiveTrial = isBasicPlus && trialInfo?.is_eligible && trialInfo?.trial_months > 0
              return (
                <div key={p.id} className={`rounded-xl border p-5 flex flex-col shadow-sm hover:shadow-md transition-all ${
                  isCustomPlan ? 'border-purple-300 bg-purple-50/30 ring-1 ring-purple-200'
                  : isRecommended ? 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-200' : 'border-gray-200 bg-white'
                }`}>
                  {isCustomPlan && (
                    <span className="self-start inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 mb-3">
                      <Sparkles size={10} /> CUSTOM PLAN
                    </span>
                  )}
                  {isRecommended && !isCustomPlan && (
                    <span className="self-start inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 mb-3">
                      <Sparkles size={10} /> RECOMMENDED
                    </span>
                  )}
                  {hasActiveTrial && (
                    <span className="self-start inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 mb-2">
                      <Clock size={10} /> {trialInfo.trial_months}-MONTH FREE TRIAL
                    </span>
                  )}
                  <h3 className="text-base font-bold text-gray-900 mb-1">{p.name}</h3>
                  <p className="text-xs text-gray-500 mb-4">{p.description}</p>

                  <div className="mb-4">
                    {hasActiveTrial ? (
                      <div>
                        <span className="text-2xl font-black text-green-600">Free</span>
                        <span className="text-sm text-gray-400 ml-2 line-through">{displaySymbol}{cv(p.cost).toLocaleString()}</span>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Free for {trialInfo.trial_months} months, then {displaySymbol}{cv(p.monthly_equivalent_cost).toFixed(2)}/mo
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-2xl font-black text-gray-900">{displaySymbol}{cv(p.cost + (subscriberType === 'service_provider' && shopAddon ? shopAddon.shop_monthly_addon * (p.billing_period_duration || 1) : 0)).toLocaleString()}</span>
                        <span className="text-sm text-gray-400 ml-1">/{p.billing_period_name?.toLowerCase()}</span>
                        {subscriberType === 'service_provider' && shopAddon && shopAddon.shop_monthly_addon > 0 && (
                          <p className="text-[10px] text-blue-600 mt-0.5">
                            Base: {displaySymbol}{cv(p.cost).toLocaleString()} + Shops: {displaySymbol}{cv(shopAddon.shop_monthly_addon * (p.billing_period_duration || 1)).toLocaleString()}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          ≈ {displaySymbol}{cv(p.monthly_equivalent_cost + (subscriberType === 'service_provider' && shopAddon ? shopAddon.shop_monthly_addon : 0)).toFixed(2)}/mo
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap mb-3">
                    {p.max_vehicles && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.max_vehicles} vehicle{p.max_vehicles > 1 ? 's' : ''}</span>}
                    {p.max_users && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.max_users} users</span>}
                    {p.max_shops && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded">{selectedShopCount} shop{selectedShopCount > 1 ? 's' : ''}</span>}
                  </div>

                  <ul className="flex-1 space-y-1.5 mb-4">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <Check size={12} className={`mt-0.5 flex-shrink-0 ${isBasicPlus ? 'text-blue-500' : 'text-green-500'}`} /> {f}
                      </li>
                    ))}
                  </ul>

                  <button onClick={() => handleSubscribe(p.id)} disabled={subscribing}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${
                      isRecommended ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}>
                    {subscribing ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    {hasActiveTrial ? 'Start Free Trial' : isBasicPlus ? 'Unlock Basic Plus' : 'Subscribe'}
                  </button>
                </div>
              )
            })}
          </div>
          {packages.filter(p => p.billing_period_code === selectedPeriod && Number(p.cost) > 0).length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No paid packages available for this period. Try another billing cycle.</p>
          )}

          {/* Custom package request note */}
          {subscriberType !== 'individual' && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 mt-4 flex items-start gap-3">
              <MessageSquarePlus size={18} className="text-purple-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-gray-800">
                  Need a plan tailored to your specific requirements?{' '}
                  <button onClick={() => setShowTicketModal(true)}
                    className="text-purple-700 font-semibold underline underline-offset-2 hover:text-purple-900 transition-colors">
                    Request a custom package
                  </button>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Describe your needs and our team will create a customized subscription plan for you.
                </p>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* ═══ TICKETS ═══ */}
      {view === 'tickets' && subscriberType !== 'individual' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowTicketModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors">
              <MessageSquarePlus size={14} /> New Request
            </button>
          </div>

          {tickets.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <MessageSquarePlus size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No tickets yet.</p>
              <p className="text-xs text-gray-400 mt-1">Submit a request for a custom subscription package.</p>
            </div>
          ) : (
            tickets.map(t => {
              const statusColors = {
                open: 'bg-yellow-100 text-yellow-800',
                in_review: 'bg-blue-100 text-blue-800',
                resolved: 'bg-green-100 text-green-800',
                declined: 'bg-red-100 text-red-800',
                cancelled: 'bg-gray-100 text-gray-600',
              }
              return (
                <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded">{t.ticket_number}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusColors[t.status] || 'bg-gray-100 text-gray-600'}`}>
                          {t.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">{t.subject}</h3>
                    </div>
                    <p className="text-[10px] text-gray-400 whitespace-nowrap">{fmtD(t.created_at)}</p>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{t.description}</p>

                  {/* Requested metrics */}
                  {(t.requested_vehicles || t.requested_staff || t.requested_monthly_clients || t.requested_shops || t.requested_billing_period) && (
                    <div className="flex flex-wrap gap-1.5">
                      {t.requested_vehicles && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.requested_vehicles} vehicles</span>}
                      {t.requested_staff && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.requested_staff} staff</span>}
                      {t.requested_monthly_clients && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.requested_monthly_clients} clients/mo</span>}
                      {t.requested_shops && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{t.requested_shops} shops</span>}
                      {t.requested_billing_period && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">{t.requested_billing_period.replace(/_/g, ' ')}</span>}
                    </div>
                  )}

                  {/* Admin response */}
                  {t.admin_notes && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <p className="text-[10px] text-blue-500 font-medium uppercase mb-1">Admin Response</p>
                      <p className="text-xs text-blue-800">{t.admin_notes}</p>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ═══ INVOICES ═══ */}
      {view === 'invoices' && (
        <div className="space-y-4">
          {invoices.filter(i => Number(i.total_amount) > 0).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <FileText size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No invoices yet. Subscribe to a paid plan to receive your first invoice.</p>
            </div>
          ) : (
            invoices.filter(i => Number(i.total_amount) > 0).map(inv => {
              const isExpanded = expandedInvoice === inv.id
              const isPaid = inv.invoice_status_code === 'paid'
              const isPayingThis = payingInvoiceId === inv.id

              const buildInvoiceArgs = () => ({
                  invoiceRef: inv.invoice_ref_no,
                  subscriptionNumber: inv.subscription_number,
                  packageName: inv.package_name || 'Subscription',
                  subscriberName: subscriberProfile?.name || null,
                  subscriberEmail: subscriberProfile?.email || null,
                  subscriberPhone: subscriberProfile?.phone || null,
                  billingStart: inv.billing_period_start,
                  billingEnd: inv.billing_period_end,
                  issuedAt: inv.created_at,
                  dueDate: inv.due_date,
                  amountDue: inv.amount_due || inv.total_amount,
                  taxAmount: inv.tax_amount || 0,
                  totalAmount: inv.total_amount,
                  grossAmount: inv.gross_amount || inv.total_amount,
                  upgradeCredit: Number(inv.upgrade_credit || 0),
                  upgradeNotes: inv.upgrade_notes || null,
                  currencySymbol: inv.currency_symbol || '',
                  status: inv.effective_status || 'unpaid',
                  shopCount: Number(inv.shop_count || 0),
                  shopAddonAmount: Number(inv.shop_addon_amount || 0),
                  ctaUrl: `${window.location.origin}${subscriptionPath}?view=invoices&invoice=${inv.id}`,
                })

              const viewInvoice = () => {
                const w = window.open('', '_blank')
                w.document.write(buildSubscriptionInvoiceHtml({ ...buildInvoiceArgs(), forPdf: false }))
                w.document.close()
              }

              const downloadInvoice = async () => {
                setDownloadingId(inv.id)
                try { await downloadHtmlAsPdf(buildSubscriptionInvoiceHtml({ ...buildInvoiceArgs(), forPdf: true }), `Invoice-${inv.invoice_ref_no}`) }
                catch (e) { console.error('PDF download error:', e) }
                finally { setDownloadingId(null) }
              }

              return (
                <div key={inv.id} id={`invoice-${inv.id}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <button onClick={() => setExpandedInvoice(isExpanded ? null : inv.id)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isPaid ? 'bg-green-100' : 'bg-yellow-100'}`}>
                        <FileText size={16} className={isPaid ? 'text-green-600' : 'text-yellow-600'} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{inv.invoice_ref_no}</p>
                        <p className="text-xs text-gray-500">{inv.package_name && `${inv.package_name} · `}Due: {fmtD(inv.due_date)} · {inv.subscription_number}</p>
                        {Number(inv.upgrade_credit) > 0 && (
                          <p className="text-[10px] text-green-600 font-medium mt-0.5">↗ Upgrade credit: {fmtInv(inv.upgrade_credit, inv.currency_symbol, inv.currency_code)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{fmtInv(inv.total_amount, inv.currency_symbol, inv.currency_code)}</p>
                        {invConverted(inv.currency_code) && (
                          <p className="text-[10px] text-gray-400">{fmt(inv.total_amount, inv.currency_symbol)} original</p>
                        )}
                        {!isPaid && inv.balance_due > 0 && (
                          <p className="text-xs text-red-500">Balance: {fmtInv(inv.balance_due, inv.currency_symbol, inv.currency_code)}</p>
                        )}
                        {!isPaid && inv.due_date && (
                          <p className="text-[10px] text-amber-500">Expires: {fmtD(inv.due_date)}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.effective_status] || 'bg-gray-100'}`}>
                        {inv.effective_status}
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                      {/* Package & subscriber info */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Package</p>
                          <p className="font-semibold">{inv.package_name || inv.subscription_number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Billing Period</p>
                          <p className="font-semibold">{fmtD(inv.billing_period_start)} – {fmtD(inv.billing_period_end)}</p>
                        </div>
                      </div>

                      {/* Pricing breakdown */}
                      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                        {(() => {
                          const isShopOnly = Number(inv.shop_addon_amount) > 0 && Number(inv.upgrade_credit || 0) === 0 && (inv.upgrade_notes || '').includes('Shop upgrade')
                          return <>
                            {!isShopOnly && (Number(inv.upgrade_credit) > 0 || Number(inv.shop_addon_amount) > 0) && inv.gross_amount && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Package Price</span>
                                <span className="font-semibold">{fmtInv(Number(inv.gross_amount) - Number(inv.shop_addon_amount || 0), inv.currency_symbol, inv.currency_code)}</span>
                              </div>
                            )}
                            {Number(inv.shop_addon_amount) > 0 && (
                              <div className="flex justify-between text-sm text-blue-600">
                                <span>{isShopOnly ? 'Shop Addon Upgrade' : 'Shop Addon'} ({inv.shop_count} shops · 1 free + {Math.max(0, inv.shop_count - 1)} paid)</span>
                                <span className="font-semibold">{isShopOnly ? fmtInv(inv.amount_due, inv.currency_symbol, inv.currency_code) : fmtInv(inv.shop_addon_amount, inv.currency_symbol, inv.currency_code)}</span>
                              </div>
                            )}
                            {isShopOnly && inv.upgrade_notes && (
                              <p className="text-[10px] text-blue-500">{inv.upgrade_notes}</p>
                            )}
                            {Number(inv.upgrade_credit) > 0 && (
                              <div className="flex justify-between text-sm text-green-600">
                                <span>Upgrade Credit</span>
                                <span className="font-semibold">−{fmtInv(inv.upgrade_credit, inv.currency_symbol, inv.currency_code)}</span>
                              </div>
                            )}
                            {Number(inv.upgrade_credit) > 0 && !isPaid && (
                              <p className="text-[10px] text-green-500 italic">Credit is recalculated at payment time based on actual remaining days. Pay sooner for a higher credit.</p>
                            )}
                          </>
                        })()}
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Amount Due</span>
                          <span className="font-semibold">{fmtInv(inv.amount_due, inv.currency_symbol, inv.currency_code)}</span>
                        </div>
                        {!isPaid && inv.due_date && (
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-1">
                            <p className="text-[10px] text-amber-700">
                              <strong>24-hour expiry:</strong> This invoice must be paid by {fmtD(inv.due_date)}. Unpaid invoices expire automatically and the subscription will be cancelled. You may re-subscribe after expiry.
                            </p>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Tax</span>
                          <span className="font-semibold">{fmtInv(inv.tax_amount, inv.currency_symbol, inv.currency_code)}</span>
                        </div>
                        <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                          <span className="font-bold text-gray-900">Total</span>
                          <span className="font-bold text-gray-900">{fmtInv(inv.total_amount, inv.currency_symbol, inv.currency_code)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-green-700">Total Paid</span>
                          <span className="font-semibold text-green-700">{fmtInv(inv.total_paid, inv.currency_symbol, inv.currency_code)}</span>
                        </div>
                        {Number(inv.balance_due) > 0 && (
                          <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                            <span className="font-bold text-red-600">Balance Due</span>
                            <span className="font-bold text-red-600">{fmtInv(inv.balance_due, inv.currency_symbol, inv.currency_code)}</span>
                          </div>
                        )}
                      </div>

                      {Number(inv.upgrade_credit) > 0 && inv.upgrade_notes && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                          <p className="text-xs font-semibold text-green-800 mb-1">↗ Upgrade Credit Applied</p>
                          <p className="text-xs text-green-700">{inv.upgrade_notes}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button onClick={viewInvoice}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                          <FileText size={14} /> View Invoice
                        </button>
                        <button onClick={downloadInvoice} disabled={downloadingId === inv.id}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                          {downloadingId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          {downloadingId === inv.id ? 'Generating…' : 'Download PDF'}
                        </button>
                      </div>

                      {!isPaid && (
                        <div>
                          {!isPayingThis ? (
                            <button onClick={() => { setPayingInvoiceId(inv.id); setPayAmount(inv.balance_due?.toString() || inv.total_amount?.toString()) }}
                              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-900 hover:text-gray-900 font-medium transition-colors">
                              <CreditCard size={15} /> Record Payment
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-gray-200 overflow-hidden">
                              <div className="bg-gray-900 px-5 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CreditCard size={14} className="text-amber-400" />
                                  <span className="text-white font-semibold text-sm">Record Payment</span>
                                </div>
                                {invConverted(inv.currency_code) && (
                                  <span className="text-amber-300 text-xs font-medium">
                                    ≈ {fmtC(inv.balance_due || inv.total_amount)}
                                  </span>
                                )}
                              </div>
                              <div className="p-5 space-y-4 bg-white">
                                {invConverted(inv.currency_code) && (
                                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
                                    Invoice amount: {fmt(inv.balance_due || inv.total_amount, inv.currency_symbol)} ({inv.currency_code})
                                    {' '}≈ {fmtC(inv.balance_due || inv.total_amount)} ({displayCurrency})
                                  </div>
                                )}
                                <div className="grid grid-cols-4 gap-2">
                                  {PAYMENT_METHODS
                                    .filter(m => !paymentAccounts || paymentAccounts[m.accountKey]?.enabled !== false)
                                    .map(m => (
                                    <button key={m.value} onClick={() => setPayMethod(m.value)}
                                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                        payMethod === m.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                                      }`}>
                                      <m.icon size={15} /> {m.label}
                                    </button>
                                  ))}
                                </div>

                                {/* Payment account details */}
                                {paymentAccounts && paymentAccounts[PAYMENT_METHODS.find(m => m.value === payMethod)?.accountKey] && (
                                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs space-y-1.5">
                                    {payMethod === 'mpesa' && paymentAccounts.mpesa?.paybill_number && (
                                      <>
                                        {paymentAccounts.mpesa.business_name && (
                                          <p className="font-semibold text-gray-800">{paymentAccounts.mpesa.business_name}</p>
                                        )}
                                        <div className="flex gap-4">
                                          <div>
                                            <span className="text-gray-500">Paybill: </span>
                                            <span className="font-bold text-gray-900 select-all">{paymentAccounts.mpesa.paybill_number}</span>
                                          </div>
                                          <div>
                                            <span className="text-gray-500">Account: </span>
                                            <span className="font-bold text-gray-900 select-all">{paymentAccounts.mpesa.account_number}</span>
                                          </div>
                                        </div>
                                        {paymentAccounts.mpesa.instructions && (
                                          <p className="text-gray-500">{paymentAccounts.mpesa.instructions}</p>
                                        )}
                                      </>
                                    )}
                                    {payMethod === 'bank_transfer' && (
                                      <>
                                        {paymentAccounts.bank?.show_details && paymentAccounts.bank?.bank_name ? (
                                          <>
                                            <p className="font-semibold text-gray-800">{paymentAccounts.bank.account_name || paymentAccounts.bank.bank_name}</p>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                              <div><span className="text-gray-500">Bank: </span><span className="font-bold text-gray-900">{paymentAccounts.bank.bank_name}</span></div>
                                              <div><span className="text-gray-500">Account: </span><span className="font-bold text-gray-900 select-all">{paymentAccounts.bank.account_number}</span></div>
                                              {paymentAccounts.bank.branch && (
                                                <div><span className="text-gray-500">Branch: </span><span className="text-gray-900">{paymentAccounts.bank.branch}</span></div>
                                              )}
                                              {paymentAccounts.bank.swift_code && (
                                                <div><span className="text-gray-500">Swift: </span><span className="text-gray-900 select-all">{paymentAccounts.bank.swift_code}</span></div>
                                              )}
                                            </div>
                                            {paymentAccounts.bank.instructions && (
                                              <p className="text-gray-500">{paymentAccounts.bank.instructions}</p>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-gray-600">{paymentAccounts.bank?.instructions || 'Bank details will be shared individually.'}</p>
                                        )}
                                      </>
                                    )}
                                    {payMethod === 'cash' && paymentAccounts.cash?.instructions && (
                                      <p className="text-gray-600">{paymentAccounts.cash.instructions}</p>
                                    )}
                                    {payMethod === 'card' && paymentAccounts.card?.instructions && (
                                      <p className="text-gray-600">{paymentAccounts.card.instructions}</p>
                                    )}
                                  </div>
                                )}

                                {/* ── Manual payment recording (all methods) ── */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                                      Amount ({inv.currency_code})
                                    </label>
                                    <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inp} />
                                    {invConverted(inv.currency_code) && payAmount && (
                                      <p className="text-[10px] text-gray-400 mt-1">≈ {fmtC(payAmount)}</p>
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Transaction Ref <span className="text-red-500">*</span></label>
                                    <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="e.g. QXZ12345" required className={inp} />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Notes (optional)</label>
                                  <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className={inp} />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={handlePayment} disabled={paying || !payRef.trim()}
                                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
                                    {paying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} Record Payment
                                  </button>
                                  <button onClick={() => { setPayingInvoiceId(null); resetStkState(); resetCardState() }}
                                    className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
                                </div>
                                {payMethod === 'mpesa' && (
                                  <p className="text-[10px] text-gray-400">Recording a manual payment requires admin confirmation of receipt.</p>
                                )}

                                {/* ── M-Pesa STK Push — instant payment ── */}
                                {payMethod === 'mpesa' && (!paymentAccounts || paymentAccounts.mpesa_stk?.enabled !== false) && (
                                  <>
                                    <div className="flex items-center gap-3 my-2">
                                      <div className="flex-1 border-t border-gray-200" />
                                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">or pay instantly</span>
                                      <div className="flex-1 border-t border-gray-200" />
                                    </div>

                                    {stkState !== 'idle' ? (
                                      <div className="text-center py-4 space-y-3 bg-gray-50 rounded-xl">
                                        {stkState === 'initiating' && (
                                          <>
                                            <Loader2 size={32} className="animate-spin text-green-600 mx-auto" />
                                            <p className="text-sm font-medium text-gray-700">Sending payment request to your phone...</p>
                                          </>
                                        )}
                                        {stkState === 'waiting' && (
                                          <>
                                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                              <Smartphone size={28} className="text-green-600" />
                                            </div>
                                            <p className="text-sm font-semibold text-gray-800">Check your phone</p>
                                            <p className="text-xs text-gray-500">Enter your M-Pesa PIN to complete the payment</p>
                                            <Loader2 size={16} className="animate-spin text-gray-400 mx-auto" />
                                            <p className="text-[10px] text-gray-400">Waiting for confirmation...</p>
                                          </>
                                        )}
                                        {stkState === 'success' && (
                                          <>
                                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                              <BadgeCheck size={28} className="text-green-600" />
                                            </div>
                                            <p className="text-sm font-semibold text-green-700">Payment Confirmed!</p>
                                            {stkReceipt && <p className="text-xs text-gray-500">M-Pesa Receipt: {stkReceipt}</p>}
                                            <p className="text-[10px] text-green-600">Receipt auto-confirmed — no admin action needed.</p>
                                          </>
                                        )}
                                        {(stkState === 'failed' || stkState === 'timeout') && (
                                          <>
                                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                              <AlertCircle size={28} className="text-red-500" />
                                            </div>
                                            <p className="text-sm font-semibold text-red-700">
                                              {stkState === 'timeout' ? 'Request timed out' : 'Payment failed'}
                                            </p>
                                            <p className="text-xs text-gray-500">{stkError}</p>
                                            <button onClick={resetStkState}
                                              className="text-sm text-blue-600 font-medium hover:underline">Try again</button>
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="bg-green-50 border border-green-100 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                          <Smartphone size={16} className="text-green-700" />
                                          <span className="text-sm font-semibold text-green-800">M-Pesa STK Push</span>
                                          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Auto-confirmed</span>
                                        </div>
                                        <div>
                                          <label className="text-xs font-semibold text-gray-600 block mb-1.5">Phone Number</label>
                                          <input type="tel" value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)}
                                            placeholder="0712345678" className={inp} />
                                        </div>
                                        {invConverted(inv.currency_code) && (
                                          <p className="text-xs text-green-700">
                                            You will be prompted to pay <strong>KES {cv(inv.balance_due || inv.total_amount).toLocaleString()}</strong> on your phone
                                          </p>
                                        )}
                                        <button onClick={() => handleMpesaPay(inv.id, payAmount)}
                                          disabled={paying || !mpesaPhone.trim()}
                                          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                                          <Smartphone size={14} /> Pay with M-Pesa
                                        </button>
                                        <p className="text-[10px] text-green-600">Payment is verified automatically — no admin confirmation required.</p>
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* ── Card / Apple Pay — instant payment via Paystack ── */}
                                {(payMethod === 'card' || payMethod === 'apple_pay') && (
                                  <>
                                    <div className="flex items-center gap-3 my-2">
                                      <div className="flex-1 border-t border-gray-200" />
                                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">or pay instantly</span>
                                      <div className="flex-1 border-t border-gray-200" />
                                    </div>

                                    {cardState !== 'idle' ? (
                                      <div className="text-center py-4 space-y-3 bg-gray-50 rounded-xl">
                                        {cardState === 'initiating' && (
                                          <>
                                            <Loader2 size={32} className="animate-spin text-blue-600 mx-auto" />
                                            <p className="text-sm font-medium text-gray-700">Opening secure payment window...</p>
                                          </>
                                        )}
                                        {cardState === 'success' && (
                                          <>
                                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                              <BadgeCheck size={28} className="text-green-600" />
                                            </div>
                                            <p className="text-sm font-semibold text-green-700">Payment Confirmed!</p>
                                            {cardReceipt && <p className="text-xs text-gray-500">Ref: {cardReceipt}</p>}
                                            <p className="text-[10px] text-green-600">Receipt auto-confirmed — no admin action needed.</p>
                                          </>
                                        )}
                                        {cardState === 'failed' && (
                                          <>
                                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                              <AlertCircle size={28} className="text-red-500" />
                                            </div>
                                            <p className="text-sm font-semibold text-red-700">Payment failed</p>
                                            <p className="text-xs text-gray-500">{cardError}</p>
                                            <button onClick={resetCardState}
                                              className="text-sm text-blue-600 font-medium hover:underline">Try again</button>
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                          <CreditCard size={16} className="text-blue-700" />
                                          <span className="text-sm font-semibold text-blue-800">Card / Apple Pay</span>
                                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Auto-confirmed</span>
                                        </div>
                                        <p className="text-xs text-blue-600">
                                          Pay securely with Visa, Mastercard, or Apple Pay. M-Pesa GlobalPay virtual cards are also supported.
                                        </p>
                                        {(() => {
                                          const feePct = paymentAccounts?.card?.service_fee_pct ?? 3.5
                                          const subtotal = cv(inv.balance_due || inv.total_amount)
                                          const fee = Math.ceil(subtotal * feePct / 100)
                                          const total = subtotal + fee
                                          return invConverted(inv.currency_code) || inv.currency_code === 'KES' ? (
                                            <div className="bg-white rounded-lg p-2.5 text-xs space-y-1 border border-blue-100">
                                              <div className="flex justify-between text-blue-700">
                                                <span>Subtotal</span>
                                                <span>KES {subtotal.toLocaleString()}</span>
                                              </div>
                                              <div className="flex justify-between text-blue-500">
                                                <span>Service fee ({feePct}%)</span>
                                                <span>KES {fee.toLocaleString()}</span>
                                              </div>
                                              <div className="flex justify-between text-blue-900 font-semibold border-t border-blue-100 pt-1">
                                                <span>Total charge</span>
                                                <span>KES {total.toLocaleString()}</span>
                                              </div>
                                            </div>
                                          ) : null
                                        })()}
                                        <button onClick={() => handleCardPay(inv.id)}
                                          disabled={paying || cardState === 'initiating'}
                                          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                                          <CreditCard size={14} /> Pay with Card
                                        </button>
                                        <p className="text-[10px] text-blue-600">Payment is verified automatically — no admin confirmation required.</p>
                                      </div>
                                    )}
                                  </>
                                )}
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

      {/* ═══ RECEIPTS ═══ */}
      {view === 'receipts' && (
        <div className="space-y-4">
          {receipts.filter(r => Number(r.amount_paid) > 0).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <Receipt size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No receipts yet. Receipts are generated when payments are recorded.</p>
            </div>
          ) : (
            receipts.filter(r => Number(r.amount_paid) > 0).map(r => {
              const receiptHtml = () => buildSubscriptionReceiptHtml({
                  receiptNumber: r.receipt_number,
                  invoiceRef: r.invoice_ref_no || r.subscription_number || '—',
                  subscriptionNumber: r.subscription_number,
                  packageName: r.package_name || 'Subscription',
                  subscriberName: subscriberProfile?.name || r.subscriber_name || r.paid_by_name || null,
                  subscriberEmail: subscriberProfile?.email || null,
                  subscriberPhone: subscriberProfile?.phone || null,
                  amountPaid: r.amount_paid,
                  amountDue: r.amount_paid,
                  taxAmount: 0,
                  totalInvoice: r.amount_paid,
                  paymentMethod: r.payment_method,
                  transactionRef: r.payment_ref_id || r.transaction_ref,
                  paidAt: r.issued_at,
                  confirmed: r.confirmed,
                  confirmedAt: r.confirmed_at,
                  currencySymbol: r.currency_symbol || '',
                  shopCount: Number(r.shop_count || 0),
                  shopAddonAmount: Number(r.shop_addon_amount || 0),
                  notes: r.notes,
                })

              const viewReceipt = () => {
                const w = window.open('', '_blank')
                w.document.write(receiptHtml())
                w.document.close()
              }

              const downloadReceipt = async () => {
                setDownloadingId(r.id)
                try { await downloadHtmlAsPdf(receiptHtml(), `Receipt-${r.receipt_number}`) }
                catch (e) { console.error('PDF download error:', e) }
                finally { setDownloadingId(null) }
              }

              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${r.confirmed ? 'bg-green-100' : 'bg-amber-100'}`}>
                        <Receipt size={16} className={r.confirmed ? 'text-green-600' : 'text-amber-600'} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.receipt_number}</p>
                        <p className="text-xs text-gray-500">{fmtD(r.issued_at)} · {r.subscription_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">{(r.payment_method || '').replace('_', ' ')} {r.payment_ref_id || r.transaction_ref ? `· ${r.payment_ref_id || r.transaction_ref}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{fmtInv(r.amount_paid, r.currency_symbol, r.currency_code)}</p>
                        {invConverted(r.currency_code) && (
                          <p className="text-[10px] text-gray-400">{fmt(r.amount_paid, r.currency_symbol)} original</p>
                        )}
                        {Number(r.change_given) > 0 && (
                          <p className="text-[10px] text-gray-400">Change: {fmtInv(r.change_given, r.currency_symbol, r.currency_code)}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${r.confirmed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {r.confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                    <button onClick={viewReceipt}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      <Receipt size={14} /> View Receipt
                    </button>
                    <button onClick={downloadReceipt} disabled={downloadingId === r.id}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                      {downloadingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {downloadingId === r.id ? 'Generating…' : 'Download PDF'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Terms & Conditions Modal */}
      <SubscriptionTermsModal
        isOpen={!!termsModal}
        onClose={() => setTermsModal(null)}
        onAccept={executeSubscribe}
        packageName={termsModal?.packageName}
        packageCost={termsModal?.packageCost}
        isUpgrade={termsModal?.isUpgrade}
        upgradeCredit={termsModal?.upgradeCredit}
        currentPlan={termsModal?.currentPlan}
        loading={subscribing}
      />

      {subscriberType !== 'individual' && (
        <SubscriptionTicketModal
          isOpen={showTicketModal}
          onClose={() => setShowTicketModal(false)}
          onSubmitted={(res) => {
            // Refresh tickets list
            const ticketField = subscriberType === 'company' ? 'company_id' : 'service_provider_id'
            supabase.from('subscription_tickets').select('*').eq(ticketField, subscriberId)
              .order('created_at', { ascending: false }).then(({ data }) => setTickets(data || []))
          }}
          supabase={supabase}
          subscriberType={subscriberType}
          subscriberId={subscriberId}
          subscriberName={subscriberName}
        />
      )}
    </div>
  )
}