'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DollarSign, TrendingUp, Loader2, AlertCircle, ChevronDown,
  Store, Users, CreditCard, Building2, Receipt, Crown,
  ArrowUpRight, ArrowDownRight, Coins
} from 'lucide-react'

const PERIODS = [
  { value: '7',   label: 'Last 7 days'   },
  { value: '30',  label: 'Last 30 days'  },
  { value: '90',  label: 'Last 3 months' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last year'     },
]

const PAYMENT_COLORS = {
  cash:           { hex: '#22c55e', label: 'Cash'           },
  mpesa:          { hex: '#4ade80', label: 'M-Pesa'         },
  bank_transfer:  { hex: '#3b82f6', label: 'Bank Transfer'  },
  card:           { hex: '#8b5cf6', label: 'Card'           },
  cheque:         { hex: '#f59e0b', label: 'Cheque'         },
  credit:         { hex: '#ef4444', label: 'Credit'         },
  other:          { hex: '#6b7280', label: 'Other'          },
  Unknown:        { hex: '#9ca3af', label: 'Unknown'        },
}

function getPaymentColor(method) {
  return PAYMENT_COLORS[method] || PAYMENT_COLORS.Unknown
}

/* ── Reusable components ─────────────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, sub, trend, color = 'bg-green-100', iconColor = 'text-green-600' }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon size={20} className={iconColor} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {trend != null && (
        <p className={`text-xs font-medium mt-1 flex items-center gap-0.5 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(trend)}% vs prev period
        </p>
      )}
    </div>
  )
}

function DonutChart({ items, total, formatAmount }) {
  if (!items || items.length === 0 || total === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No data for this period.</p>
  }
  const size = 140, stroke = 20
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
          {items.map((item, i) => {
            const pct = item.value / total
            const dash = pct * circumference
            const gap = circumference - dash
            const cur = offset
            offset += dash
            return (
              <circle key={i} cx={size/2} cy={size/2} r={radius} fill="none"
                stroke={item.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-cur}
                strokeLinecap="butt" transform={`rotate(-90 ${size/2} ${size/2})`}
                className="transition-all duration-700" />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-bold text-gray-900">{formatAmount(total)}</p>
          <p className="text-[10px] text-gray-400">Total</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 w-full">
        {items.map((item, i) => {
          const pct = Math.round((item.value / total) * 100)
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-gray-600 truncate flex-1">{item.label}</span>
              <span className="font-semibold text-gray-900 flex-shrink-0">{formatAmount(item.value)}</span>
              <span className="text-xs text-gray-400 flex-shrink-0 w-8 text-right">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BarChart({ entries, formatAmount, color = '#22c55e', hoverColor = '#16a34a' }) {
  if (!entries || entries.length < 1) return null
  const max = Math.max(...entries.map(e => e.value), 1)

  return (
    <div className="overflow-x-auto pb-2 -mx-2 px-2" style={{ scrollbarWidth: 'thin' }}>
      <div className="flex items-end gap-1.5"
        style={{ minWidth: entries.length > 15 ? `${entries.length * 44}px` : '100%', height: '170px' }}>
        {entries.map((e, i) => {
          const barH = max > 0 ? Math.max(6, Math.round((e.value / max) * 130)) : 6
          return (
            <div key={i} className="flex flex-col items-center flex-1" style={{ minWidth: '38px' }}>
              <span className="text-[9px] text-gray-500 mb-1 font-medium whitespace-nowrap">
                {formatAmount(e.value).replace(/^[A-Z]{3}\s?/, '')}
              </span>
              <div className="w-full flex justify-center">
                <div className="w-7 rounded-t transition-colors cursor-default"
                  style={{ height: `${barH}px`, backgroundColor: color }}
                  onMouseEnter={ev => ev.target.style.backgroundColor = hoverColor}
                  onMouseLeave={ev => ev.target.style.backgroundColor = color}
                  title={`${e.label}: ${formatAmount(e.value)}`} />
              </div>
              <span className="text-[9px] text-gray-400 mt-1.5 whitespace-nowrap">{e.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────────────────── */

export default function ProviderRevenuePage() {
  const supabase = createClient()
  const [days, setDays] = useState('30')
  const [shopId, setShopId] = useState('all')
  const [customerId, setCustomerId] = useState('all')
  const [currencyFilter, setCurrencyFilter] = useState('all')
  const [shops, setShops] = useState([])
  const [data, setData] = useState(null)
  const [prevData, setPrevData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [providerId, setProviderId] = useState(null)

  useEffect(() => { init() }, [])
  useEffect(() => { if (providerId) loadRevenue() }, [days, shopId, customerId, providerId])

  const init = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { data: sp } = await supabase
        .from('service_providers').select('id').eq('owner_user_id', profile.id).single()
      if (!sp) { setError('Provider not found'); setLoading(false); return }
      setProviderId(sp.id)

      const { data: shopList } = await supabase
        .from('shops').select('id, name').eq('service_provider_id', sp.id).eq('is_active', true).order('name')
      setShops(shopList || [])
    } catch (err) { setError(err.message); setLoading(false) }
  }

  const loadRevenue = async () => {
    setLoading(true); setError('')
    try {
      const since = new Date(Date.now() - Number(days) * 86400000).toISOString()
      const prevSince = new Date(Date.now() - Number(days) * 2 * 86400000).toISOString()
      const shopFilter = shopId !== 'all' ? shopId : null
      const custFilter = customerId !== 'all' ? customerId : null

      const [{ data: current }, { data: prev }] = await Promise.all([
        supabase.rpc('get_provider_revenue', {
          p_provider_id: providerId, p_since: since,
          p_shop_id: shopFilter, p_customer_id: custFilter,
        }),
        supabase.rpc('get_provider_revenue', {
          p_provider_id: providerId, p_since: prevSince, p_until: since,
          p_shop_id: shopFilter, p_customer_id: custFilter,
        }),
      ])

      if (current?.success) {
        setData(current)
        // Reset currency filter if the selected currency no longer exists
        if (currencyFilter !== 'all') {
          const codes = (current.by_currency || []).map(c => c.currency_code)
          if (!codes.includes(currencyFilter)) setCurrencyFilter('all')
        }
      } else { setError(current?.error || 'Failed to load revenue data') }
      if (prev?.success) setPrevData(prev)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  // ── Currency-aware helpers ──────────────────────────────────────────

  const fmt = (amount, cc = 'KES') =>
    `${cc} ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const currencies = data?.by_currency || []
  const activeCurrency = currencyFilter !== 'all' ? currencyFilter : (currencies[0]?.currency_code || 'KES')
  const hasMultipleCurrencies = currencies.length > 1

  // Revenue for the active currency (or total if "all" and single currency)
  const currencyRevenue = (d) => {
    if (!d?.by_currency) return 0
    if (currencyFilter !== 'all') {
      const match = d.by_currency.find(c => c.currency_code === currencyFilter)
      return Number(match?.total_revenue || 0)
    }
    // If single currency, return its total; if multiple, show sum (user should pick a currency)
    if (d.by_currency.length === 1) return Number(d.by_currency[0].total_revenue || 0)
    return d.by_currency.reduce((s, c) => s + Number(c.total_revenue || 0), 0)
  }

  const currencyReceipts = (d) => {
    if (!d?.by_currency) return 0
    if (currencyFilter !== 'all') {
      const match = d.by_currency.find(c => c.currency_code === currencyFilter)
      return Number(match?.receipt_count || 0)
    }
    return d.by_currency.reduce((s, c) => s + Number(c.receipt_count || 0), 0)
  }

  const trendPct = (curr, prev) => prev === 0 ? null : Math.round(((curr - prev) / prev) * 100)

  const formatDay = (ds) => {
    const d = new Date(ds + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  const formatMonth = (ms) => {
    const [y, m] = ms.split('-')
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]} ${y.slice(2)}`
  }

  // Filter daily/monthly by selected currency
  const filterByCurrency = (rows) => {
    if (!rows) return []
    if (currencyFilter !== 'all') return rows.filter(r => r.currency_code === currencyFilter)
    if (currencies.length === 1) return rows.filter(r => r.currency_code === currencies[0].currency_code)
    return rows // all currencies — will aggregate
  }

  const dailyChartData = () => {
    const filtered = filterByCurrency(data?.daily)
    const byDay = {}
    filtered.forEach(d => { byDay[d.day] = (byDay[d.day] || 0) + Number(d.amount || 0) })
    return Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b))
      .map(([day, value]) => ({ label: formatDay(day), value }))
  }

  const monthlyChartData = () => {
    const filtered = filterByCurrency(data?.monthly)
    const byMonth = {}
    filtered.forEach(d => { byMonth[d.month] = (byMonth[d.month] || 0) + Number(d.amount || 0) })
    return Object.entries(byMonth).sort(([a],[b]) => a.localeCompare(b))
      .map(([month, value]) => ({ label: formatMonth(month), value }))
  }

  const paymentDonutData = () => {
    if (!data?.by_payment_method) return { items: [], total: 0 }
    // by_payment_method doesn't have currency_code, so it's always a cross-currency aggregate
    // This is acceptable since payment method distribution is conceptually currency-agnostic
    const items = data.by_payment_method.map(p => ({
      label: getPaymentColor(p.method).label,
      value: Number(p.total || 0),
      color: getPaymentColor(p.method).hex,
    }))
    return { items, total: items.reduce((s, i) => s + i.value, 0) }
  }

  const shopDonutData = () => {
    if (!data?.by_shop) return { items: [], total: 0 }
    const colors = ['#8b5cf6','#6366f1','#a855f7','#c084fc','#7c3aed','#4f46e5']
    const filtered = currencyFilter !== 'all'
      ? data.by_shop.filter(s => s.currency_code === currencyFilter)
      : currencies.length === 1
        ? data.by_shop.filter(s => s.currency_code === currencies[0].currency_code)
        : data.by_shop
    const byShop = {}
    filtered.forEach(s => {
      const k = s.shop_id || 'x'
      if (!byShop[k]) byShop[k] = { label: s.shop_name || 'No Shop', value: 0 }
      byShop[k].value += Number(s.total || 0)
    })
    const items = Object.values(byShop).sort((a, b) => b.value - a.value)
      .map((s, i) => ({ ...s, color: colors[i % colors.length] }))
    return { items, total: items.reduce((s, i) => s + i.value, 0) }
  }

  // Customer list from RPC (deduplicated, uses issued_to_user_id)
  const customerList = data?.customer_list || []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign size={24} className="text-green-600" /> Revenue
          </h1>
          <p className="text-sm text-gray-500 mt-1">Paid receipts and revenue breakdown</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Customer filter */}
          {customerList.length > 0 && (
            <div className="relative">
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 appearance-none bg-white">
                <option value="all">All Customers</option>
                {customerList.map(c => <option key={c.user_id} value={c.user_id}>{c.customer_name}</option>)}
              </select>
              <Users size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          {/* Shop filter */}
          {shops.length > 1 && (
            <div className="relative">
              <select value={shopId} onChange={e => setShopId(e.target.value)}
                className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 appearance-none bg-white">
                <option value="all">All Shops</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Store size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          {/* Currency filter (only when multiple currencies exist) */}
          {hasMultipleCurrencies && (
            <div className="relative">
              <select value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}
                className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 appearance-none bg-white">
                <option value="all">All Currencies</option>
                {currencies.map(c => <option key={c.currency_code} value={c.currency_code}>{c.currency_code}</option>)}
              </select>
              <Coins size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          {/* Period filter */}
          <div className="relative">
            <select value={days} onChange={e => setDays(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 appearance-none bg-white">
              {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-sm">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin text-green-600" size={32} />
        </div>
      ) : data && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={DollarSign} label="Total Revenue"
              value={fmt(currencyRevenue(data), activeCurrency)}
              color="bg-green-100" iconColor="text-green-600"
              trend={trendPct(currencyRevenue(data), currencyRevenue(prevData))} />
            <StatCard icon={Receipt} label="Paid Receipts"
              value={currencyReceipts(data)}
              color="bg-blue-100" iconColor="text-blue-600"
              trend={trendPct(currencyReceipts(data), currencyReceipts(prevData))} />
            <StatCard icon={CreditCard} label="Avg per Receipt"
              value={fmt(currencyReceipts(data) > 0 ? currencyRevenue(data) / currencyReceipts(data) : 0, activeCurrency)}
              color="bg-purple-100" iconColor="text-purple-600" />
            <StatCard icon={TrendingUp} label="Currencies"
              value={currencies.length || 1}
              sub={currencies.map(c => c.currency_code).join(', ')}
              color="bg-amber-100" iconColor="text-amber-600" />
          </div>

          {/* Revenue by Currency cards (always shown when multiple currencies) */}
          {hasMultipleCurrencies && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Coins size={15} className="text-gray-400" /> Revenue by Currency
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currencies.map((c, i) => (
                  <button key={i} onClick={() => setCurrencyFilter(currencyFilter === c.currency_code ? 'all' : c.currency_code)}
                    className={`bg-gray-50 rounded-lg p-4 text-left transition-all ${
                      currencyFilter === c.currency_code ? 'ring-2 ring-green-500 bg-green-50' : 'hover:bg-gray-100'
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-gray-900">{c.currency_code}</span>
                      <span className="text-xs text-gray-400">{c.receipt_count} receipt{c.receipt_count !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-xl font-bold text-green-700">
                      {c.currency_symbol || c.currency_code} {Number(c.total_revenue).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{c.wo_count} work order{c.wo_count !== 1 ? 's' : ''}</p>
                  </button>
                ))}
              </div>
              {currencyFilter !== 'all' && (
                <p className="text-xs text-green-600 mt-3 text-center">
                  Filtering charts by {currencyFilter} · <button onClick={() => setCurrencyFilter('all')} className="underline">Show all</button>
                </p>
              )}
            </div>
          )}

          {/* Daily Revenue Chart */}
          {dailyChartData().length > 1 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">Daily Revenue</p>
                <p className="text-base font-bold text-green-700">{fmt(currencyRevenue(data), activeCurrency)}</p>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Paid receipts per day{currencyFilter !== 'all' ? ` (${currencyFilter})` : ''} — scroll for more
              </p>
              <BarChart entries={dailyChartData()} formatAmount={v => fmt(v, activeCurrency)} />
            </div>
          )}

          {/* Monthly Revenue Chart */}
          {monthlyChartData().length > 1 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-900 mb-1">Monthly Revenue Trend</p>
              <p className="text-xs text-gray-400 mb-3">
                Revenue by month{currencyFilter !== 'all' ? ` (${currencyFilter})` : ''}
              </p>
              <BarChart entries={monthlyChartData()} formatAmount={v => fmt(v, activeCurrency)}
                color="#4ade80" hoverColor="#22c55e" />
            </div>
          )}

          {/* Payment Method + Shop Revenue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard size={15} className="text-gray-400" /> Payment Methods
              </h2>
              <DonutChart items={paymentDonutData().items} total={paymentDonutData().total}
                formatAmount={v => fmt(v, activeCurrency)} />
            </div>

            {shopDonutData().items.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Store size={15} className="text-purple-500" /> Revenue by Shop
                </h2>
                <DonutChart items={shopDonutData().items} total={shopDonutData().total}
                  formatAmount={v => fmt(v, activeCurrency)} />
              </div>
            )}
          </div>

          {/* Top Customers + Top Companies */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Crown size={15} className="text-amber-500" /> Top Paying Customers
              </h2>
              {!data.top_customers?.length ? (
                <p className="text-sm text-gray-400 text-center py-6">No customer data yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.top_customers.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                        i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-gray-300'
                      }`}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.customer_name}</p>
                        <p className="text-xs text-gray-400">{c.receipt_count} receipt{c.receipt_count !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-semibold text-green-700 flex-shrink-0">{fmt(c.total_paid, activeCurrency)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 size={15} className="text-blue-500" /> Top Paying Companies
              </h2>
              {!data.top_companies?.length ? (
                <p className="text-sm text-gray-400 text-center py-6">No company data yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.top_companies.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                        i === 0 ? 'bg-blue-600' : i === 1 ? 'bg-blue-400' : i === 2 ? 'bg-blue-300' : 'bg-gray-300'
                      }`}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.company_name}</p>
                        <p className="text-xs text-gray-400">{c.receipt_count} receipt{c.receipt_count !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-semibold text-green-700 flex-shrink-0">{fmt(c.total_paid, activeCurrency)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Receipts Table */}
          {data.recent_receipts?.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Receipt size={15} className="text-gray-400" /> Recent Receipts
              </h2>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-500 py-2 px-2">Receipt #</th>
                      <th className="text-left text-xs font-medium text-gray-500 py-2 px-2">Paid By</th>
                      <th className="text-left text-xs font-medium text-gray-500 py-2 px-2">WO #</th>
                      <th className="text-left text-xs font-medium text-gray-500 py-2 px-2">Method</th>
                      <th className="text-right text-xs font-medium text-gray-500 py-2 px-2">Amount</th>
                      <th className="text-left text-xs font-medium text-gray-500 py-2 px-2">Shop</th>
                      <th className="text-left text-xs font-medium text-gray-500 py-2 px-2">Date</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_receipts.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-2 font-mono text-xs text-gray-600">{r.receipt_number || '—'}</td>
                        <td className="py-2.5 px-2 text-gray-700 truncate max-w-[140px]">{r.paid_by_name}</td>
                        <td className="py-2.5 px-2 font-mono text-xs text-gray-500">{r.work_order_number || '—'}</td>
                        <td className="py-2.5 px-2">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getPaymentColor(r.payment_method).hex }} />
                            {getPaymentColor(r.payment_method).label}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-gray-900">
                          {(r.currency_symbol || r.currency_code)} {Number(r.amount_paid).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 text-xs text-gray-500 truncate max-w-[100px]">{r.shop_name || '—'}</td>
                        <td className="py-2.5 px-2 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(r.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`inline-block w-2 h-2 rounded-full ${r.confirmed ? 'bg-green-500' : 'bg-yellow-400'}`}
                            title={r.confirmed ? 'Confirmed' : 'Unconfirmed'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}